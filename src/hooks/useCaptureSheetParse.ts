import { useState, useCallback } from "react";
import { callAI } from "../lib/ai";
import { aiFetch } from "../lib/aiFetch";
import { authFetch } from "../lib/authFetch";
import { getEmbedHeaders } from "../lib/aiSettings";
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

  const resetState = useCallback(() => {
    setStatus(null);
    setErrorDetail(null);
    setPreview(null);
    setPreviewTitle("");
    setPreviewTags("");
  }, []);

  const doSave = useCallback(
    async (parsed: ParsedEntry) => {
      setPreview(null);
      setLoading(true);
      setStatus("saving");
      setErrorDetail(null);
      try {
        const res = await authFetch("/api/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(getEmbedHeaders() || {}) },
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
          if (result.embed_error) console.error("[useCaptureSheetParse:embed]", result.embed_error);
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
      if (!text.trim()) return;
      const input = text.trim();
      clearText();
      setLoading(true);
      setStatus("thinking");
      setErrorDetail(null);

      if (!isOnline) {
        await doSave({ title: input.slice(0, 60), content: input, type: "note", tags: [], metadata: {} });
        return;
      }

      try {
        const res = await callAI({
          system: PROMPTS.CAPTURE,
          max_tokens: 800,
          brainId,
          messages: [{ role: "user", content: input }],
        });
        const data = await res.json();
        let parsedRaw: ParsedEntry | ParsedEntry[] = { title: "" };
        try {
          parsedRaw = JSON.parse((data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim());
        } catch (err) { console.error("[useCaptureSheetParse]", err); }

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
          setPreview({ ...parsed, _raw: input });
          return;
        }
        await doSave({ title: input.slice(0, 60), content: input, type: "note", tags: [], metadata: {} });
      } catch (e: any) {
        const msg = `[ai] ${e?.message || String(e)}`;
        console.error(msg);
        setErrorDetail(msg);
        setStatus("error");
        setLoading(false);
        clearText();
      }
    },
    [brainId, isOnline, doSave, onCreated, onClose],
  );

  const confirmSave = useCallback(
    (onRestoreText?: (text: string) => void) => {
      if (!preview || !previewTitle.trim()) return;
      doSave({
        ...preview,
        title: previewTitle.trim(),
        tags: previewTags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      void onRestoreText; // captured in closure for future use
    },
    [preview, previewTitle, previewTags, doSave],
  );

  const handleImageFile = useCallback(
    async (file: File, appendText: (extracted: string) => void) => {
      if (!file) return;
      if (file.size > IMAGE_MAX_BYTES) {
        setErrorDetail("Image too large (max 5 MB)");
        return;
      }
      setLoading(true);
      setStatus("reading");
      setErrorDetail(null);
      try {
        const base64 = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res((r.result as string).split(",")[1]);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        const apiRes = await aiFetch("/api/anthropic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            max_tokens: 600,
            messages: [
              {
                role: "user",
                content: [
                  { type: "image", source: { type: "base64", media_type: file.type, data: base64 } },
                  { type: "text", text: "Extract all text from this image. Output just the extracted content, clean and readable. If it's a business card, document, label, or receipt — preserve structure. No commentary." },
                ],
              },
            ],
          }),
        });
        const data = await apiRes.json();
        const extracted = data.content?.[0]?.text?.trim() || "";
        if (extracted) appendText(extracted);
        else setErrorDetail("[image] No text extracted");
      } catch (e: any) {
        setErrorDetail(`[image] ${e?.message || String(e)}`);
      }
      setLoading(false);
      setStatus(null);
    },
    [],
  );

  return {
    loading, setLoading,
    status, setStatus,
    errorDetail, setErrorDetail,
    preview, setPreview,
    previewTitle, setPreviewTitle,
    previewTags, setPreviewTags,
    resetState,
    capture,
    doSave,
    confirmSave,
    handleImageFile,
  };
}
