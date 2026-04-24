import { useState, useCallback, useRef } from "react";
import { callAI } from "../lib/ai";
import { authFetch } from "../lib/authFetch";
import { getEmbedHeaders } from "../lib/aiSettings";
import { encryptEntry } from "../lib/crypto";
import { extractTextFromFile } from "../lib/fileExtract";
import { parseAISplitResponse } from "../lib/fileSplitter";
import { parseVCF } from "../lib/vcfParser";
import { runContactPipeline, contactToEntryPayload } from "../lib/contactPipeline";
import { PROMPTS } from "../config/prompts";
import { showToast } from "../lib/notifications";
import { recordDecision } from "../lib/learningEngine";
import { parseTask } from "../lib/nlpParser";
import type { Entry } from "../types";

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

interface ParsedEntry {
  title: string;
  content?: string;
  type?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  confidence?: Record<string, string>;
  _raw?: string;
}

interface UploadedFile {
  name: string;
  content: string;
}

interface UseCaptureSheetParseOptions {
  brainId?: string;
  isOnline: boolean;
  cryptoKey?: CryptoKey | null;
  onCreated: (entry: Entry) => void;
  onClose: () => void;
  onBackgroundSave?: (entry: {
    title: string;
    content: string;
    type: string;
    tags: string[];
    metadata: Record<string, any>;
    rawContent?: string;
  }) => void;
}

export function useCaptureSheetParse({
  brainId,
  isOnline,
  cryptoKey,
  onCreated,
  onClose,
  onBackgroundSave,
}: UseCaptureSheetParseOptions) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [fileParseError, setFileParseError] = useState<string | null>(null);
  const failedFileRef = useRef<{ file: File; isImage: boolean } | null>(null);
  const [preview, setPreview] = useState<ParsedEntry | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewTags, setPreviewTags] = useState("");
  const [previewType, setPreviewType] = useState("note");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const rawContentRef = useRef<string>("");

  const resetState = useCallback(() => {
    setStatus(null);
    setErrorDetail(null);
    setPreview(null);
    setPreviewTitle("");
    setPreviewTags("");
    setPreviewType("note");
    setUploadedFiles([]);
  }, []);

  const removeUploadedFile = useCallback((name: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.name !== name));
  }, []);

  // Build combined input: user text + file contents (truncated to avoid overwhelming the model)
  const FILE_CONTENT_LIMIT = 6000;
  const buildInput = useCallback(
    (text: string) => {
      const parts: string[] = [];
      if (text.trim()) parts.push(text.trim());
      for (const f of uploadedFiles) {
        const content =
          f.content.length > FILE_CONTENT_LIMIT
            ? f.content.slice(0, FILE_CONTENT_LIMIT) + "\n…[truncated]"
            : f.content;
        parts.push(`[File: ${f.name}]\n${content}`);
      }
      return parts.join("\n\n");
    },
    [uploadedFiles],
  );

  const doSave = useCallback(
    async (parsed: ParsedEntry, rawContent?: string) => {
      setPreview(null);
      setLoading(true);
      setStatus("saving");
      setErrorDetail(null);
      try {
        // ── Secret → encrypted vault_entries table ──
        if (parsed.type === "secret") {
          if (!cryptoKey) {
            setErrorDetail("Vault is locked — unlock your vault first, then try again");
            setStatus("error");
            setLoading(false);
            return;
          }
          const encrypted = await encryptEntry(
            { content: parsed.content || "", metadata: parsed.metadata || {} },
            cryptoKey,
          );
          const res = await authFetch("/api/vault-entries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: parsed.title,
              content: encrypted.content,
              metadata: typeof encrypted.metadata === "string" ? encrypted.metadata : "",
              tags: parsed.tags || [],
              ...(brainId ? { brain_id: brainId } : {}),
            }),
          });
          if (res.ok) {
            setUploadedFiles([]);
            setStatus("saved");
            setTimeout(() => {
              setStatus(null);
              onClose();
            }, 700);
          } else {
            const errBody = await res.text().catch(() => "(no body)");
            setErrorDetail(`[vault] HTTP ${res.status} — ${errBody}`);
            setStatus("error");
          }
          setLoading(false);
          return;
        }

        // ── Regular entry → background save (close immediately, show toast) ──
        if (onBackgroundSave) {
          const metaWithConfidence = {
            ...(parsed.metadata || {}),
            ...(parsed.confidence ? { confidence: parsed.confidence } : {}),
          };
          onBackgroundSave({
            title: parsed.title,
            content: parsed.content || "",
            type: parsed.type || "note",
            tags: parsed.tags || [],
            metadata: metaWithConfidence,
            rawContent,
          });
          setUploadedFiles([]);
          setLoading(false);
          setStatus(null);
          onClose();
          return;
        }

        // ── Regular entry → entries table ──
        const embedHeaders = getEmbedHeaders();
        const metaWithConfidence = {
          ...(parsed.metadata || {}),
          ...(parsed.confidence ? { confidence: parsed.confidence } : {}),
          ...(rawContent && rawContent.length > 150
            ? { raw_content: rawContent.slice(0, 8000) }
            : {}),
        };
        const res = await authFetch("/api/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(embedHeaders || {}) },
          body: JSON.stringify({
            p_title: parsed.title,
            p_content: parsed.content || "",
            p_type: parsed.type || "note",
            p_metadata: metaWithConfidence,
            p_tags: parsed.tags || [],
            p_brain_id: brainId,
          }),
        });
        if (res.ok) {
          const result = await res.json();
          if (result.embed_error) console.error("[capture:embed] failed →", result.embed_error);
          const newEntry: Entry = {
            id: result?.id || Date.now().toString(),
            title: parsed.title,
            content: parsed.content || "",
            type: (parsed.type || "note") as Entry["type"],
            metadata: {
              ...metaWithConfidence,
              enrichment: { embedded: !result.embed_error, concepts_count: 0, has_insight: false },
            },
            pinned: false,
            importance: 0,
            tags: parsed.tags || [],
            created_at: new Date().toISOString(),
          } as Entry;
          onCreated(newEntry);
          setUploadedFiles([]);
          setStatus("saved");
          setTimeout(() => {
            setStatus(null);
            onClose();
          }, 700);
        } else {
          const errBody = await res.text().catch(() => "(no body)");
          const msg = `[capture] HTTP ${res.status} — ${errBody}`;
          console.error(msg);
          setErrorDetail(msg);
          setStatus("error");
        }
      } catch (e: any) {
        const msg = `[capture] ${e?.message || String(e)}`;
        console.error(msg);
        setErrorDetail(msg);
        setStatus("error");
      }
      setLoading(false);
    },
    [brainId, cryptoKey, onCreated, onClose],
  );

  const capture = useCallback(
    async (text: string, clearText: () => void) => {
      const input = buildInput(text);
      if (!input) return;
      rawContentRef.current = input;
      clearText();
      setLoading(true);
      setStatus("thinking");
      setErrorDetail(null);

      if (!isOnline) {
        const nlp = parseTask(input);
        const offlineMeta: Record<string, unknown> = {};
        if (nlp.dueDate) offlineMeta.due_date = nlp.dueDate;
        if (nlp.dayOfMonth) offlineMeta.day_of_month = nlp.dayOfMonth;
        if (nlp.priority) offlineMeta.priority = nlp.priority;
        if (nlp.energy) offlineMeta.energy = nlp.energy;
        await doSave(
          {
            title: nlp.cleanTitle || input.slice(0, 60),
            content: input,
            type: "note",
            tags: nlp.tags,
            metadata: offlineMeta,
          },
          input,
        );
        return;
      }

      try {
        const hasFiles = uploadedFiles.length > 0;
        const hasMultipleFiles = uploadedFiles.length > 1;
        const todayISO = new Date().toISOString().slice(0, 10);
        const basePrompt = hasMultipleFiles ? PROMPTS.FILE_SPLIT : PROMPTS.CAPTURE;
        const res = await callAI({
          system: `Today's date is ${todayISO}.\n\n${basePrompt}`,
          max_tokens: 4000,
          brainId,
          messages: [{ role: "user", content: input }],
        });
        const data = await res.json();

        if (!res.ok) {
          const errMsg =
            data?.error?.message ||
            (typeof data?.error === "string" ? data.error : null) ||
            `AI error ${res.status}`;
          console.error("[useCaptureSheetParse] AI error:", errMsg);
          // Show edit preview on AI failure so user can save manually
          setLoading(false);
          setStatus(null);
          showToast(
            "AI couldn\u2019t classify this entry. You can edit and save it manually \u2014 it\u2019ll be refined next time you run Improve Brain.",
            "info",
          );
          setPreviewTitle("");
          setPreviewTags("");
          setPreviewType("note");
          setPreview({
            title: "",
            content: input,
            type: "note",
            tags: [],
            metadata: {},
            _raw: input,
          });
          return;
        }

        let parsedRaw: ParsedEntry | ParsedEntry[] = { title: "" };
        let parseError = "";
        let aiRawText = "";
        try {
          aiRawText = data.content?.[0]?.text || data.choices?.[0]?.message?.content || "";
          console.log("[useCaptureSheetParse] AI raw:", aiRawText.slice(0, 300));
          if (!aiRawText) {
            parseError = "Model returned empty response";
          } else if (hasFiles) {
            const entries = parseAISplitResponse(aiRawText);
            parsedRaw = entries.length > 0 ? entries : { title: "" };
          } else {
            // Extract JSON from response — model may wrap it in prose or code blocks
            const stripped = aiRawText.replace(/```json|```/g, "").trim();
            const jsonMatch = stripped.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
            parsedRaw = JSON.parse(jsonMatch ? jsonMatch[1] : stripped);
          }
        } catch (err: any) {
          parseError = err?.message || String(err);
          console.error("[useCaptureSheetParse] parse error:", parseError);
        }

        if (Array.isArray(parsedRaw) && parsedRaw.length === 1) {
          const single = parsedRaw[0];
          if (single.title) {
            // AI classified successfully — save immediately
            await doSave(single, rawContentRef.current);
            return;
          }
          // No title — fall through to manual preview
          setLoading(false);
          setStatus(null);
          showToast(
            "AI couldn\u2019t classify this entry. You can edit and save it manually \u2014 it\u2019ll be refined next time you run Improve Brain.",
            "info",
          );
          setPreviewTitle("");
          setPreviewTags((single.tags || []).join(", "));
          setPreviewType(single.type || "note");
          setPreview({ ...single, _raw: input });
          return;
        }

        if (Array.isArray(parsedRaw) && parsedRaw.length > 1) {
          setLoading(false);
          setStatus(`Saving ${parsedRaw.length} entries…`);
          for (const entry of parsedRaw) {
            try {
              const entryMeta = entry.confidence
                ? { ...(entry.metadata || {}), confidence: entry.confidence }
                : entry.metadata || {};
              const res2 = await authFetch("/api/capture", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...(getEmbedHeaders() || {}) },
                body: JSON.stringify({
                  p_title: entry.title,
                  p_content: entry.content || "",
                  p_type: entry.type || "note",
                  p_metadata: entryMeta,
                  p_tags: entry.tags || [],
                  p_brain_id: brainId,
                }),
              });
              if (res2.ok) {
                const result = await res2.json();
                onCreated({
                  id: result?.id || Date.now().toString(),
                  title: entry.title,
                  content: entry.content || "",
                  type: (entry.type || "note") as Entry["type"],
                  metadata: {
                    ...(entry.metadata || {}),
                    enrichment: {
                      embedded: !result.embed_error,
                      concepts_count: 0,
                      has_insight: false,
                    },
                  },
                  pinned: false,
                  importance: 0,
                  tags: entry.tags || [],
                  created_at: new Date().toISOString(),
                } as Entry);
              }
            } catch (err) {
              console.error("[useCaptureSheetParse]", err);
            }
          }
          setUploadedFiles([]);
          setStatus("saved");
          setTimeout(() => {
            setStatus(null);
            onClose();
          }, 700);
          return;
        }

        const parsed = parsedRaw as ParsedEntry;
        if (parsed.title) {
          // AI classification succeeded — save immediately, no preview needed
          await doSave(parsed, rawContentRef.current);
          return;
        }
        // JSON parsed but no title, or parse failed — show edit preview so user can save manually
        setLoading(false);
        setStatus(null);
        showToast(
          "AI couldn\u2019t classify this entry. You can edit and save it manually \u2014 it\u2019ll be refined next time you run Improve Brain.",
          "info",
        );
        setPreviewTitle("");
        setPreviewTags("");
        setPreviewType("note");
        setPreview({
          title: "",
          content: input,
          type: "note",
          tags: [],
          metadata: {},
          _raw: input,
        });
      } catch (e: any) {
        const msg = `[ai] ${e?.message || String(e)}`;
        console.error(msg);
        setErrorDetail(msg);
        setStatus("error");
        setLoading(false);
        clearText();
      }
    },
    [brainId, isOnline, doSave, onCreated, onClose, buildInput],
  );

  const confirmSave = useCallback(
    (onRestoreText?: (text: string) => void) => {
      if (!preview || !previewTitle.trim()) return;
      const editedTags = previewTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      // Record what the user overrode vs what the AI originally suggested —
      // feeds learningEngine so future prompts adapt to this user's corrections.
      if (brainId) {
        const aiTitle = preview.title ?? "";
        const aiType = preview.type ?? "note";
        const aiTagsNorm = [...(preview.tags ?? [])]
          .map((t) => String(t).trim())
          .sort()
          .join(",");
        const userTagsNorm = [...editedTags].sort().join(",");

        if (aiTitle && previewTitle.trim() !== aiTitle) {
          recordDecision(brainId, {
            source: "capture",
            type: "TITLE_EDIT",
            action: "edit",
            field: "title",
            originalValue: aiTitle,
            finalValue: previewTitle.trim(),
          });
        }
        if (previewType !== aiType) {
          recordDecision(brainId, {
            source: "capture",
            type: "TYPE_MISMATCH",
            action: "edit",
            field: "type",
            originalValue: aiType,
            finalValue: previewType,
          });
        }
        if (userTagsNorm !== aiTagsNorm) {
          recordDecision(brainId, {
            source: "capture",
            type: "TAG_EDIT",
            action: "edit",
            field: "tags",
            originalValue: aiTagsNorm,
            finalValue: userTagsNorm,
          });
        }
      }

      doSave(
        {
          ...preview,
          title: previewTitle.trim(),
          type: previewType,
          tags: editedTags,
        },
        rawContentRef.current,
      );
      void onRestoreText;
    },
    [preview, previewTitle, previewTags, previewType, doSave, brainId],
  );

  // Extract text from image via configured AI model — stores as uploaded file chip
  const handleImageFile = useCallback(async (file: File) => {
    if (!file) return;
    if (file.size > IMAGE_MAX_BYTES) {
      setErrorDetail("Image too large (max 5 MB)");
      return;
    }
    setLoading(true);
    setStatus("reading");
    setErrorDetail(null);
    setFileParseError(null);
    try {
      const extracted = await extractTextFromFile(file);
      if (extracted.trim()) {
        setUploadedFiles((prev) => [...prev, { name: file.name, content: extracted.trim() }]);
      } else {
        failedFileRef.current = { file, isImage: true };
        setFileParseError(file.name);
        setErrorDetail("No text could be extracted from this image.");
      }
    } catch (e: any) {
      failedFileRef.current = { file, isImage: true };
      setFileParseError(file.name);
      setErrorDetail(e?.message || "Extraction failed.");
    }
    setLoading(false);
    setStatus(null);
  }, []);

  // VCF contacts file — parse → AI categorize → save each contact through the
  // identical path as a normal multi-entry capture so embedding, concept
  // extraction, insight, and connection finding all fire via onCreated.
  const handleVcfFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setErrorDetail(null);
      try {
        setStatus(`Parsing ${file.name}…`);
        const raw = new TextDecoder().decode(await file.arrayBuffer());
        const parsed = parseVCF(raw);
        if (parsed.length === 0) {
          setErrorDetail("No contacts found in VCF file");
          setLoading(false);
          setStatus(null);
          return;
        }

        setStatus(`Categorising ${parsed.length} contacts with AI…`);
        const result = await runContactPipeline(parsed, parsed.length);
        const { contacts, insights } = result;

        setStatus(`Saving ${contacts.length} contacts…`);
        const embedHeaders = getEmbedHeaders() ?? {};
        let saved = 0;
        let failed = 0;

        for (const contact of contacts) {
          try {
            const res = await authFetch("/api/capture", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...embedHeaders },
              body: JSON.stringify(contactToEntryPayload(contact, brainId)),
            });
            if (res.ok) {
              const data = await res.json();
              // Same onCreated call as the normal multi-entry path — triggers
              // concept extraction, insight generation, and connection finding
              onCreated({
                id: data?.id || Date.now().toString(),
                title: contact.name,
                content: "",
                type: "person" as Entry["type"],
                metadata: {
                  phone: contact.phones[0],
                  category: contact.category,
                },
                pinned: false,
                importance: 0,
                tags: contact.tags,
                created_at: new Date().toISOString(),
              } as Entry);
              saved++;
            } else {
              console.error(`[vcf] Failed to save "${contact.name}": HTTP ${res.status}`);
              failed++;
            }
          } catch (err) {
            console.error(`[vcf] Error saving "${contact.name}":`, err);
            failed++;
          }
        }

        const topCat = insights.top_categories[0]?.category ?? "";
        const summary = [
          `${saved} contact${saved !== 1 ? "s" : ""} saved`,
          failed ? `${failed} failed` : null,
          insights.duplicates_removed ? `${insights.duplicates_removed} duplicates skipped` : null,
          topCat ? `top category: ${topCat.replace(/_/g, " ")}` : null,
        ]
          .filter(Boolean)
          .join(" · ");

        showToast(summary, "success");
        setStatus("saved");
        setTimeout(() => {
          setStatus(null);
          onClose();
        }, 700);
      } catch (e: any) {
        const msg = `[vcf] ${e?.message || String(e)}`;
        console.error(msg);
        setErrorDetail(msg);
        setStatus("error");
      }
      setLoading(false);
    },
    [brainId, onCreated, onClose],
  );

  // Extract text from doc/pdf/excel — stores as uploaded file chip
  const handleDocFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        const name = file.name.toLowerCase();
        if (name.endsWith(".vcf") || file.type === "text/vcard" || file.type === "text/x-vcard") {
          await handleVcfFile(file);
          continue;
        }
        if (file.type.startsWith("image/")) {
          await handleImageFile(file);
          continue;
        }
        setLoading(true);
        setStatus(`Reading ${file.name}…`);
        setErrorDetail(null);
        setFileParseError(null);
        try {
          const text = await extractTextFromFile(file);
          if (text.trim()) {
            setUploadedFiles((prev) => [...prev, { name: file.name, content: text.trim() }]);
          } else {
            failedFileRef.current = { file, isImage: false };
            setFileParseError(file.name);
            setErrorDetail("No content could be read from this file.");
          }
        } catch (e: any) {
          console.error(`[fileExtract:${file.name}]`, e);
          failedFileRef.current = { file, isImage: false };
          setFileParseError(file.name);
          setErrorDetail(e?.message || "Could not read file.");
        }
        setLoading(false);
        setStatus(null);
      }
    },
    [handleImageFile, handleVcfFile],
  );

  const retryLastFile = useCallback(async () => {
    if (!failedFileRef.current) return;
    const { file, isImage } = failedFileRef.current;
    setFileParseError(null);
    setErrorDetail(null);
    if (isImage) await handleImageFile(file);
    else await handleDocFiles([file] as unknown as FileList);
  }, [handleImageFile, handleDocFiles]);

  return {
    loading,
    setLoading,
    status,
    setStatus,
    errorDetail,
    setErrorDetail,
    fileParseError,
    setFileParseError,
    retryLastFile,
    preview,
    setPreview,
    previewTitle,
    setPreviewTitle,
    previewTags,
    setPreviewTags,
    previewType,
    setPreviewType,
    uploadedFiles,
    removeUploadedFile,
    resetState,
    capture,
    doSave,
    confirmSave,
    handleImageFile,
    handleDocFiles,
  };
}
