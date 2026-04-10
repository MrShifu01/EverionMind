import { useState, useCallback } from "react";
import { callAI } from "../lib/ai";
import { authFetch } from "../lib/authFetch";
import { getEmbedHeaders } from "../lib/aiSettings";
import { extractTextFromFile } from "../lib/fileExtract";
import { parseAISplitResponse } from "../lib/fileSplitter";
import { PROMPTS } from "../config/prompts";
import type { Entry } from "../types";

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

interface ParsedEntry {
  title: string;
  content?: string;
  type?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  _raw?: string;
}

export interface UploadedFile {
  name: string;
  content: string;
}

interface UseCaptureSheetParseOptions {
  brainId?: string;
  isOnline: boolean;
  onCreated: (entry: Entry) => void;
  onClose: () => void;
}

export function useCaptureSheetParse({
  brainId,
  isOnline,
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

  // Build combined input: user text + file contents
  const buildInput = useCallback(
    (text: string) => {
      const parts: string[] = [];
      if (text.trim()) parts.push(text.trim());
      for (const f of uploadedFiles) {
        parts.push(`[File: ${f.name}]\n${f.content}`);
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
        const embedHeaders = getEmbedHeaders();
        console.log("[capture:embed] headers →", embedHeaders
          ? { provider: embedHeaders["X-Embed-Provider"], model: embedHeaders["X-Embed-Model"] ?? "(default)", hasKey: !!embedHeaders["X-Embed-Key"] }
          : "none — embedding will be skipped");
        const res = await authFetch("/api/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(embedHeaders || {}) },
          body: JSON.stringify({
            p_title: parsed.title,
            p_content: parsed.content || "",
            p_type: parsed.type || "note",
            p_metadata: parsed.metadata || {},
            p_tags: parsed.tags || [],
            p_brain_id: brainId,
          }),
        });
        if (res.ok) {
          const result = await res.json();
          if (result.embed_error) {
            console.error("[capture:embed] failed →", result.embed_error);
          } else {
            console.log("[capture:embed] success");
          }
          const newEntry: Entry = {
            id: result?.id || Date.now().toString(),
            title: parsed.title,
            content: parsed.content || "",
            type: (parsed.type || "note") as Entry["type"],
            metadata: parsed.metadata || {},
            pinned: false,
            importance: 0,
            tags: parsed.tags || [],
            created_at: new Date().toISOString(),
          } as Entry;
          onCreated(newEntry);
          setUploadedFiles([]);
          setStatus("saved");
          setTimeout(() => { setStatus(null); onClose(); }, 700);
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
    [brainId, onCreated, onClose],
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
        await doSave({ title: input.slice(0, 60), content: input, type: "note", tags: [], metadata: {} });
        return;
      }

      try {
        const hasFiles = uploadedFiles.length > 0;
        const res = await callAI({
          system: hasFiles ? PROMPTS.FILE_SPLIT : PROMPTS.CAPTURE,
          max_tokens: hasFiles ? 4000 : 800,
          brainId,
          messages: [{ role: "user", content: input }],
        });
        const data = await res.json();

        if (!res.ok) {
          const errMsg = data?.error?.message || (typeof data?.error === "string" ? data.error : null) || `AI error ${res.status}`;
          console.error("[useCaptureSheetParse] AI error:", errMsg);
          // Always show edit preview on AI failure so user can save manually
          setLoading(false);
          setStatus(null);
          setErrorDetail(`AI failed: ${errMsg}`);
          setPreviewTitle("");
          setPreviewTags("");
          setPreviewType("note");
          setPreview({ title: "", content: input, type: "note", tags: [], metadata: {}, _raw: input });
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

        if (Array.isArray(parsedRaw) && parsedRaw.length > 0) {
          setLoading(false);
          setStatus(`Saving ${parsedRaw.length} entries…`);
          for (const entry of parsedRaw) {
            try {
              const res2 = await authFetch("/api/capture", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...(getEmbedHeaders() || {}) },
                body: JSON.stringify({
                  p_title: entry.title,
                  p_content: entry.content || "",
                  p_type: entry.type || "note",
                  p_metadata: entry.metadata || {},
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
            } catch (err) { console.error("[useCaptureSheetParse]", err); }
          }
          setUploadedFiles([]);
          setStatus("saved");
          setTimeout(() => { setStatus(null); onClose(); }, 700);
          return;
        }

        const parsed = parsedRaw as ParsedEntry;
        if (parsed.title) {
          setLoading(false);
          setStatus(null);
          setPreviewTitle(parsed.title);
          setPreviewTags((parsed.tags || []).join(", "));
          setPreviewType(parsed.type || "note");
          setPreview({ ...parsed, _raw: input });
          return;
        }
        // JSON parsed but no title, or parse failed — show edit preview with full debug info
        setLoading(false);
        setStatus(null);
        const debugInfo = parseError
          ? `Parse error: ${parseError} | Raw: "${aiRawText.slice(0, 120)}"`
          : `No title in response | Raw: "${aiRawText.slice(0, 120)}"`;
        setErrorDetail(debugInfo);
        setPreviewTitle("");
        setPreviewTags("");
        setPreviewType("note");
        setPreview({ title: "", content: input, type: "note", tags: [], metadata: {}, _raw: input });
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
        tags: previewTags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      void onRestoreText;
    },
    [preview, previewTitle, previewTags, previewType, doSave],
  );

  // Extract text from image via configured AI model — stores as uploaded file chip
  const handleImageFile = useCallback(
    async (file: File) => {
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
    },
    [],
  );

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
    loading, setLoading,
    status, setStatus,
    errorDetail, setErrorDetail,
    preview, setPreview,
    previewTitle, setPreviewTitle,
    previewTags, setPreviewTags,
    previewType, setPreviewType,
    uploadedFiles, removeUploadedFile,
    resetState,
    capture,
    doSave,
    confirmSave,
    handleImageFile,
    handleDocFiles,
  };
}
