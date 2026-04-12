import { useState, useCallback } from "react";
import { callAI } from "../lib/ai";
import { authFetch } from "../lib/authFetch";
import { getEmbedHeaders } from "../lib/aiSettings";
import { encryptEntry } from "../lib/crypto";
import { extractTextFromFile } from "../lib/fileExtract";
import { parseAISplitResponse } from "../lib/fileSplitter";
import { PROMPTS } from "../config/prompts";
import { showToast } from "../lib/notifications";
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

export interface UploadedFile {
  name: string;
  content: string;
}

interface UseCaptureSheetParseOptions {
  brainId?: string;
  isOnline: boolean;
  cryptoKey?: CryptoKey | null;
  onCreated: (entry: Entry) => void;
  onClose: () => void;
}

export function useCaptureSheetParse({
  brainId,
  isOnline,
  cryptoKey,
  onCreated,
  onClose,
}: UseCaptureSheetParseOptions) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedEntry | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewTags, setPreviewTags] = useState("");
  const [previewType, setPreviewType] = useState("note");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

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
    async (parsed: ParsedEntry) => {
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

        // ── Regular entry → entries table ──
        const embedHeaders = getEmbedHeaders();
        const metaWithConfidence = parsed.confidence
          ? { ...(parsed.metadata || {}), confidence: parsed.confidence }
          : parsed.metadata || {};
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
            metadata: metaWithConfidence,
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
      clearText();
      setLoading(true);
      setStatus("thinking");
      setErrorDetail(null);

      if (!isOnline) {
        await doSave({
          title: input.slice(0, 60),
          content: input,
          type: "note",
          tags: [],
          metadata: {},
        });
        return;
      }

      try {
        const hasMultipleFiles = uploadedFiles.length > 1;
        const res = await callAI({
          system: hasMultipleFiles ? PROMPTS.FILE_SPLIT : PROMPTS.CAPTURE,
          max_tokens: uploadedFiles.length > 0 ? 2000 : 800,
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
          } else if (hasMultipleFiles) {
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
            await doSave(single);
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
                  metadata: entry.metadata || {},
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
          await doSave(parsed);
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
      doSave({
        ...preview,
        title: previewTitle.trim(),
        type: previewType,
        tags: previewTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      void onRestoreText;
    },
    [preview, previewTitle, previewTags, previewType, doSave],
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
    try {
      const extracted = await extractTextFromFile(file);
      if (extracted.trim()) {
        setUploadedFiles((prev) => [...prev, { name: file.name, content: extracted.trim() }]);
      } else {
        setErrorDetail("[image] No text extracted");
      }
    } catch (e: any) {
      setErrorDetail(`[image] ${e?.message || String(e)}`);
    }
    setLoading(false);
    setStatus(null);
  }, []);

  // Extract text from doc/pdf/excel — stores as uploaded file chip
  const handleDocFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        if (file.type.startsWith("image/")) {
          await handleImageFile(file);
          continue;
        }
        setLoading(true);
        setStatus(`Reading ${file.name}…`);
        setErrorDetail(null);
        try {
          const text = await extractTextFromFile(file);
          if (text.trim()) {
            setUploadedFiles((prev) => [...prev, { name: file.name, content: text.trim() }]);
          } else {
            setErrorDetail(`No text found in ${file.name}`);
          }
        } catch (e: any) {
          console.error(`[fileExtract:${file.name}]`, e);
          setErrorDetail(`[${file.name}] ${e?.message || String(e)}`);
        }
        setLoading(false);
        setStatus(null);
      }
    },
    [handleImageFile],
  );

  return {
    loading,
    setLoading,
    status,
    setStatus,
    errorDetail,
    setErrorDetail,
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
