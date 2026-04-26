import { useState, useRef, useEffect } from "react";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import { useCaptureSheetParse } from "../hooks/useCaptureSheetParse";
import { useBrain as useBrainCtx } from "../context/BrainContext";
import type { Entry } from "../types";
import CapturePreviewPanel, { type PreviewState } from "./CapturePreviewPanel";
import CaptureSecretPanel, { type SecretForm } from "./CaptureSecretPanel";
import CaptureEntryBody from "./CaptureEntryBody";

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
  const [secretForm, setSecretForm] = useState<SecretForm>({ title: "", content: "" });
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
  } = useCaptureSheetParse({ brainId, isOnline, cryptoKey, onCreated, onClose, onBackgroundSave });

  const { listening, startVoice, resetListening } = useVoiceRecorder({
    onTranscript: (t) => setText((prev) => (prev ? `${prev} ${t}` : t)),
    onStatus: setStatus,
    onError: setErrorDetail,
    onLoading: setLoading,
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

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
      setSecretForm({ title: "", content: "" });
      setSecretError("");
      resetState();
      setLoading(false);
      resetListening();
    }
  }, [isOpen, resetListening]);

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
      : secretForm.title.trim().length > 0 && secretForm.content.trim().length > 0;

  const handleSave = () => {
    if (activeTab === "entry") capture(text, () => setText(""));
  };

  const toggleVault = () => {
    if (activeTab === "entry") {
      if (!cryptoKey) {
        if (onNavigate) onNavigate("vault");
        return;
      }
      setActiveTab("secret");
    } else {
      setActiveTab("entry");
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  };

  // Bridge between PreviewState object and hook's individual state setters
  const previewStateObj: PreviewState = {
    title: previewTitle,
    tags: previewTags,
    type: previewType,
  };

  const handlePreviewChange = (next: PreviewState) => {
    setPreviewTitle(next.title);
    setPreviewTags(next.tags);
    setPreviewType(next.type);
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
          ["--capture-y" as string]: dragY > 0 ? `${dragY}px` : visible ? "0px" : "100%",
          transition: dragY > 0 ? "none" : "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {loading ? "Processing your entry…" : (status ?? "")}
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
          <CapturePreviewPanel
            preview={previewStateObj}
            onPreviewChange={handlePreviewChange}
            onBack={() => {
              setPreview(null);
              setText(preview._raw || "");
            }}
            onConfirm={confirmSave}
            loading={loading}
            errorDetail={errorDetail}
          />
        ) : activeTab === "secret" ? (
          <CaptureSecretPanel
            form={secretForm}
            onFormChange={setSecretForm}
            saving={secretSaving}
            error={secretError}
            onBack={toggleVault}
            onSave={async () => {
              if (!secretForm.title.trim() || !secretForm.content.trim()) return;
              setSecretSaving(true);
              setSecretError("");
              await doSave({
                title: secretForm.title.trim(),
                content: secretForm.content,
                type: "secret",
                tags: [],
                metadata: {},
              });
              setSecretSaving(false);
              if (errorDetail) setSecretError(errorDetail);
              else setSecretForm({ title: "", content: "" });
            }}
          />
        ) : (
          <CaptureEntryBody
            text={text}
            onTextChange={setText}
            uploadedFiles={uploadedFiles}
            listening={listening}
            loading={loading}
            showSavedWhisper={showSavedWhisper}
            canSave={canSave}
            cryptoKey={cryptoKey}
            activeTab={activeTab}
            statusInfo={{
              status,
              errorDetail,
              fileParseError,
              statusLabel,
            }}
            handlers={{
              onSave: handleSave,
              onStartVoice: startVoice,
              onToggleVault: toggleVault,
              onRemoveFile: removeUploadedFile,
              onAttachFiles: (files) => {
                handleDocFiles(files).catch((err) => console.error("[docInput]", err));
              },
              onImageFile: handleImageFile,
              onRetryFile: retryLastFile,
              onManualFill: () => {
                setFileParseError(null);
                setErrorDetail(null);
                setPreview({ title: "", content: "", type: "note", tags: [] });
                setPreviewTitle("");
                setPreviewTags("");
                setPreviewType("note");
              },
            }}
          />
        )}
      </div>
    </>
  );
}
