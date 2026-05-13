import { useState, useRef, useEffect } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useCaptureSheetParse } from "../hooks/useCaptureSheetParse";
import { useBrain as useBrainCtx } from "../context/BrainContext";
import type { Brain, Entry } from "../types";
import CapturePreviewPanel, { type PreviewState } from "./CapturePreviewPanel";
import CaptureSecretPanel, { type SecretForm } from "./CaptureSecretPanel";
import CaptureEntryBody from "./CaptureEntryBody";
import CaptureListBody from "./CaptureListBody";
import CaptureArticleBody from "./CaptureArticleBody";
import { Button } from "./ui/button";
import { isFeatureEnabled } from "../lib/featureFlags";
import { useAdminDevMode } from "../hooks/useAdminDevMode";
import { parseListText } from "../lib/listParser";

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
    metadata: Record<string, unknown>;
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
  const [activeTab, setActiveTab] = useState<"entry" | "secret" | "list" | "article">("entry");
  const [reminderActive, setReminderActive] = useState(false);
  const [secretForm, setSecretForm] = useState<SecretForm>({ title: "", content: "" });
  const [secretSaving, setSecretSaving] = useState(false);
  const [secretError, setSecretError] = useState("");
  const [articleUrl, setArticleUrl] = useState("");
  const [articleBody, setArticleBody] = useState("");

  const brainCtx = useBrainCtx(); // keep context subscription warm + give pill access
  const { adminFlags } = useAdminDevMode();
  const showBrainPill = isFeatureEnabled("multiBrain", adminFlags);
  // Per-capture brain override — does NOT change app-wide active brain.
  const [captureBrain, setCaptureBrain] = useState<Brain | null>(null);
  const effectiveBrainId = captureBrain?.id ?? brainId;
  const [showSavedWhisper, setShowSavedWhisper] = useState(false);

  // Drag-to-close + entrance animation
  const [dragY, setDragY] = useState(0);
  const [visible, setVisible] = useState(false);

  const {
    loading,
    setLoading,
    extracting,
    status,
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
    secretCandidate,
    clearSecretCandidate,
  } = useCaptureSheetParse({
    brainId: effectiveBrainId,
    isOnline,
    cryptoKey,
    onCreated,
    onClose,
    onBackgroundSave,
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialText) setText(initialText);
      // Deliberately NOT touching document.body styles. Both this sheet
      // and the Schedule drawer used to set body.style.overflow="hidden"
      // (or worse, position:fixed) to lock background scroll while the
      // drawer was open. iOS Safari treats body becoming non-scrollable
      // as a signal to re-evaluate its dynamic viewport — the URL bar
      // expands/collapses and the page content underneath the drawer
      // visibly shifts. The fixed-position scrim already swallows pointer
      // events on the background, so locking body scroll buys nothing
      // on iOS and costs a layout jump. The drawer just slides over the
      // top, leaves the background alone, the user sees no movement.
      requestAnimationFrame(() => {
        setVisible(true);
      });
      // Focus the textarea after the sheet has just enough time to be
      // mounted + the slide-up has started. Was 420ms (waited for the
      // full 360ms animation + buffer to avoid iOS touch-swallow during
      // overlapping sheet+keyboard slide-up); user feedback wants to
      // start typing immediately, so we drop to 60ms — short enough to
      // feel instant, late enough that the sheet's first paint has
      // committed so iOS lines the keyboard up cleanly.
      const focusTimer = window.setTimeout(() => {
        textareaRef.current?.focus();
      }, 60);
      // Lock background scroll for the duration of the sheet so flicks
      // outside the visible chrome don't bleed into the home view
      // beneath. We deliberately avoided this earlier because iOS
      // Safari can shift the URL bar when body becomes
      // overflow:hidden, but background scroll bleed is a worse
      // regression than that minor jump.
      const html = document.documentElement;
      const body = document.body;
      const prevHtmlOverflow = html.style.overflow;
      const prevBodyOverflow = body.style.overflow;
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
      return () => {
        window.clearTimeout(focusTimer);
        html.style.overflow = prevHtmlOverflow;
        body.style.overflow = prevBodyOverflow;
      };
    } else {
      setVisible(false);
      setText("");
      setActiveTab("entry");
      setReminderActive(false);
      setSecretForm({ title: "", content: "" });
      setSecretError("");
      setArticleUrl("");
      setArticleBody("");
      setCaptureBrain(null);
      resetState();
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialText/resetState/setLoading are stable across renders by design (parent-owned); adding them would re-run the open/close branch every render and stomp on user typing.
  }, [isOpen]);

  // React synthetic touch events on the handle, mirroring the
  // TodoCalendarChrome BottomSheet pattern that actually works on iOS.
  // The previous native addEventListener path raced against Radix
  // DialogContent's pointer/focus management — Radix sets up its outside-
  // press detection and focus-lock with its own listeners on the same
  // tree and the user reported swipe-down was unresponsive. Synthetic
  // events flow through React's event delegation and don't fight Radix
  // for the gesture. Same rubber-band logic, same threshold, same close
  // animation hand-off via setVisible(false) + setTimeout(onClose, 360).
  const dragStartY = useRef(0);
  const dragTracking = useRef(false);
  const handleTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0]?.clientY ?? 0;
    dragTracking.current = true;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragTracking.current) return;
    const dy = (e.touches[0]?.clientY ?? 0) - dragStartY.current;
    if (dy > 0) {
      const eased = dy < 200 ? dy : 200 + (dy - 200) * 0.4;
      setDragY(eased);
    } else if (dy < -8) {
      dragTracking.current = false;
      setDragY(0);
    }
  };
  const handleTouchEnd = () => {
    dragTracking.current = false;
    setDragY((prev) => {
      if (prev > 80) {
        setVisible(false);
        setTimeout(onClose, 360);
      }
      return 0;
    });
  };

  // Tab focus + Escape handled by Radix Dialog primitive below.
  // Preview-aware Escape (back-to-typing instead of close) goes through
  // onEscapeKeyDown on Content.

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
      : activeTab === "list"
        ? text.trim().length > 0
        : activeTab === "article"
          ? articleBody.trim().length > 0
          : secretForm.title.trim().length > 0 && secretForm.content.trim().length > 0;

  const handleSave = () => {
    if (activeTab !== "entry") return;
    if (reminderActive) {
      // Skip AI classification — raw text saved verbatim as a reminder.
      const t = text.trim();
      if (!t) return;
      const title = t.length > 60 ? t.slice(0, 57) + "…" : t;
      doSave({ title, content: t, type: "reminder", tags: [], metadata: {} }, t);
      setText("");
      return;
    }
    capture(text, () => setText(""));
  };

  const handleSaveList = () => {
    const t = text.trim();
    if (!t) return;
    const payload = buildListPayload(t);
    doSave(
      {
        title: payload.title,
        content: payload.content,
        type: "list",
        tags: [],
        metadata: payload.metadata,
      },
      t,
    );
    setText("");
  };

  const handleSaveArticle = () => {
    const body = articleBody.trim();
    if (!body) return;
    const payload = buildArticlePayload(articleUrl.trim(), body);
    doSave(
      {
        title: payload.title,
        content: payload.content,
        type: "article",
        tags: [],
        metadata: payload.metadata,
      },
      body,
    );
    setArticleUrl("");
    setArticleBody("");
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

  const displayedType: CaptureTypeKey =
    activeTab === "secret"
      ? "vault"
      : activeTab === "list"
        ? "list"
        : activeTab === "article"
          ? "article"
          : reminderActive
            ? "reminder"
            : "memory";

  const handlePickType = (id: CaptureTypeKey) => {
    if (id === "vault") {
      if (activeTab === "secret") return;
      if (reminderActive) setReminderActive(false);
      toggleVault();
      return;
    }
    if (id === "reminder") {
      if (reminderActive) return;
      if (activeTab !== "entry") setActiveTab("entry");
      setReminderActive(true);
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }
    if (id === "list") {
      if (reminderActive) setReminderActive(false);
      setActiveTab("list");
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }
    if (id === "article") {
      if (reminderActive) setReminderActive(false);
      setActiveTab("article");
      return;
    }
    if (activeTab !== "entry") setActiveTab("entry");
    if (reminderActive) setReminderActive(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
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

  // Secret detected by AI on a plain-text capture — user picks vault (encrypt)
  // or note (save plain). Yes flips into the vault flow with the captured
  // title + content prefilled so the user just needs to confirm. No re-saves
  // through doSave with type=note so the entry doesn't get lost.
  const handleSecretYes = () => {
    if (!secretCandidate) return;
    setSecretForm({
      title: secretCandidate.title,
      content: secretCandidate.content || (secretCandidate.metadata?.full_text as string) || "",
    });
    if (cryptoKey) {
      setActiveTab("secret");
    } else {
      // No vault key yet — send them to vault setup. They'll come back to
      // re-capture once the vault is initialised.
      if (onNavigate) onNavigate("vault");
    }
    setText("");
    clearSecretCandidate();
  };
  const handleSecretNo = () => {
    if (!secretCandidate) return;
    doSave({ ...secretCandidate, type: "note" }, text);
    setText("");
    clearSecretCandidate();
  };

  return (
    <>
      <DialogPrimitive.Root
        open={isOpen || visible}
        onOpenChange={(o) => {
          if (o) return;
          // Escape (Radix-driven close): preview-aware path goes back to
          // typing instead of closing.
          if (preview) {
            setPreview(null);
            setText(preview._raw || "");
            return;
          }
          // Run our exit animation, then tell parent to unmount.
          setVisible(false);
          setTimeout(onClose, 360);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-50"
            style={{
              background: "var(--scrim)",
              opacity: visible ? Math.max(0, 1 - dragY / 350) : 0,
              transition: dragY > 0 ? "none" : "opacity 0.32s ease",
            }}
          />
          <DialogPrimitive.Content
            ref={sheetRef}
            aria-modal="true"
            aria-label={preview ? "Confirm entry" : "Capture something"}
            className="capture-sheet"
            onEscapeKeyDown={(e) => {
              // Preview-aware: keep the preview→typing path. Radix's
              // onOpenChange already handles the regular case.
              if (preview) {
                e.preventDefault();
                setPreview(null);
                setText(preview._raw || "");
              }
            }}
            onPointerDownOutside={(e) => {
              if (preview) e.preventDefault();
            }}
            onInteractOutside={(e) => {
              if (preview) e.preventDefault();
            }}
            style={{
              background: "var(--surface-high)",
              border: "1px solid var(--line)",
              boxShadow: "var(--lift-3)",
              ["--capture-y" as string]: dragY > 0 ? `${dragY}px` : visible ? "0px" : "100%",
              transition:
                dragY > 0
                  ? "none"
                  : "--capture-y 0.36s var(--ease-emphasized), transform 0.36s var(--ease-emphasized)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              // GPU promotion — keep the slide on its own compositor
              // layer so the 360ms transition stays buttery on iOS.
              willChange: "transform",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden" as never,
            }}
          >
            <DialogPrimitive.Title className="sr-only">
              {preview ? "Confirm entry" : "Capture something"}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Quickly capture a thought, image, document, or voice note.
            </DialogPrimitive.Description>
            <div aria-live="polite" aria-atomic="true" className="sr-only">
              {loading ? "Processing your entry…" : (status ?? "")}
            </div>

            {/* Top strip — drag handle (mobile only, centered) + per-capture
              brain pill (right-aligned, only when multi-brain). The whole
              strip is the swipe-to-close grab region so users don't have
              to hit the tiny pill. Bumped to 56px tall — the previous 36px
              was a fragile hit target and combined with iOS Safari briefly
              swallowing touches during the keyboard slide-up animation
              (textarea autofocuses on open) it felt like swipe was stuck
              for a few seconds before "kicking in". A taller grab strip
              gives the user a forgiving target right out from under the
              keyboard transition. */}
            <div
              ref={handleRef}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              className="touch-none lg:touch-auto"
              style={{
                position: "relative",
                minHeight: 56,
                paddingTop: 14,
                paddingBottom: 10,
                touchAction: "none",
              }}
            >
              <div
                className="lg:hidden"
                style={{
                  position: "absolute",
                  left: "50%",
                  top: 14,
                  transform: "translateX(-50%)",
                  width: 48,
                  height: 6,
                  borderRadius: 999,
                  background: "var(--line)",
                  pointerEvents: "none",
                }}
                aria-hidden="true"
              />
            </div>

            {/* Body */}
            {secretCandidate ? (
              <SecretConfirmPanel
                title={secretCandidate.title}
                hasVault={!!cryptoKey}
                onYes={handleSecretYes}
                onNo={handleSecretNo}
                onCancel={() => clearSecretCandidate()}
              />
            ) : preview ? (
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
            ) : activeTab === "list" ? (
              <CaptureListBody
                text={text}
                onTextChange={setText}
                loading={loading}
                canSave={canSave}
                brainPill={
                  showBrainPill && brainCtx.brains.length > 1 ? (
                    <CaptureBrainPill
                      brains={brainCtx.brains}
                      activeBrain={brainCtx.activeBrain}
                      captureBrain={captureBrain}
                      onPick={(b) => setCaptureBrain(b.id === brainCtx.activeBrain?.id ? null : b)}
                    />
                  ) : undefined
                }
                typePill={<CaptureTypePill captureType={displayedType} onPick={handlePickType} />}
                onSave={handleSaveList}
              />
            ) : activeTab === "article" ? (
              <CaptureArticleBody
                url={articleUrl}
                onUrlChange={setArticleUrl}
                body={articleBody}
                onBodyChange={setArticleBody}
                loading={loading}
                canSave={canSave}
                brainPill={
                  showBrainPill && brainCtx.brains.length > 1 ? (
                    <CaptureBrainPill
                      brains={brainCtx.brains}
                      activeBrain={brainCtx.activeBrain}
                      captureBrain={captureBrain}
                      onPick={(b) => setCaptureBrain(b.id === brainCtx.activeBrain?.id ? null : b)}
                    />
                  ) : undefined
                }
                typePill={<CaptureTypePill captureType={displayedType} onPick={handlePickType} />}
                onSave={handleSaveArticle}
              />
            ) : (
              <CaptureEntryBody
                text={text}
                onTextChange={setText}
                uploadedFiles={uploadedFiles}
                listening={false}
                loading={loading}
                extracting={extracting}
                showSavedWhisper={showSavedWhisper}
                canSave={canSave}
                reminderActive={reminderActive}
                brainPill={
                  showBrainPill && brainCtx.brains.length > 1 ? (
                    <CaptureBrainPill
                      brains={brainCtx.brains}
                      activeBrain={brainCtx.activeBrain}
                      captureBrain={captureBrain}
                      onPick={(b) => setCaptureBrain(b.id === brainCtx.activeBrain?.id ? null : b)}
                    />
                  ) : undefined
                }
                typePill={<CaptureTypePill captureType={displayedType} onPick={handlePickType} />}
                statusInfo={{
                  status,
                  errorDetail,
                  fileParseError,
                  statusLabel,
                }}
                handlers={{
                  onSave: handleSave,
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
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

// ── Secret confirmation panel ─────────────────────────────────────────────
// Rendered when AI classifies a typed memory capture as type="secret".
// Two paths: Yes → flip into the encrypted vault flow with title prefilled;
// No → caller saves the same content as a plain note. Cancel returns to
// editing the original text. Uses the same inline-panel pattern as the
// preview / list / vault bodies so the modal height stays constant.

interface SecretConfirmPanelProps {
  title: string;
  hasVault: boolean;
  onYes: () => void;
  onNo: () => void;
  onCancel: () => void;
}

function SecretConfirmPanel({ title, hasVault, onYes, onNo, onCancel }: SecretConfirmPanelProps) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        padding: "32px 28px 24px",
        gap: 20,
        minHeight: 320,
      }}
    >
      <div>
        <div
          className="f-sans"
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--ember)",
            marginBottom: 10,
          }}
        >
          looks sensitive
        </div>
        <h2
          className="f-serif"
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 450,
            lineHeight: 1.25,
            letterSpacing: "-0.01em",
            color: "var(--ink)",
          }}
        >
          Save "{title}" to your Vault?
        </h2>
        <p
          className="f-serif"
          style={{
            margin: "10px 0 0",
            fontSize: 15,
            fontStyle: "italic",
            color: "var(--ink-soft)",
            lineHeight: 1.5,
          }}
        >
          {hasVault
            ? "the vault encrypts this on your device — only you can read it back."
            : "you don't have a vault yet — opening Vault setup so you can secure this."}
        </p>
      </div>

      <div
        style={{
          marginTop: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <Button onClick={onYes} style={{ width: "100%", justifyContent: "center" }}>
          {hasVault ? "Yes, save to Vault" : "Set up Vault"}
        </Button>
        <Button
          variant="outline"
          onClick={onNo}
          style={{ width: "100%", justifyContent: "center" }}
        >
          No, save as note
        </Button>
        <Button
          variant="ghost"
          onClick={onCancel}
          style={{
            width: "100%",
            justifyContent: "center",
            color: "var(--ink-faint)",
          }}
        >
          Cancel — keep editing
        </Button>
      </div>
    </div>
  );
}

// ── Inline dropdown pill ───────────────────────────────────────────────────
// Lightweight non-Radix dropdown — the previous Radix DropdownMenu inside
// the capture Dialog froze for several hundred ms on first open while
// Radix coordinated focus-scope between the two portals. Plain absolute-
// positioned div renders instantly. Outside-click + Escape both close it.

interface InlineDropdownOption {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

interface InlineDropdownPillProps {
  triggerLabel: string; // "Capturing to" / "Capture to"
  triggerValue: string; // "My Brain" / "Remember"
  triggerValueAccent?: boolean; // tints value with --ember when true
  ariaLabel: string;
  options: InlineDropdownOption[];
  selectedId: string | null;
  onPick: (id: string) => void;
}

function InlineDropdownPill({
  triggerLabel,
  triggerValue,
  triggerValueAccent,
  ariaLabel,
  options,
  selectedId,
  onPick,
}: InlineDropdownPillProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (
        menuRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="press"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 6px",
          margin: "0 -6px",
          background: "transparent",
          border: 0,
          borderRadius: 6,
          color: "var(--ink-soft)",
          fontFamily: "var(--f-sans)",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          maxWidth: 240,
        }}
      >
        <span style={{ opacity: 0.7 }}>{triggerLabel}&nbsp;</span>
        <span
          style={{
            color: triggerValueAccent ? "var(--ember)" : "var(--ink)",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {triggerValue}
        </span>
        <svg
          aria-hidden="true"
          width="11"
          height="11"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
          style={{ flexShrink: 0, opacity: 0.55, marginLeft: 1 }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 6,
            background: "var(--surface-high)",
            border: "1px solid var(--line-soft)",
            borderRadius: 8,
            boxShadow: "var(--lift-2)",
            minWidth: 180,
            zIndex: 60,
            overflow: "hidden",
            padding: "4px 0",
          }}
        >
          {options.map((opt) => {
            const selected = opt.id === selectedId;
            return (
              <button
                key={opt.id}
                type="button"
                role="menuitem"
                disabled={opt.disabled}
                onClick={() => {
                  if (opt.disabled) return;
                  onPick(opt.id);
                  setOpen(false);
                }}
                className="press"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 14px",
                  background: selected ? "var(--ember-wash, rgba(255,79,31,0.08))" : "transparent",
                  border: 0,
                  fontFamily: "var(--f-sans)",
                  fontSize: 13,
                  fontWeight: selected ? 600 : 500,
                  color: opt.disabled ? "var(--ink-faint)" : "var(--ink)",
                  cursor: opt.disabled ? "not-allowed" : "pointer",
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {opt.label}
                </span>
                {opt.hint && (
                  <span
                    className="f-sans"
                    style={{ fontSize: 11, color: "var(--ink-faint)", flexShrink: 0 }}
                  >
                    {opt.hint}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Per-capture brain override pill ────────────────────────────────────────
// Resets each time the sheet closes.

interface CaptureBrainPillProps {
  brains: Brain[];
  activeBrain: Brain | null;
  captureBrain: Brain | null;
  onPick: (b: Brain) => void;
}

function CaptureBrainPill({ brains, activeBrain, captureBrain, onPick }: CaptureBrainPillProps) {
  const target = captureBrain ?? activeBrain;
  if (!target) return null;
  const personal = brains.find((b) => b.is_personal);
  const others = brains.filter((b) => !b.is_personal).sort((a, b) => a.name.localeCompare(b.name));
  const sorted = personal ? [personal, ...others] : others;

  return (
    <InlineDropdownPill
      triggerLabel="Capturing to"
      triggerValue={target.name}
      triggerValueAccent={!!captureBrain}
      ariaLabel={`Capture into ${target.name} — change brain`}
      options={sorted.map((b) => ({ id: b.id, label: b.name }))}
      selectedId={target.id}
      onPick={(id) => {
        const next = sorted.find((b) => b.id === id);
        if (next) onPick(next);
      }}
    />
  );
}

export type CaptureTypeKey = "memory" | "list" | "article" | "vault" | "reminder";

interface CaptureTypePillProps {
  captureType: CaptureTypeKey;
  onPick: (id: CaptureTypeKey) => void;
}

const TYPE_LABELS: Record<CaptureTypeKey, string> = {
  memory: "Remember",
  list: "list",
  article: "article",
  vault: "vault",
  reminder: "reminder",
};

function CaptureTypePill({ captureType, onPick }: CaptureTypePillProps) {
  const allOptions: { id: CaptureTypeKey; hint?: string }[] = [
    { id: "memory", hint: "AI sorts" },
    { id: "list" },
    { id: "article" },
    { id: "vault" },
    { id: "reminder" },
  ];
  const accent = captureType === "vault" || captureType === "reminder";
  return (
    <InlineDropdownPill
      triggerLabel="Capture to"
      triggerValue={TYPE_LABELS[captureType]}
      triggerValueAccent={accent}
      ariaLabel={`Capturing to ${TYPE_LABELS[captureType]} — change type`}
      options={allOptions.map((o) => ({
        id: o.id,
        label: TYPE_LABELS[o.id],
        hint: o.hint,
      }))}
      selectedId={captureType}
      onPick={(id) => onPick(id as CaptureTypeKey)}
    />
  );
}

// Helper used by the inline list-body when the user saves — splits the typed
// text into a list-name + items[] via the deterministic listParser. First
// non-empty line becomes the name; remaining lines feed the parser as items.
export function buildListPayload(text: string): {
  title: string;
  content: string;
  metadata: { items: ReturnType<typeof parseListText>; list_v: 1 };
} {
  const trimmed = text.trim();
  const firstNL = trimmed.indexOf("\n");
  const title = (firstNL > 0 ? trimmed.slice(0, firstNL) : trimmed).trim() || "Untitled list";
  const itemsText = firstNL > 0 ? trimmed.slice(firstNL + 1) : "";
  const items = parseListText(itemsText);
  const itemTitles = items.map((i) => `- ${i.title}`).join("\n");
  const content = items.length ? `${title}\n\n${itemTitles}` : title;
  return { title, content, metadata: { items, list_v: 1 } };
}

// Article payload builder. Title comes from the first non-empty line of the
// pasted body; falls back to URL hostname, then "Untitled article". `url` is
// stored on metadata so DetailModal's reading view can show a source link.
export function buildArticlePayload(
  url: string,
  body: string,
): {
  title: string;
  content: string;
  metadata: { url?: string; site?: string; article_v: 1 };
} {
  const trimmed = body.trim();
  const firstLine =
    trimmed
      .split("\n")
      .find((l) => l.trim().length > 0)
      ?.trim() ?? "";
  let title = firstLine.slice(0, 200);
  let site: string | undefined;
  if (url) {
    try {
      site = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      // ignore invalid URL — leave site undefined
    }
  }
  if (!title) title = site || "Untitled article";
  return {
    title,
    content: trimmed,
    metadata: { ...(url ? { url } : {}), ...(site ? { site } : {}), article_v: 1 },
  };
}
