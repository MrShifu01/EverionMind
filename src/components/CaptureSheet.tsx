import { useState, useRef, useEffect } from "react";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import { useCaptureSheetParse } from "../hooks/useCaptureSheetParse";
import { CANONICAL_TYPES } from "../types";
import type { Entry } from "../types";

interface CaptureSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (entry: Entry) => void;
  brainId?: string;
  cryptoKey?: CryptoKey | null;
  isOnline?: boolean;
  onBackgroundFiles?: (files: File[]) => void;
}

export default function CaptureSheet({
  isOpen,
  onClose,
  onCreated,
  brainId,
  cryptoKey,
  isOnline = true,
  onBackgroundFiles,
}: CaptureSheetProps) {
  const [text, setText] = useState("");

  // Drag-to-close + entrance animation
  const [dragY, setDragY] = useState(0);
  const [visible, setVisible] = useState(false);

  const {
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
    confirmSave,
    handleImageFile,
    handleDocFiles,
  } = useCaptureSheetParse({ brainId, isOnline, cryptoKey, onCreated, onClose });

  // Voice
  const { listening, startVoice, resetListening } = useVoiceRecorder({
    onTranscript: (t) => setText((prev) => (prev ? `${prev} ${t}` : t)),
    onStatus: setStatus,
    onError: setErrorDetail,
    onLoading: setLoading,
  });

  const [typeOpen, setTypeOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!typeOpen) return;
    function handleClick(e: MouseEvent) {
      if (typeRef.current && !typeRef.current.contains(e.target as Node)) setTypeOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [typeOpen]);

  useEffect(() => {
    if (isOpen) {
      // Lock body scroll on iOS (overflow:hidden is ignored; position:fixed is required)
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      // One RAF gives browser a frame to paint translateY(100%) before transitioning to 0
      requestAnimationFrame(() => {
        setVisible(true);
        requestAnimationFrame(() => textareaRef.current?.focus());
      });
      return () => {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        window.scrollTo(0, scrollY);
      };
    } else {
      setVisible(false);
      setText("");
      resetState();
      setLoading(false);
      resetListening();
    }
  }, [isOpen, resetListening]);

  useEffect(() => {
    if (preview) requestAnimationFrame(() => titleInputRef.current?.focus());
  }, [preview]);

  // Drag-to-close via handle only — non-passive to block pull-to-refresh
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle || !isOpen) return;
    let startY = 0;
    const onStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      const dy = e.touches[0].clientY - startY;
      if (dy > 0) {
        e.preventDefault();
        setDragY(dy);
      }
    };
    const onEnd = () => {
      setDragY((prev) => {
        if (prev > 80) {
          // animate out fully before calling onClose
          setVisible(false);
          setTimeout(onClose, 280);
        }
        return 0;
      });
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
        'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    el.addEventListener("keydown", trap);
    return () => el.removeEventListener("keydown", trap);
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        if (preview) {
          setPreview(null);
          setText(preview._raw || "");
        } else onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose, preview]);

  // Keep mounted so CSS transition plays; hide from a11y when closed
  if (!isOpen && !visible) return null;

  const statusLabel: Record<string, string> = {
    thinking: "Reading your entry…",
    saving: "Saving…",
    saved: "Saved!",
    reading: "Reading image…",
    transcribing: "Transcribing…",
    splitting: "Splitting document into entries…",
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        style={{
          background: "var(--color-scrim)",
          opacity: visible ? Math.max(0, 1 - dragY / 350) : 0,
          transition: dragY > 0 ? "none" : "opacity 0.32s ease",
        }}
        onClick={preview ? undefined : onClose}
        aria-hidden="true"
      />

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={preview ? "Confirm entry" : "New entry"}
        className="fixed right-0 bottom-0 left-0 z-50 rounded-t-3xl border-t px-5 pt-3 lg:right-auto lg:bottom-6 lg:left-1/2 lg:w-full lg:max-w-lg lg:-translate-x-1/2 lg:rounded-3xl"
        style={{
          background: "var(--color-surface-container-low)",
          borderColor: "var(--color-outline-variant)",
          boxShadow: "var(--shadow-lg)",
          transform:
            dragY > 0 ? `translateY(${dragY}px)` : visible ? "translateY(0)" : "translateY(100%)",
          transition: dragY > 0 ? "none" : "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 110px)",
        }}
      >
        {/* Hidden file inputs */}
        <input
          ref={imgRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (onBackgroundFiles) { onBackgroundFiles([f]); onClose(); }
            else handleImageFile(f);
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (onBackgroundFiles) { onBackgroundFiles([f]); onClose(); }
            else handleImageFile(f);
          }}
        />
        <input
          ref={docRef}
          type="file"
          accept="image/*,.pdf,.docx,.xlsx,.xls,.txt,.md,.csv,.json"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (!files.length) return;
            if (onBackgroundFiles) { onBackgroundFiles(files); onClose(); }
            else handleDocFiles(files).catch((err) => console.error("[docInput]", err));
          }}
        />

        <div
          ref={handleRef}
          className="-mx-5 flex cursor-grab touch-none items-center justify-center px-5 pb-3 active:cursor-grabbing lg:hidden"
          style={{ height: 28 }}
        >
          <div className="h-1 w-10 rounded-full" style={{ background: "var(--color-outline)" }} />
        </div>

        <div className="mb-4 flex items-center justify-between">
          <h2
            className="text-on-surface font-semibold"
            style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "1.125rem" }}
          >
            {preview ? "Before saving" : "New Entry"}
          </h2>
          <button
            onClick={() => {
              if (preview) {
                setPreview(null);
                setText(preview._raw || "");
              } else onClose();
            }}
            aria-label={preview ? "Back to capture" : "Close"}
            className="text-on-surface-variant hover:text-on-surface flex h-11 w-11 items-center justify-center rounded-lg transition-colors"
          >
            {preview ? (
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
                />
              </svg>
            ) : (
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
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
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") capture(text, () => setText(""));
              }}
              disabled={loading}
              placeholder={
                listening
                  ? "Listening… tap stop when done"
                  : "Capture a thought, paste a link, log anything…"
              }
              rows={7}
              className="text-on-surface placeholder:text-on-surface-variant/40 w-full resize-none bg-transparent text-base leading-relaxed outline-none"
            />

            {/* Uploaded file chips */}
            {uploadedFiles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {uploadedFiles.map((f) => (
                  <span
                    key={f.name}
                    className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
                    style={{ borderColor: "var(--color-outline-variant)", color: "var(--color-on-surface-variant)", background: "var(--color-surface-container)" }}
                  >
                    <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <span className="max-w-[140px] truncate">{f.name}</span>
                    <button
                      onClick={() => removeUploadedFile(f.name)}
                      className="hover:text-on-surface ml-0.5 transition-colors"
                      aria-label={`Remove ${f.name}`}
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Status / error */}
            {(status || errorDetail) && (
              <div className="mt-1 mb-2">
                {status && status !== "error" && (
                  <p
                    className="text-xs"
                    style={{
                      color:
                        status === "saved"
                          ? "var(--color-primary)"
                          : "var(--color-on-surface-variant)",
                    }}
                  >
                    {statusLabel[status] ?? status}
                  </p>
                )}
                {errorDetail && (
                  <p
                    className="font-mono text-xs break-all"
                    style={{ color: "var(--color-error)" }}
                  >
                    {errorDetail}
                  </p>
                )}
              </div>
            )}

            <div
              className="mt-1 flex items-center justify-between border-t pt-3"
              style={{ borderColor: "var(--color-outline-variant)" }}
            >
              {/* Input mode buttons */}
              <div className="flex items-center gap-1">
                {/* Voice */}
                <button
                  onClick={startVoice}
                  disabled={loading && !listening}
                  aria-label={listening ? "Stop recording" : "Voice note"}
                  title={listening ? "Stop recording" : "Voice note"}
                  className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-white/10 disabled:opacity-40"
                  style={
                    listening
                      ? {
                          background: "color-mix(in oklch, var(--color-error) 15%, transparent)",
                          color: "var(--color-error)",
                        }
                      : { color: "var(--color-on-surface-variant)" }
                  }
                >
                  {listening ? (
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  ) : (
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                      />
                    </svg>
                  )}
                </button>

                {/* Camera (take photo) — mobile only */}
                <button
                  onClick={() => cameraRef.current?.click()}
                  disabled={loading}
                  aria-label="Take photo"
                  title="Take photo"
                  className="lg:hidden flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-white/10 disabled:opacity-40"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
                    />
                  </svg>
                </button>

                {/* Image upload — mobile only (desktop uses doc button) */}
                <button
                  onClick={() => imgRef.current?.click()}
                  disabled={loading}
                  aria-label="Upload image"
                  title="Upload image"
                  className="lg:hidden flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-white/10 disabled:opacity-40"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                    />
                  </svg>
                </button>

                {/* Document upload (images + text files, multiple) */}
                <button
                  onClick={() => docRef.current?.click()}
                  disabled={loading}
                  aria-label="Add documents"
                  title="Add documents"
                  className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-white/10 disabled:opacity-40"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                    />
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <p className="text-on-surface-variant/50 text-[11px]">
                  {text.trim() ? `${text.trim().length} chars` : "⌘↵ to save"}
                </p>
                <button
                  onClick={() => capture(text, () => setText(""))}
                  disabled={loading || (!text.trim() && uploadedFiles.length === 0)}
                  className="press-scale flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all disabled:opacity-30"
                  style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
                >
                  {loading ? (
                    <span className="flex gap-1">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </span>
                  ) : (
                    "Save"
                  )}
                </button>
              </div>
            </div>
          </>
        )}

        {preview && (
          <div className="space-y-3">
            {errorDetail && (
              <p className="font-mono text-xs break-all" style={{ color: "var(--color-error)" }}>
                {errorDetail}
              </p>
            )}
            <div>
              <label className="text-on-surface-variant mb-1.5 block text-xs font-medium">
                Title
              </label>
              <input
                ref={titleInputRef}
                value={previewTitle}
                onChange={(e) => setPreviewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") confirmSave();
                }}
                className="text-on-surface focus:border-primary w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm transition-colors outline-none"
                style={{ borderColor: "var(--color-outline-variant)" }}
              />
            </div>
            <div ref={typeRef} className="relative">
              <label className="text-on-surface-variant mb-1.5 block text-xs font-medium">
                Type
              </label>
              <button
                type="button"
                onClick={() => setTypeOpen((p) => !p)}
                className="text-on-surface focus:border-primary flex w-full items-center justify-between rounded-xl border bg-transparent px-3 py-2.5 text-sm transition-colors outline-none"
                style={{ borderColor: "var(--color-outline-variant)" }}
              >
                <span>{previewType.charAt(0).toUpperCase() + previewType.slice(1)}</span>
                <svg
                  className={`h-4 w-4 flex-shrink-0 transition-transform ${typeOpen ? "rotate-180" : ""}`}
                  fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {typeOpen && (
                <div
                  className="absolute bottom-full left-0 right-0 z-20 mb-1 overflow-y-auto rounded-xl border shadow-lg"
                  style={{
                    background: "var(--color-surface-container-high)",
                    borderColor: "var(--color-outline-variant)",
                    maxHeight: "200px",
                  }}
                >
                  {CANONICAL_TYPES.filter((t) => t !== "secret").map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setPreviewType(t); setTypeOpen(false); }}
                      className="w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/10"
                      style={{
                        color: "var(--color-on-surface)",
                        background: previewType === t ? "var(--color-primary-container)" : undefined,
                      }}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-on-surface-variant mb-1.5 block text-xs font-medium">
                Tags
              </label>
              <input
                value={previewTags}
                onChange={(e) => setPreviewTags(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") confirmSave();
                }}
                placeholder="tag1, tag2"
                className="text-on-surface focus:border-primary placeholder:text-on-surface-variant/40 w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm transition-colors outline-none"
                style={{ borderColor: "var(--color-outline-variant)" }}
              />
            </div>
            <div
              className="mt-1 border-t pt-3"
              style={{ borderColor: "var(--color-outline-variant)" }}
            >
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setPreview(null);
                    setText(preview._raw || "");
                  }}
                  className="text-on-surface-variant hover:bg-surface-container press-scale flex-1 rounded-xl border py-2.5 text-sm transition-colors"
                  style={{ borderColor: "var(--color-outline-variant)" }}
                >
                  Back
                </button>
                <button
                  onClick={() => confirmSave()}
                  disabled={!previewTitle.trim() || loading}
                  className="press-scale flex-[2] rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-40"
                  style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
                >
                  {loading ? (
                    <span className="flex justify-center gap-1">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </span>
                  ) : previewType === "secret" ? (
                    "Save to Vault"
                  ) : (
                    "Save to Everion"
                  )}
                </button>
              </div>

              {/* Vault shortcut — only shown when not already a secret */}
              {previewType !== "secret" && (
                <button
                  type="button"
                  onClick={() => setPreviewType("secret")}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-xs transition-colors hover:bg-white/5"
                  style={{ color: "var(--color-on-surface-variant)", opacity: 0.6 }}
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  Save to Vault instead
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
