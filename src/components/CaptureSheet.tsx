import { useState, useRef, useEffect, useCallback } from "react";
import { callAI } from "../lib/ai";
import { aiFetch } from "../lib/aiFetch";
import { authFetch } from "../lib/authFetch";
import { getEmbedHeaders, getGroqKey, getUserApiKey } from "../lib/aiSettings";
import { PROMPTS } from "../config/prompts";
import type { Entry } from "../types";

interface ParsedEntry {
  title: string;
  content?: string;
  type?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  _raw?: string;
}

interface CaptureSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (entry: Entry) => void;
  brainId?: string;
  cryptoKey?: CryptoKey | null;
  isOnline?: boolean;
}

export default function CaptureSheet({
  isOpen,
  onClose,
  onCreated,
  brainId,
  isOnline = true,
}: CaptureSheetProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedEntry | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewTags, setPreviewTags] = useState("");

  // Drag-to-close
  const [dragY, setDragY] = useState(0);

  // Voice
  const [listening, setListening] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => requestAnimationFrame(() => textareaRef.current?.focus()));
    } else {
      setText("");
      setStatus(null);
      setErrorDetail(null);
      setPreview(null);
      setPreviewTitle("");
      setPreviewTags("");
      setListening(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (preview) requestAnimationFrame(() => titleInputRef.current?.focus());
  }, [preview]);

  // Drag-to-close via handle only — non-passive to block pull-to-refresh
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle || !isOpen) return;
    let startY = 0;
    const onStart = (e: TouchEvent) => { startY = e.touches[0].clientY; };
    const onMove = (e: TouchEvent) => {
      const dy = e.touches[0].clientY - startY;
      if (dy > 0) { e.preventDefault(); setDragY(dy); }
    };
    const onEnd = () => {
      setDragY((prev) => { if (prev > 80) onClose(); return 0; });
    };
    handle.addEventListener("touchstart", onStart, { passive: true });
    handle.addEventListener("touchmove", onMove, { passive: false });
    handle.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      handle.removeEventListener("touchstart", onStart);
      handle.removeEventListener("touchmove", onMove);
      handle.removeEventListener("touchend", onEnd);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    const el = sheetRef.current;
    if (!el || !isOpen) return;
    function trap(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const focusable = el!.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }
    el.addEventListener("keydown", trap);
    return () => el.removeEventListener("keydown", trap);
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        if (preview) { setPreview(null); setText(preview._raw || ""); }
        else onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose, preview]);

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
          if (result.embed_error) {
            console.error("[CaptureSheet:embed]", result.embed_error);
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

  const capture = useCallback(async () => {
    if (!text.trim()) return;
    const input = text.trim();
    setText("");
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
      let parsed: ParsedEntry = { title: "" };
      try {
        parsed = JSON.parse((data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim());
      } catch {}

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
      setText(input);
    }
  }, [text, brainId, isOnline, doSave]);

  const confirmSave = useCallback(() => {
    if (!preview || !previewTitle.trim()) return;
    doSave({
      ...preview,
      title: previewTitle.trim(),
      tags: previewTags.split(",").map((t) => t.trim()).filter(Boolean),
    });
  }, [preview, previewTitle, previewTags, doSave]);

  // ── Image (upload or camera) ──
  const handleImageFile = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setErrorDetail("Image too large (max 5 MB)"); return; }
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
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: file.type, data: base64 } },
              { type: "text", text: "Extract all text from this image. Output just the extracted content, clean and readable. If it's a business card, document, label, or receipt — preserve structure. No commentary." },
            ],
          }],
        }),
      });
      const data = await apiRes.json();
      const extracted = data.content?.[0]?.text?.trim() || "";
      if (extracted) setText((prev) => prev ? `${prev}\n${extracted}` : extracted);
      else setErrorDetail("[image] No text extracted");
    } catch (e: any) {
      setErrorDetail(`[image] ${e?.message || String(e)}`);
    }
    setLoading(false);
    setStatus(null);
  };

  // ── Voice ──
  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const startVoice = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      stopRecording();
      return;
    }

    const groqKey = getGroqKey();
    const openAIKey = getUserApiKey();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = "audio/mp4";
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) mimeType = "audio/webm;codecs=opus";
      else if (MediaRecorder.isTypeSupported("audio/webm")) mimeType = "audio/webm";
      else if (MediaRecorder.isTypeSupported("audio/mp4")) mimeType = "audio/mp4";

      const recorder = new MediaRecorder(stream, mimeType !== "audio/mp4" ? { mimeType } : undefined);
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        const actualMime = recorder.mimeType || mimeType;
        const blob = new Blob(audioChunksRef.current, { type: actualMime });
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        if (blob.size < 1000) return;

        setLoading(true);
        setStatus("transcribing");
        setErrorDetail(null);
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (groqKey) headers["X-Groq-Api-Key"] = groqKey;
          if (openAIKey) headers["X-User-Api-Key"] = openAIKey;
          const transcribeRes = await authFetch("/api/transcribe", {
            method: "POST",
            headers,
            body: JSON.stringify({ audio: base64, mimeType: actualMime, language: "en" }),
          });
          if (transcribeRes.ok) {
            const { text: t } = await transcribeRes.json();
            if (t?.trim()) setText((prev) => prev ? `${prev} ${t.trim()}` : t.trim());
          } else {
            const errBody = await transcribeRes.text().catch(() => "");
            setErrorDetail(`[transcribe] HTTP ${transcribeRes.status} — ${errBody}`);
          }
        } catch (e: any) {
          setErrorDetail(`[transcribe] ${e?.message || String(e)}`);
        }
        setLoading(false);
        setStatus(null);
      };

      recorder.start(1000);
      setListening(true);
    } catch (e: any) {
      if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
        setErrorDetail("[voice] Microphone permission denied");
      } else {
        setErrorDetail(`[voice] ${e?.message || String(e)}`);
      }
    }
  }, [stopRecording]);

  if (!isOpen) return null;

  const statusLabel: Record<string, string> = {
    thinking: "Reading your entry…",
    saving: "Saving…",
    saved: "Saved!",
    reading: "Reading image…",
    transcribing: "Transcribing…",
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        style={{ background: "var(--color-scrim)" }}
        onClick={preview ? undefined : onClose}
        aria-hidden="true"
      />

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={preview ? "Confirm entry" : "New entry"}
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl border-t px-5 pt-3 lg:bottom-6 lg:left-1/2 lg:-translate-x-1/2 lg:right-auto lg:w-full lg:max-w-lg lg:rounded-3xl"
        style={{
          background: "var(--color-surface-container-low)",
          borderColor: "var(--color-outline-variant)",
          boxShadow: "var(--shadow-lg)",
          animation: dragY > 0 ? "none" : "slide-in-from-bottom 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragY > 0 ? "none" : "transform 0.2s ease",
          paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))",
        }}
      >
        {/* Hidden file inputs */}
        <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handleImageFile(f); }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handleImageFile(f); }} />

        <div ref={handleRef} className="flex justify-center items-center pb-3 -mx-5 px-5 cursor-grab active:cursor-grabbing touch-none lg:hidden" style={{ height: 28 }}>
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--color-outline)" }} />
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-on-surface" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "1.125rem" }}>
            {preview ? "Before saving" : "New Entry"}
          </h2>
          <button
            onClick={() => { if (preview) { setPreview(null); setText(preview._raw || ""); } else onClose(); }}
            aria-label={preview ? "Back to capture" : "Close"}
            className="w-11 h-11 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface transition-colors"
          >
            {preview ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </button>
        </div>

        {!preview && (
          <>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") capture(); }}
              disabled={loading}
              placeholder={listening ? "Listening… tap stop when done" : "Capture a thought, paste a link, log anything…"}
              rows={4}
              className="w-full bg-transparent text-on-surface placeholder:text-on-surface-variant/40 outline-none resize-none text-base leading-relaxed"
            />

            {/* Status / error */}
            {(status || errorDetail) && (
              <div className="mt-1 mb-2">
                {status && status !== "error" && (
                  <p className="text-xs" style={{ color: status === "saved" ? "var(--color-primary)" : "var(--color-on-surface-variant)" }}>
                    {statusLabel[status] ?? status}
                  </p>
                )}
                {errorDetail && (
                  <p className="text-xs font-mono break-all" style={{ color: "var(--color-error)" }}>{errorDetail}</p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-3 mt-1 border-t" style={{ borderColor: "var(--color-outline-variant)" }}>
              {/* Input mode buttons */}
              <div className="flex items-center gap-1">
                {/* Voice */}
                <button
                  onClick={startVoice}
                  disabled={loading && !listening}
                  aria-label={listening ? "Stop recording" : "Voice note"}
                  title={listening ? "Stop recording" : "Voice note"}
                  className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors hover:bg-white/10 disabled:opacity-40"
                  style={listening ? { background: "color-mix(in oklch, var(--color-error) 15%, transparent)", color: "var(--color-error)" } : { color: "var(--color-on-surface-variant)" }}
                >
                  {listening ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                    </svg>
                  )}
                </button>

                {/* Camera (take photo) */}
                <button
                  onClick={() => cameraRef.current?.click()}
                  disabled={loading}
                  aria-label="Take photo"
                  title="Take photo"
                  className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors hover:bg-white/10 disabled:opacity-40"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                  </svg>
                </button>

                {/* Image upload */}
                <button
                  onClick={() => imgRef.current?.click()}
                  disabled={loading}
                  aria-label="Upload image"
                  title="Upload image"
                  className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors hover:bg-white/10 disabled:opacity-40"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <p className="text-[11px] text-on-surface-variant/50">
                  {text.trim() ? `${text.trim().length} chars` : "⌘↵ to save"}
                </p>
                <button
                  onClick={capture}
                  disabled={loading || !text.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-30 press-scale"
                  style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
                >
                  {loading ? (
                    <span className="flex gap-1">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </span>
                  ) : "Save"}
                </button>
              </div>
            </div>
          </>
        )}

        {preview && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Title</label>
              <input
                ref={titleInputRef}
                value={previewTitle}
                onChange={(e) => setPreviewTitle(e.target.value)}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") confirmSave(); }}
                className="w-full rounded-xl border px-3 py-2.5 text-sm text-on-surface bg-transparent outline-none focus:border-primary transition-colors"
                style={{ borderColor: "var(--color-outline-variant)" }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Tags</label>
              <input
                value={previewTags}
                onChange={(e) => setPreviewTags(e.target.value)}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") confirmSave(); }}
                placeholder="tag1, tag2"
                className="w-full rounded-xl border px-3 py-2.5 text-sm text-on-surface bg-transparent outline-none focus:border-primary transition-colors placeholder:text-on-surface-variant/40"
                style={{ borderColor: "var(--color-outline-variant)" }}
              />
            </div>
            <div className="flex gap-3 pt-3 mt-1 border-t" style={{ borderColor: "var(--color-outline-variant)" }}>
              <button
                onClick={() => { setPreview(null); setText(preview._raw || ""); }}
                className="flex-1 py-2.5 rounded-xl border text-sm text-on-surface-variant transition-colors hover:bg-surface-container press-scale"
                style={{ borderColor: "var(--color-outline-variant)" }}
              >
                Back
              </button>
              <button
                onClick={confirmSave}
                disabled={!previewTitle.trim() || loading}
                className="flex-[2] py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 press-scale"
                style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
              >
                {loading ? (
                  <span className="flex justify-center gap-1">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </span>
                ) : "Save to Everion"}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
