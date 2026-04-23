import { useState, useRef, useEffect } from "react";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import { useCaptureSheetParse } from "../hooks/useCaptureSheetParse";
import { useBrain as useBrainCtx } from "../context/BrainContext";
import { CANONICAL_TYPES } from "../types";
import type { Entry } from "../types";

interface CaptureSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (entry: Entry) => void;
  brainId?: string;
  cryptoKey?: CryptoKey | null;
  isOnline?: boolean;
  initialText?: string;
  onBackgroundFiles?: (files: File[]) => void;
  onBackgroundSave?: (entry: {
    title: string;
    content: string;
    type: string;
    tags: string[];
    metadata: Record<string, any>;
    rawContent?: string;
  }) => void;
  onNavigate?: (id: string) => void;
}

// Line-art icons for the capture sheet.
const IconMic = ({ on = false }: { on?: boolean }) =>
  on ? (
    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  ) : (
    <svg
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );

const IconAttach = (
  <svg
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M21 11.5 12 20.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" />
  </svg>
);

const IconVault = (
  <svg
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <rect x="4" y="10" width="16" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);

const IconSend = (
  <svg
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M4 12 20 4l-7 16-2-7-7-1z" />
  </svg>
);

const IconX = (
  <svg
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const IconCamera = (
  <svg
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M4 8h3l1-2h8l1 2h3v12H4z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const IconArrowLeft = (
  <svg
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M15 6l-6 6 6 6M4 12h16" />
  </svg>
);

const MOD = typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl";

export default function CaptureSheet({
  isOpen,
  onClose,
  onCreated,
  brainId,
  cryptoKey,
  isOnline = true,
  initialText,
  onBackgroundFiles: _onBackgroundFiles,
  onBackgroundSave,
  onNavigate,
}: CaptureSheetProps) {
  const [text, setText] = useState("");
  const [activeTab, setActiveTab] = useState<"entry" | "secret">("entry");
  const [secretTitle, setSecretTitle] = useState("");
  const [secretContent, setSecretContent] = useState("");
  const [secretSaving, setSecretSaving] = useState(false);
  const [secretError, setSecretError] = useState("");

  useBrainCtx(); // keep context subscription warm for offline/online syncs
  const [showSavedWhisper, setShowSavedWhisper] = useState(false);

  // Drag-to-close + entrance animation
  const [dragY, setDragY] = useState(0);
  const [visible, setVisible] = useState(false);

  const {
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
  } = useCaptureSheetParse({ brainId, isOnline, cryptoKey, onCreated, onClose, onBackgroundSave });

  const { listening, startVoice, resetListening } = useVoiceRecorder({
    onTranscript: (t) => setText((prev) => (prev ? `${prev} ${t}` : t)),
    onStatus: setStatus,
    onError: setErrorDetail,
    onLoading: setLoading,
  });

  const [typeOpen, setTypeOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const secretTitleRef = useRef<HTMLInputElement>(null);
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
      if (initialText) setText(initialText);
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
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
      setActiveTab("entry");
      setSecretTitle("");
      setSecretContent("");
      setSecretError("");
      resetState();
      setLoading(false);
      resetListening();
    }
  }, [isOpen, resetListening]);

  useEffect(() => {
    if (preview) requestAnimationFrame(() => titleInputRef.current?.focus());
  }, [preview]);

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

  // Flash a serif italic "saved." for 900ms after a successful save.
  useEffect(() => {
    if (status === "saved") {
      setShowSavedWhisper(true);
      const t = setTimeout(() => setShowSavedWhisper(false), 900);
      return () => clearTimeout(t);
    }
  }, [status]);

  if (!isOpen && !visible) return null;

  const statusLabel: Record<string, string> = {
    thinking: "reading your entry…",
    saving: "saving…",
    saved: "saved.",
    reading: "reading image…",
    transcribing: "transcribing…",
    splitting: "splitting document into entries…",
  };

  // ── render ────────────────────────────────────────────────────────────────
  const canSave =
    activeTab === "entry"
      ? text.trim().length > 0 || uploadedFiles.length > 0
      : secretTitle.trim().length > 0 && secretContent.trim().length > 0;

  const handleSave = () => {
    if (activeTab === "entry") capture(text, () => setText(""));
  };

  const toggleVault = () => {
    // Flip between regular entry mode and secret/vault mode.
    if (activeTab === "entry") {
      if (!cryptoKey) {
        if (onNavigate) onNavigate("vault");
        return;
      }
      setActiveTab("secret");
      requestAnimationFrame(() => secretTitleRef.current?.focus());
    } else {
      setActiveTab("entry");
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  };

  return (
    <>
      {/* Scrim */}
      <div
        className="fixed inset-0 z-50"
        style={{
          background: "var(--scrim)",
          opacity: visible ? Math.max(0, 1 - dragY / 350) : 0,
          transition: dragY > 0 ? "none" : "opacity 0.32s ease",
        }}
        onClick={preview ? undefined : onClose}
        aria-hidden="true"
      />

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
          handleImageFile(f);
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
          handleImageFile(f);
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
          handleDocFiles(files).catch((err) => console.error("[docInput]", err));
        }}
      />

      {/* Sheet container */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={preview ? "Confirm entry" : "Capture something"}
        className="capture-sheet"
        style={{
          background: "var(--surface-high)",
          border: "1px solid var(--line)",
          boxShadow: "var(--lift-3)",
          // CSS variable drives the Y portion; the .capture-sheet class adds the
          // desktop centering translateX via a media query on the transform.
          ["--capture-y" as string]:
            dragY > 0 ? `${dragY}px` : visible ? "0px" : "100%",
          transition: dragY > 0 ? "none" : "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {loading ? "Processing your entry…" : status ?? ""}
        </div>

        {/* Drag handle (mobile) */}
        <div
          ref={handleRef}
          className="touch-none lg:hidden"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingTop: 10,
            paddingBottom: 6,
            cursor: "grab",
          }}
        >
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: "var(--line)",
            }}
          />
        </div>

        {/* Body */}
        {preview ? (
          // ── PREVIEW PHASE ──
          <div
            style={{
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              overflowY: "auto",
            }}
          >
            <div className="flex items-center justify-between">
              <h2
                className="f-serif"
                style={{ fontSize: 20, fontWeight: 450, color: "var(--ink)", margin: 0 }}
              >
                before saving
              </h2>
              <button
                className="design-btn-ghost press"
                onClick={() => {
                  setPreview(null);
                  setText(preview._raw || "");
                }}
                aria-label="Back"
                style={{ width: 32, height: 32, minHeight: 32, padding: 0 }}
              >
                {IconArrowLeft}
              </button>
            </div>

            {errorDetail && (
              <p
                style={{
                  fontFamily: "var(--f-mono)",
                  fontSize: 12,
                  color: "var(--blood)",
                  wordBreak: "break-all",
                  margin: 0,
                }}
              >
                {errorDetail}
              </p>
            )}

            <div>
              <div className="micro" style={{ marginBottom: 6 }}>
                Title
              </div>
              <input
                ref={titleInputRef}
                value={previewTitle}
                onChange={(e) => setPreviewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") confirmSave();
                }}
                className="design-input f-serif"
                style={{ fontSize: 16 }}
              />
            </div>

            <div ref={typeRef} style={{ position: "relative" }}>
              <div className="micro" style={{ marginBottom: 6 }}>
                Type
              </div>
              <button
                type="button"
                onClick={() => setTypeOpen((p) => !p)}
                className="design-input f-sans"
                style={{
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                }}
              >
                <span>{previewType.charAt(0).toUpperCase() + previewType.slice(1)}</span>
                <svg
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                  style={{
                    flexShrink: 0,
                    transform: typeOpen ? "rotate(180deg)" : "none",
                    transition: "transform 180ms",
                  }}
                >
                  <path d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {typeOpen && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: "100%",
                    zIndex: 20,
                    marginBottom: 4,
                    background: "var(--surface-high)",
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    boxShadow: "var(--lift-2)",
                    overflow: "hidden",
                  }}
                >
                  {CANONICAL_TYPES.filter((t) => t !== "secret").map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setPreviewType(t);
                        setTypeOpen(false);
                      }}
                      className="f-sans press"
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 14px",
                        minHeight: 36,
                        fontSize: 14,
                        color: "var(--ink)",
                        background: previewType === t ? "var(--ember-wash)" : "transparent",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="micro" style={{ marginBottom: 6 }}>
                Tags
              </div>
              <input
                value={previewTags}
                onChange={(e) => setPreviewTags(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") confirmSave();
                }}
                placeholder="tag1, tag2"
                className="design-input f-sans"
              />
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 4,
                paddingTop: 12,
                borderTop: "1px solid var(--line-soft)",
              }}
            >
              <button
                className="design-btn-secondary press"
                onClick={() => {
                  setPreview(null);
                  setText(preview._raw || "");
                }}
                style={{ flex: 1 }}
              >
                Back
              </button>
              <button
                onClick={() => confirmSave()}
                disabled={!previewTitle.trim() || loading}
                className="design-btn-primary press"
                style={{ flex: 2 }}
              >
                {loading ? "Saving…" : previewType === "secret" ? "Save to vault" : "Save"}
              </button>
            </div>
          </div>
        ) : activeTab === "secret" ? (
          // ── SECRET PHASE (triggered from vault toggle) ──
          <div
            style={{
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              overflowY: "auto",
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2
                  className="f-serif"
                  style={{ fontSize: 20, fontWeight: 450, color: "var(--ink)", margin: 0 }}
                >
                  secret
                </h2>
                <p
                  className="f-serif"
                  style={{
                    fontSize: 13,
                    fontStyle: "italic",
                    color: "var(--ember)",
                    margin: "4px 0 0",
                  }}
                >
                  encrypted on your device. AI never reads this.
                </p>
              </div>
              <button
                className="design-btn-ghost press"
                onClick={toggleVault}
                style={{ width: 32, height: 32, minHeight: 32, padding: 0 }}
                aria-label="Back to entry"
              >
                {IconArrowLeft}
              </button>
            </div>

            <div>
              <div className="micro" style={{ marginBottom: 6 }}>
                Label
              </div>
              <input
                ref={secretTitleRef}
                value={secretTitle}
                onChange={(e) => setSecretTitle(e.target.value)}
                placeholder="e.g. netflix password, visa card, ssh key"
                className="design-input f-serif"
                style={{ fontStyle: secretTitle ? "normal" : "italic", fontSize: 16 }}
              />
            </div>
            <div>
              <div className="micro" style={{ marginBottom: 6 }}>
                Secret
              </div>
              <textarea
                value={secretContent}
                onChange={(e) => setSecretContent(e.target.value)}
                placeholder="paste or type your password, pin, key, card details…"
                rows={5}
                className="design-input f-serif"
                style={{
                  resize: "none",
                  padding: "12px 14px",
                  height: "auto",
                  fontSize: 16,
                  lineHeight: 1.5,
                }}
              />
            </div>
            {secretError && (
              <p
                style={{
                  fontFamily: "var(--f-mono)",
                  fontSize: 12,
                  color: "var(--blood)",
                  wordBreak: "break-all",
                  margin: 0,
                }}
              >
                {secretError}
              </p>
            )}
            <div
              style={{
                display: "flex",
                gap: 10,
                paddingTop: 12,
                borderTop: "1px solid var(--line-soft)",
              }}
            >
              <button onClick={toggleVault} className="design-btn-secondary press" style={{ flex: 1 }}>
                Back
              </button>
              <button
                disabled={!secretTitle.trim() || !secretContent.trim() || secretSaving}
                onClick={async () => {
                  if (!secretTitle.trim() || !secretContent.trim()) return;
                  setSecretSaving(true);
                  setSecretError("");
                  await doSave({
                    title: secretTitle.trim(),
                    content: secretContent,
                    type: "secret",
                    tags: [],
                    metadata: {},
                  });
                  setSecretSaving(false);
                  if (errorDetail) setSecretError(errorDetail);
                  else {
                    setSecretTitle("");
                    setSecretContent("");
                  }
                }}
                className="design-btn-primary press"
                style={{ flex: 2 }}
              >
                {secretSaving ? "Saving…" : "Save to vault"}
              </button>
            </div>
          </div>
        ) : (
          // ── ENTRY PHASE (default) ──
          <>
            <div
              style={{
                padding: "22px 24px 10px",
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: 160,
                position: "relative",
              }}
            >
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSave();
                }}
                disabled={loading}
                placeholder={
                  listening
                    ? "listening… tap stop when done"
                    : uploadedFiles.length > 0
                      ? "optional: describe what this is…"
                      : "remember something…"
                }
                rows={5}
                className="f-serif"
                style={{
                  width: "100%",
                  minHeight: 120,
                  flex: 1,
                  resize: "none",
                  fontSize: 19,
                  lineHeight: 1.55,
                  color: "var(--ink)",
                  fontStyle: text ? "normal" : "italic",
                  background: "transparent",
                  border: 0,
                  outline: 0,
                  padding: 0,
                }}
              />

              {uploadedFiles.length > 0 && (
                <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {uploadedFiles.map((f) => (
                    <span key={f.name} className="design-chip">
                      <span
                        style={{
                          maxWidth: 140,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {f.name}
                      </span>
                      <button
                        onClick={() => removeUploadedFile(f.name)}
                        aria-label={`Remove ${f.name}`}
                        style={{
                          marginLeft: 2,
                          padding: 0,
                          minHeight: 16,
                          background: "transparent",
                          color: "var(--ink-faint)",
                          border: 0,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                        }}
                      >
                        {IconX}
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Voice waveform — horizontal motes line while recording */}
              {listening && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    marginTop: 12,
                    height: 28,
                  }}
                  aria-hidden="true"
                >
                  {Array.from({ length: 32 }, (_, i) => (
                    <span
                      key={i}
                      style={{
                        width: 2,
                        height: 4 + Math.random() * 20,
                        background: "var(--ember)",
                        opacity: 0.3 + Math.random() * 0.6,
                        borderRadius: 2,
                        animation: `design-breathe ${0.6 + Math.random() * 1.4}s ease-in-out infinite`,
                        animationDelay: `-${Math.random() * 2}s`,
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Saved whisper */}
              {showSavedWhisper && (
                <div
                  className="anim-fade-in-design"
                  style={{
                    position: "absolute",
                    bottom: 12,
                    left: 24,
                    pointerEvents: "none",
                  }}
                >
                  <span
                    className="f-serif"
                    style={{
                      fontStyle: "italic",
                      fontSize: 15,
                      color: "var(--ink-faint)",
                    }}
                  >
                    saved.
                  </span>
                </div>
              )}
            </div>

            {/* Status line */}
            {(status || errorDetail) && (
              <div style={{ padding: "0 24px 10px" }}>
                {status && status !== "error" && (
                  <p
                    className="f-serif"
                    style={{
                      margin: 0,
                      fontSize: 13,
                      fontStyle: "italic",
                      color: status === "saved" ? "var(--ember)" : "var(--ink-faint)",
                    }}
                  >
                    {statusLabel[status] ?? status}
                  </p>
                )}
                {errorDetail && (
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "var(--f-mono)",
                      fontSize: 12,
                      color: "var(--blood)",
                      wordBreak: "break-all",
                    }}
                  >
                    {errorDetail}
                  </p>
                )}
              </div>
            )}

            {/* Bottom action bar */}
            <div
              style={{
                padding: "14px 20px",
                borderTop: "1px solid var(--line-soft)",
                background: "var(--surface)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <button
                  onClick={startVoice}
                  disabled={loading && !listening}
                  aria-label={listening ? "Stop recording" : "Voice note"}
                  className="design-btn-ghost press"
                  style={{
                    width: 40,
                    height: 40,
                    minHeight: 40,
                    padding: 0,
                    color: listening ? "var(--ember)" : "var(--ink-faint)",
                  }}
                >
                  <IconMic on={listening} />
                </button>
                <button
                  onClick={() => cameraRef.current?.click()}
                  disabled={loading}
                  aria-label="Take photo"
                  className="design-btn-ghost press lg:hidden"
                  style={{
                    width: 40,
                    height: 40,
                    minHeight: 40,
                    padding: 0,
                    color: "var(--ink-faint)",
                  }}
                >
                  {IconCamera}
                </button>
                <button
                  onClick={() => docRef.current?.click()}
                  disabled={loading}
                  aria-label="Attach files"
                  className="design-btn-ghost press"
                  style={{
                    width: 40,
                    height: 40,
                    minHeight: 40,
                    padding: 0,
                    color: "var(--ink-faint)",
                  }}
                >
                  {IconAttach}
                </button>
                <button
                  onClick={toggleVault}
                  className="design-btn-ghost press"
                  aria-label="Save to vault"
                  aria-pressed={activeTab === "secret"}
                  style={{
                    width: 40,
                    height: 40,
                    minHeight: 40,
                    padding: 0,
                    color:
                      activeTab === "secret" ? "var(--ember)" : cryptoKey ? "var(--ink-faint)" : "var(--ink-ghost)",
                  }}
                  title={cryptoKey ? "Save to vault" : "Unlock vault first"}
                >
                  {IconVault}
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  className="f-sans hidden lg:inline"
                  style={{
                    fontSize: 11,
                    color: "var(--ink-ghost)",
                  }}
                >
                  {MOD}⏎ to save
                </span>
                <button
                  onClick={handleSave}
                  disabled={!canSave || loading}
                  className="design-btn-primary press"
                  style={{ height: 40, minHeight: 40, borderRadius: 8 }}
                >
                  {IconSend}
                  {loading ? "Saving…" : "Capture"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
