import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import { useChat } from "../hooks/useChat";
import { useVoiceMode, useGeminiLive, useGeminiVoice, type VoiceMode } from "../hooks/useVoiceMode";
import { useGeminiLiveSession } from "../hooks/useGeminiLiveSession";
import { usePendingVoiceActions } from "../hooks/usePendingVoiceActions";
import { PendingVoiceActionsBanner } from "../components/PendingVoiceActionsBanner";
import { useBrain } from "../context/BrainContext";
import { authFetch } from "../lib/authFetch";
import NotificationBell from "../components/NotificationBell";
import type { AppNotification } from "../hooks/useNotifications";
import type { Brain } from "../types";

interface MobileHomeProps {
  brainId: string | undefined;
  onOpenCapture: () => void;
  onOpenCaptureWith: (text: string) => void;
  onCaptureRaw: (text: string) => void;
  onNavigate?: (id: string) => void;
  onSearch?: () => void;
  onCreateBrain?: () => void;
  entriesCount?: number;
  notifications?: AppNotification[];
  unreadCount?: number;
  onDismissNotification?: (id: string) => void;
  onMarkNotificationRead?: (id: string) => void;
  onDismissAllNotifications?: () => void;
  onAcceptMerge?: (n: AppNotification) => void;
}

type VoiceTarget = "capture" | "chat" | null;

const HOLD_THRESHOLD_MS = 250;
const ACCENT = "var(--ember)";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function todayLabel(): string {
  const d = new Date();
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export default function MobileHome({
  brainId,
  onOpenCapture,
  onOpenCaptureWith,
  onCaptureRaw,
  onNavigate,
  onSearch,
  onCreateBrain,
  entriesCount,
  notifications = [],
  unreadCount = 0,
  onDismissNotification,
  onMarkNotificationRead,
  onDismissAllNotifications,
  onAcceptMerge,
}: MobileHomeProps) {
  const [mode, setMode] = useState<"add" | "ask">("add");
  const [pressed, setPressed] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askInput, setAskInput] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sheetUserDismissed, setSheetUserDismissed] = useState(false);
  const [voiceMode, setVoiceMode] = useVoiceMode();
  const [geminiLiveOn] = useGeminiLive();
  const [geminiVoice] = useGeminiVoice();
  const liveSession = useGeminiLiveSession();
  const liveSessionActive =
    liveSession.status === "connecting" ||
    liveSession.status === "listening" ||
    liveSession.status === "speaking";
  const pendingActions = usePendingVoiceActions(liveSessionActive);

  const holdTimerRef = useRef<number | null>(null);
  const recordingRef = useRef(false);
  const liveActiveRef = useRef(false);
  const voiceTargetRef = useRef<VoiceTarget>(null);
  const voiceModeRef = useRef<VoiceMode>(voiceMode);
  const liveOnRef = useRef(geminiLiveOn);
  const liveVoiceRef = useRef(geminiVoice);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const askInputRef = useRef<HTMLInputElement | null>(null);
  const sheetInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);
  useEffect(() => {
    liveOnRef.current = geminiLiveOn;
  }, [geminiLiveOn]);
  useEffect(() => {
    liveVoiceRef.current = geminiVoice;
  }, [geminiVoice]);

  const { messages, loading: chatLoading, send: sendChat, clearHistory } = useChat(brainId);

  const handleTranscript = useCallback(
    (text: string) => {
      const target = voiceTargetRef.current;
      voiceTargetRef.current = null;
      const t = text.trim();
      if (!t) {
        if (target === "capture") onOpenCapture();
        return;
      }
      if (target === "chat") {
        void sendChat(t);
        return;
      }
      if (target === "capture") {
        if (voiceModeRef.current === "auto") onCaptureRaw(t);
        else onOpenCaptureWith(t);
      }
    },
    [onCaptureRaw, onOpenCapture, onOpenCaptureWith, sendChat],
  );

  const { listening, startVoice, stopRecording } = useVoiceRecorder({
    onTranscript: handleTranscript,
    onStatus: setStatus,
    onError: setError,
    onLoading: () => {},
  });

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    };
  }, []);

  useEffect(() => {
    // Instant + nearest so iOS Safari/PWA never tries to scroll an ancestor
    // into view alongside it — that's what was pushing the orb above the
    // viewport when a new message arrived or the input was focused.
    if (mode === "ask" && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "instant", block: "nearest" });
    }
  }, [messages, chatLoading, mode]);

  const setModeAndReset = useCallback((next: "add" | "ask") => {
    setMode(next);
    setSheetUserDismissed(false);
  }, []);

  function clearHoldTimer() {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setError(null);
    setPressed(true);
    if (mode === "ask" && liveOnRef.current) return;
    clearHoldTimer();
    const targetForHold: VoiceTarget = mode === "ask" ? "chat" : "capture";
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      recordingRef.current = true;
      voiceTargetRef.current = targetForHold;
      void startVoice();
    }, HOLD_THRESHOLD_MS);
  }

  function onPointerUp() {
    if (mode === "ask" && liveOnRef.current) {
      setPressed(false);
      if (liveActiveRef.current || liveSession.status === "connecting") {
        liveActiveRef.current = false;
        liveSession.stop();
      } else if (brainId) {
        liveActiveRef.current = true;
        void liveSession.start({ voice: liveVoiceRef.current, brainId });
      }
      return;
    }
    if (holdTimerRef.current) {
      clearHoldTimer();
      setPressed(false);
      if (mode === "add") {
        window.setTimeout(() => onOpenCapture(), 220);
      } else {
        // Ask + non-Live: tap focuses the ask input so user can type
        window.setTimeout(() => askInputRef.current?.focus(), 60);
      }
      return;
    }
    if (recordingRef.current) {
      recordingRef.current = false;
      setPressed(false);
      stopRecording();
      return;
    }
    setPressed(false);
  }

  function onPointerCancel() {
    setPressed(false);
    if (mode === "ask" && liveOnRef.current) return;
    if (holdTimerRef.current) {
      clearHoldTimer();
      return;
    }
    if (recordingRef.current) {
      recordingRef.current = false;
      voiceTargetRef.current = null;
      stopRecording();
    }
  }

  function submitAsk(e: React.FormEvent) {
    e.preventDefault();
    const text = askInput.trim();
    if (!text || chatLoading) return;
    setAskInput("");
    setSheetUserDismissed(false);
    void sendChat(text);
  }

  const transcribing = status === "transcribing";
  const isAsk = mode === "ask";
  const liveActive = liveSession.status === "listening" || liveSession.status === "speaking";
  const isConnecting = liveSession.status === "connecting";
  const animating =
    listening ||
    transcribing ||
    chatLoading ||
    liveActive ||
    isConnecting ||
    askInput.trim().length > 0;

  const [connectTimedOut, setConnectTimedOut] = useState(false);
  useEffect(() => {
    if (!isConnecting) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on transition out of connecting
      setConnectTimedOut(false);
      return;
    }
    const id = window.setTimeout(() => setConnectTimedOut(true), 10_000);
    return () => window.clearTimeout(id);
  }, [isConnecting]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const setVvh = () => {
      document.documentElement.style.setProperty("--vvh", `${vv.height}px`);
    };
    setVvh();
    vv.addEventListener("resize", setVvh);
    vv.addEventListener("scroll", setVvh);
    return () => {
      vv.removeEventListener("resize", setVvh);
      vv.removeEventListener("scroll", setVvh);
    };
  }, []);

  // Lock main-content's overflow while MobileHome is mounted. The shell
  // marks it overflow-y:auto for scroll-heavy views (memory/timeline) — on
  // the inkwell view that lets iOS scroll the focused Ask input into view
  // and pushes the orb above the viewport when the keyboard opens. Bronze
  // screen itself is overflow:hidden so nothing here should scroll.
  useEffect(() => {
    const el = document.getElementById("main-content");
    if (!el) return;
    const prev = el.style.overflow;
    el.style.overflow = "hidden";
    return () => {
      el.style.overflow = prev;
    };
  }, []);

  // When the Ask input is focused, hide the headline + inkwell stage.
  // Diagnostic confirmed bronze-screen shrinks to vvh (797→443) correctly
  // — but the 220×220 orb overflows the ~90px of remaining flex space and
  // visually paints over the headline above and the input below. Hiding
  // the orb cluster while typing reclaims that space cleanly.
  const [inputFocused, setInputFocused] = useState(false);

  // Live voice now renders its status inline on the home screen — it does
  // NOT pop the chat sheet. Sheet is reserved for actual text-chat history
  // and pending-voice-action confirmations.
  const hasChatContent = messages.length > 0 || pendingActions.pending.length > 0;
  const sheetOpen = isAsk && hasChatContent && !sheetUserDismissed;

  useEffect(() => {
    if (sheetOpen) {
      // Defer focus until paint completes so iOS doesn't auto-scroll.
      const id = window.requestAnimationFrame(() => sheetInputRef.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
    return;
  }, [sheetOpen]);

  const headline = isAsk ? (
    <>
      <span style={{ fontStyle: "italic", color: ACCENT }}>Ask</span> your brain
    </>
  ) : (
    <>
      <span style={{ fontStyle: "italic", color: ACCENT }}>Drop</span> a thought
    </>
  );
  const today = useMemo(() => todayLabel(), []);
  const meta = isAsk
    ? `${today} · search · recall · synthesize`
    : typeof entriesCount === "number"
      ? `${today} · ${entriesCount} in the well`
      : today;
  const liveStatusText = liveSession.error
    ? "voice error · tap orb to retry"
    : liveSession.status === "connecting"
      ? "connecting…"
      : liveSession.status === "listening"
        ? "connected · listening"
        : liveSession.status === "speaking"
          ? "speaking"
          : null;
  const caption = isAsk
    ? liveStatusText
      ? liveStatusText
      : geminiLiveOn
        ? "tap orb to talk · or type below"
        : "tap to type · hold to ask by voice"
    : listening
      ? "release to send"
      : transcribing
        ? "transcribing…"
        : "tap · hold to record";

  return (
    <div
      className="bronze-screen"
      style={{
        height: "100%",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        // iOS PWA: status bar overlays the top of the viewport. Reserve
        // env(safe-area-inset-top) so the inkwell header lands BELOW the
        // status bar instead of underneath it. The hidden global MobileHeader
        // used to handle this via .safe-top.
        padding: `calc(8px + env(safe-area-inset-top, 0px)) 16px calc(${isAsk ? 22 : 56}px + env(safe-area-inset-bottom, 0px))`,
        position: "relative",
        background: "var(--bg)",
      }}
    >
      <div
        style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 4, flexShrink: 0 }}
      >
        <InkwellHeader
          onMenu={() => setDrawerOpen(true)}
          onSearch={onSearch}
          notificationBell={
            onDismissNotification ? (
              <NotificationBell
                notifications={notifications}
                unreadCount={unreadCount}
                onDismiss={onDismissNotification}
                onMarkRead={onMarkNotificationRead ?? (() => {})}
                onDismissAll={onDismissAllNotifications ?? (() => {})}
                onAcceptMerge={onAcceptMerge ?? (() => {})}
              />
            ) : null
          }
        />
        <BrainPill onCreateBrain={onCreateBrain} />
        <ModeToggle mode={mode} onChange={setModeAndReset} listening={listening} />
      </div>

      {!inputFocused && (
        <div style={{ marginTop: 14, textAlign: "center", flexShrink: 0 }}>
          <div
            className="f-serif"
            style={{
              fontSize: 26,
              color: error ? "var(--blood)" : "var(--ink)",
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
              transition: "color 320ms ease",
            }}
          >
            {error ? error : headline}
          </div>
          <div
            className="f-mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              color: "var(--ink-faint)",
              textTransform: "uppercase",
              marginTop: 6,
            }}
          >
            {meta}
          </div>
        </div>
      )}

      {/* Inkwell stage. When the Ask input is focused (keyboard open) the
          residual flex space is too small for the 220×220 orb — it would
          overflow and visually paint over the headline + input. Drop the
          orb entirely while typing. Header + toggle stay at top, input
          stays at bottom of the visible viewport. */}
      <div
        style={{
          flex: inputFocused ? "0 0 0" : 1,
          height: inputFocused ? 0 : undefined,
          display: inputFocused ? "none" : "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <Inkwell
          mode={mode}
          pressed={pressed}
          listening={listening}
          animating={animating}
          isConnecting={isConnecting}
          connectTimedOut={connectTimedOut}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          caption={caption}
        />
      </div>

      {/* When the keyboard is open we have no orb above, so push the input
          down to fill the remaining space and keep it docked to the bottom
          of the visible viewport. */}
      {inputFocused && <div style={{ flex: 1, minHeight: 0 }} aria-hidden />}

      {isAsk && !sheetOpen && (
        <form onSubmit={submitAsk} style={{ marginTop: 8, flexShrink: 0 }}>
          <label
            htmlFor="ink-ask"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "0 14px",
              height: 52,
              background: "var(--surface)",
              border: `1px solid color-mix(in oklch, ${ACCENT} 32%, var(--line-soft))`,
              borderRadius: 14,
              boxShadow: `0 0 0 4px color-mix(in oklch, ${ACCENT} 8%, transparent), var(--lift-1)`,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={ACCENT}
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              ref={askInputRef}
              id="ink-ask"
              type="text"
              value={askInput}
              onChange={(e) => setAskInput(e.target.value)}
              onFocus={() => {
                setSheetUserDismissed(false);
                setInputFocused(true);
              }}
              onBlur={() => setInputFocused(false)}
              placeholder="Ask your second brain…"
              disabled={!brainId}
              style={{
                flex: 1,
                minWidth: 0,
                height: "100%",
                background: "transparent",
                border: "none",
                outline: "none",
                fontFamily: "var(--f-serif)",
                fontSize: 15,
                fontStyle: "italic",
                color: "var(--ink)",
              }}
            />
            <button
              type="submit"
              disabled={!askInput.trim() || chatLoading || !brainId}
              aria-label="Send"
              className="press f-mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.16em",
                color: askInput.trim() ? "var(--ember-ink)" : "var(--ink-faint)",
                background: askInput.trim() ? "var(--ember)" : "transparent",
                textTransform: "uppercase",
                border: askInput.trim() ? "none" : "1px solid var(--line-soft)",
                padding: "3px 8px",
                borderRadius: 6,
                cursor: askInput.trim() ? "pointer" : "default",
                transition: "background 180ms, color 180ms",
              }}
            >
              ↵
            </button>
          </label>
        </form>
      )}

      {!isAsk && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 4, flexShrink: 0 }}>
          <VoiceModePill mode={voiceMode} onChange={setVoiceMode} />
        </div>
      )}

      <ChatSheet
        open={sheetOpen}
        onClose={() => setSheetUserDismissed(true)}
        messages={messages}
        loading={chatLoading}
        input={askInput}
        onInputChange={setAskInput}
        onSubmit={submitAsk}
        onClear={() => {
          clearHistory();
          setSheetUserDismissed(true);
        }}
        sheetInputRef={sheetInputRef}
        messagesEndRef={messagesEndRef}
        brainReady={!!brainId}
        pending={pendingActions}
      />

      <InkwellDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNavigate={onNavigate}
        onCreateBrain={onCreateBrain}
      />
    </div>
  );
}

/* ── Header ─────────────────────────────────────────────────────── */

function InkwellHeader({
  onMenu,
  onSearch,
  notificationBell,
}: {
  onMenu: () => void;
  onSearch?: () => void;
  notificationBell: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 4px",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <HeaderIconButton label="Menu" onClick={onMenu}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </HeaderIconButton>
        <div className="ink-logo">
          <span className="ink-logo-mark">
            <span></span>
          </span>
          <span>everion</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {onSearch && (
          <HeaderIconButton label="Search" onClick={onSearch}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </HeaderIconButton>
        )}
        {notificationBell}
      </div>
    </div>
  );
}

function HeaderIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="press"
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        background: "var(--surface)",
        border: "1px solid var(--line-soft)",
        color: "var(--ink-soft)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

/* ── Brain pill ─────────────────────────────────────────────────── */

function BrainPill({ onCreateBrain }: { onCreateBrain?: () => void }) {
  const { activeBrain, brains, setActiveBrain } = useBrain();
  const [open, setOpen] = useState(false);
  if (!activeBrain) return null;

  const personal = brains.find((b) => b.is_personal);
  const others = brains.filter((b) => !b.is_personal).sort((a, b) => a.name.localeCompare(b.name));
  const sorted = personal ? [personal, ...others] : others;

  async function pick(brain: Brain) {
    if (brain.id === activeBrain?.id) {
      setOpen(false);
      return;
    }
    setActiveBrain(brain);
    setOpen(false);
    authFetch("/api/brains?action=set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: brain.id }),
    }).catch(() => {});
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="press"
        aria-label={`Active brain: ${activeBrain.name}. Tap to switch.`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          height: 30,
          padding: "0 12px 0 8px",
          background: "var(--surface)",
          border: "1px solid var(--line-soft)",
          borderRadius: 999,
          color: "var(--ink)",
          fontFamily: "var(--f-sans)",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: `color-mix(in oklch, ${ACCENT} 22%, var(--surface-low))`,
            border: `1px solid color-mix(in oklch, ${ACCENT} 60%, transparent)`,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: ACCENT,
            fontSize: 10,
            lineHeight: 1,
          }}
        >
          ●
        </span>
        <span
          className="f-mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.16em",
            color: "var(--ink-faint)",
            textTransform: "uppercase",
          }}
        >
          brain
        </span>
        <span
          style={{
            maxWidth: 140,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {activeBrain.name}
        </span>
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          style={{ opacity: 0.55 }}
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
            aria-hidden
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: "50%",
              transform: "translateX(-50%)",
              minWidth: 220,
              background: "var(--surface-high)",
              border: "1px solid var(--line-soft)",
              borderRadius: 14,
              padding: 6,
              boxShadow: "var(--lift-3)",
              zIndex: 41,
              animation: "fade-up 180ms ease both",
            }}
          >
            {sorted.map((b) => {
              const isActive = b.id === activeBrain.id;
              return (
                <button
                  key={b.id}
                  onClick={() => void pick(b)}
                  className="press"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "8px 8px",
                    background: isActive ? "var(--ember-wash)" : "transparent",
                    border: "none",
                    borderRadius: 8,
                    color: "var(--ink)",
                    cursor: "pointer",
                    fontFamily: "var(--f-sans)",
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: `color-mix(in oklch, ${ACCENT} 22%, var(--surface-low))`,
                      border: `1px solid color-mix(in oklch, ${ACCENT} 60%, transparent)`,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: ACCENT,
                      fontSize: 11,
                      flexShrink: 0,
                    }}
                  >
                    {b.is_personal ? "●" : "▲"}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>{b.name}</span>
                  {isActive && (
                    <span
                      className="f-mono"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.16em",
                        color: ACCENT,
                        textTransform: "uppercase",
                      }}
                    >
                      active
                    </span>
                  )}
                </button>
              );
            })}
            {onCreateBrain && (
              <>
                <div style={{ height: 1, background: "var(--line-soft)", margin: "4px 6px" }} />
                <button
                  onClick={() => {
                    setOpen(false);
                    onCreateBrain();
                  }}
                  className="press"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "8px 8px",
                    background: "transparent",
                    border: "none",
                    borderRadius: 8,
                    color: "var(--ink-soft)",
                    cursor: "pointer",
                    fontFamily: "var(--f-sans)",
                    fontSize: 13,
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      border: "1px dashed var(--line)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--ink-faint)",
                      fontSize: 14,
                      lineHeight: 1,
                    }}
                  >
                    +
                  </span>
                  <span>New brain</span>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Inkwell vessel ─────────────────────────────────────────────── */

function Inkwell({
  mode,
  pressed,
  listening,
  animating,
  isConnecting,
  connectTimedOut,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  caption,
}: {
  mode: "add" | "ask";
  pressed: boolean;
  listening: boolean;
  animating: boolean;
  isConnecting: boolean;
  connectTimedOut: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  caption: string;
}) {
  const size = 220;
  const glyph = mode === "add" ? "+" : "?";
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: `radial-gradient(circle at 50% 30%,
            color-mix(in oklch, ${ACCENT} 28%, var(--surface)) 0%,
            var(--surface) 48%,
            var(--surface-low) 100%)`,
          border: `1px solid color-mix(in oklch, ${ACCENT} 42%, transparent)`,
          boxShadow: "var(--lift-2), inset 0 -8px 18px var(--scrim)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 18,
          borderRadius: "50%",
          border: `1.5px solid color-mix(in oklch, ${ACCENT} 55%, transparent)`,
          background: "var(--surface-dim)",
          boxShadow: "inset 0 4px 14px oklch(4% 0.01 250 / 0.8)",
        }}
      />
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={mode === "add" ? "Drop a thought" : "Ask your brain"}
        data-pressed={pressed ? "true" : "false"}
        data-mode={mode}
        style={{
          position: "absolute",
          inset: 38,
          borderRadius: "50%",
          background: `radial-gradient(circle at 50% 30%,
            color-mix(in oklch, ${ACCENT} 55%, var(--ember-deep)) 0%,
            color-mix(in oklch, ${ACCENT} 30%, var(--ember-deep)) 50%,
            var(--ember-deep) 100%)`,
          border: `1px solid color-mix(in oklch, ${ACCENT} 70%, transparent)`,
          cursor: "pointer",
          padding: 0,
          transform: pressed ? "scale(0.96)" : "scale(1)",
          transition: "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          boxShadow: `
            inset 0 1px 0 color-mix(in oklch, ${ACCENT} 85%, white),
            inset 0 -6px 14px color-mix(in oklch, var(--ember-deep) 80%, transparent),
            0 0 28px color-mix(in oklch, ${ACCENT} ${animating ? 48 : 32}%, transparent),
            var(--lift-2)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          touchAction: "none",
          WebkitTapHighlightColor: "transparent",
          WebkitTouchCallout: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          animation: connectTimedOut
            ? "orb-deflate 700ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards"
            : isConnecting
              ? "orb-connect-bounce 2.2s ease-in-out infinite"
              : listening
                ? "inkwell-breathe 1.4s ease-in-out infinite"
                : "none",
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: "14%",
            left: "22%",
            width: "44%",
            height: "22%",
            background: `radial-gradient(ellipse, color-mix(in oklch, white 32%, ${ACCENT}) 0%, transparent 70%)`,
            filter: "blur(4px)",
            opacity: 0.85,
            borderRadius: "50%",
          }}
        />
        {pressed && (
          <>
            <span
              aria-hidden
              style={{
                position: "absolute",
                inset: "30%",
                borderRadius: "50%",
                border: `1.5px solid color-mix(in oklch, white 38%, ${ACCENT})`,
                animation: "inkwell-ripple 800ms ease-out forwards",
              }}
            />
            <span
              aria-hidden
              style={{
                position: "absolute",
                inset: "30%",
                borderRadius: "50%",
                border: `1px solid color-mix(in oklch, ${ACCENT} 60%, transparent)`,
                animation: "inkwell-ripple 800ms ease-out 200ms forwards",
              }}
            />
          </>
        )}
        <span
          className="f-serif"
          style={{
            position: "relative",
            zIndex: 1,
            fontSize: 36,
            color: "var(--ember-ink)",
            fontWeight: 300,
            lineHeight: 1,
            textShadow: "0 1px 2px color-mix(in oklch, var(--ember-deep) 60%, transparent)",
          }}
        >
          {glyph}
        </span>
      </button>
      <div
        className="f-mono"
        style={{
          position: "absolute",
          bottom: -22,
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: 9,
          letterSpacing: "0.2em",
          color: "var(--ink-faint)",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {caption}
      </div>
    </div>
  );
}

/* ── Toggle ─────────────────────────────────────────────────────── */

const TOGGLE_BTN_WIDTH = 78;
const TOGGLE_BTN_HEIGHT = 34;
const TOGGLE_PADDING = 3;

function ModeToggle({
  mode,
  onChange,
  listening,
}: {
  mode: "add" | "ask";
  onChange: (m: "add" | "ask") => void;
  listening: boolean;
}) {
  const thumbX = mode === "add" ? 0 : TOGGLE_BTN_WIDTH;
  return (
    <div
      role="tablist"
      aria-label="Capture mode"
      style={{ display: "flex", justifyContent: "center" }}
    >
      <div
        style={{
          position: "relative",
          display: "inline-flex",
          padding: TOGGLE_PADDING,
          background: "var(--surface-low)",
          border: "1px solid var(--line-soft)",
          borderRadius: 999,
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: TOGGLE_PADDING,
            left: TOGGLE_PADDING,
            width: TOGGLE_BTN_WIDTH,
            height: TOGGLE_BTN_HEIGHT,
            borderRadius: 999,
            background: "var(--ember)",
            boxShadow: listening
              ? "0 0 0 2px color-mix(in oklch, var(--ember) 50%, transparent), var(--lift-1)"
              : "var(--lift-1)",
            transform: `translateX(${thumbX}px)`,
            transition: "transform 520ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 260ms ease",
            animation: listening ? "ring-pulse 1.4s ease-in-out infinite" : "none",
          }}
        />
        {(["add", "ask"] as const).map((m) => {
          const active = mode === m;
          return (
            <button
              key={m}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(m)}
              className="press"
              style={{
                position: "relative",
                width: TOGGLE_BTN_WIDTH,
                height: TOGGLE_BTN_HEIGHT,
                minHeight: TOGGLE_BTN_HEIGHT,
                borderRadius: 999,
                fontFamily: "var(--f-sans)",
                fontSize: 13,
                fontWeight: 600,
                background: "transparent",
                color: active ? "var(--ember-ink)" : "var(--ink-soft)",
                border: "none",
                cursor: "pointer",
                textTransform: "capitalize",
                transition: "color 360ms cubic-bezier(0.16, 1, 0.3, 1)",
                zIndex: 1,
              }}
            >
              {m}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Voice mode pill (preview / auto) ───────────────────────────── */

const VOICE_PILL_W = 56;
const VOICE_PILL_H = 22;
const VOICE_PILL_PAD = 2;

function VoiceModePill({ mode, onChange }: { mode: VoiceMode; onChange: (m: VoiceMode) => void }) {
  const thumbX = mode === "preview" ? 0 : VOICE_PILL_W;
  return (
    <div
      role="tablist"
      aria-label="Voice capture mode"
      style={{
        position: "relative",
        display: "inline-flex",
        padding: VOICE_PILL_PAD,
        background: "var(--surface-low)",
        border: "1px solid var(--line-soft)",
        borderRadius: 999,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: VOICE_PILL_PAD,
          left: VOICE_PILL_PAD,
          width: VOICE_PILL_W,
          height: VOICE_PILL_H,
          borderRadius: 999,
          background: "var(--surface-high)",
          boxShadow: "var(--lift-1)",
          transform: `translateX(${thumbX}px)`,
          transition: "transform 360ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />
      {(["preview", "auto"] as const).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m)}
            className="press"
            style={{
              position: "relative",
              width: VOICE_PILL_W,
              height: VOICE_PILL_H,
              minHeight: VOICE_PILL_H,
              borderRadius: 999,
              fontFamily: "var(--f-sans)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.02em",
              background: "transparent",
              color: active ? "var(--ink)" : "var(--ink-faint)",
              border: "none",
              cursor: "pointer",
              textTransform: "capitalize",
              transition: "color 320ms cubic-bezier(0.16, 1, 0.3, 1)",
              zIndex: 1,
            }}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}

/* ── Chat sheet ─────────────────────────────────────────────────── */

type PendingShape = ReturnType<typeof usePendingVoiceActions>;

function ChatSheet({
  open,
  onClose,
  messages,
  loading,
  input,
  onInputChange,
  onSubmit,
  onClear,
  sheetInputRef,
  messagesEndRef,
  brainReady,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  messages: Array<{ role: "user" | "assistant"; content: string; ts: string }>;
  loading: boolean;
  input: string;
  onInputChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClear: () => void;
  sheetInputRef: React.RefObject<HTMLTextAreaElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  brainReady: boolean;
  pending: PendingShape;
}) {
  if (!open) return null;
  const canSend = input.trim().length > 0 && !loading && brainReady;
  return (
    <>
      <div className="inkwell-sheet-scrim" onClick={onClose} aria-hidden />
      <div className="inkwell-sheet">
        <div className="inkwell-sheet-grip" />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <div
            className="f-mono"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.12em",
              color: "var(--ember)",
              textTransform: "uppercase",
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "var(--ember)",
                boxShadow: "0 0 8px var(--ember)",
              }}
            />
            <span>ASKING</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                aria-label="Clear chat"
                className="press"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  height: 26,
                  padding: "0 10px 0 8px",
                  borderRadius: 999,
                  background: "var(--surface-low)",
                  border: "1px solid var(--line-soft)",
                  color: "var(--ink-soft)",
                  fontFamily: "var(--f-sans)",
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <svg
                  width="11"
                  height="11"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                </svg>
                clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close chat"
              className="press"
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "transparent",
                border: "1px solid var(--line-soft)",
                color: "var(--ink-faint)",
                fontSize: 14,
                cursor: "pointer",
                padding: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M6 6l12 12M18 6l-12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="inkwell-sheet-body">
          {pending.pending.length > 0 && (
            <div style={{ width: "100%" }}>
              <PendingVoiceActionsBanner
                pending={pending.pending}
                onAccept={pending.accept}
                onReject={pending.reject}
              />
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                padding: "10px 14px",
                borderRadius: 14,
                background: m.role === "user" ? "var(--ember)" : "var(--surface-high)",
                color: m.role === "user" ? "var(--ember-ink)" : "var(--ink)",
                border: m.role === "user" ? "none" : "1px solid var(--line-soft)",
                fontFamily: "var(--f-sans)",
                fontSize: 14,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {m.content}
            </div>
          ))}
          {loading && (
            <div
              style={{
                alignSelf: "flex-start",
                padding: "10px 14px",
                borderRadius: 14,
                background: "var(--surface-high)",
                border: "1px solid var(--line-soft)",
                fontSize: 14,
                color: "var(--ink-faint)",
                fontStyle: "italic",
              }}
            >
              thinking…
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form
          onSubmit={onSubmit}
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
            background: "var(--surface-high)",
            border: "1px solid var(--line-soft)",
            borderRadius: 18,
            padding: "8px 8px 8px 14px",
            boxShadow: "var(--lift-1)",
            marginTop: 10,
          }}
        >
          <textarea
            ref={sheetInputRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e);
              }
            }}
            placeholder={brainReady ? "ask everion…" : "loading brain…"}
            disabled={!brainReady}
            rows={1}
            style={{
              flex: 1,
              resize: "none",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--ink)",
              fontFamily: "var(--f-sans)",
              fontSize: 16,
              lineHeight: 1.4,
              padding: "8px 0",
              maxHeight: 120,
            }}
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            className="press"
            style={{
              width: 36,
              height: 36,
              minHeight: 36,
              borderRadius: "50%",
              background: canSend ? "var(--ember)" : "var(--surface-low)",
              color: canSend ? "var(--ember-ink)" : "var(--ink-faint)",
              border: "none",
              cursor: canSend ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "background 180ms, color 180ms",
            }}
          >
            <svg
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
            >
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </form>
      </div>
    </>
  );
}

/* ── Drawer ─────────────────────────────────────────────────────── */

interface DrawerItem {
  icon: DrawerIconKind;
  label: string;
  meta?: string;
  swatch?: string;
  viewId?: string;
  /** Optional SettingsView tab id; routed via ?tab=<id> query param. */
  settingsTab?: string;
  onClick?: () => void;
}

interface DrawerSection {
  title: string;
  items: DrawerItem[];
}

type DrawerIconKind =
  | "well"
  | "calendar"
  | "tag"
  | "voice"
  | "photo"
  | "brain"
  | "key"
  | "lock"
  | "tune"
  | "user";

function DrawerIcon({ kind }: { kind: DrawerIconKind }) {
  const props = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (kind) {
    case "well":
      return (
        <svg {...props}>
          <ellipse cx="12" cy="9" rx="7" ry="3" />
          <path d="M5 9c0 5 2 9 7 9s7-4 7-9" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...props}>
          <rect x="4" y="5" width="16" height="16" rx="2" />
          <path d="M4 10h16M9 3v4M15 3v4" />
        </svg>
      );
    case "tag":
      return (
        <svg {...props}>
          <path d="M3 12 12 3h8v8l-9 9z" />
          <circle cx="15" cy="8" r="1.2" />
        </svg>
      );
    case "voice":
      return (
        <svg {...props}>
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      );
    case "photo":
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="11" r="2" />
          <path d="m3 18 5-5 4 4 3-3 6 6" />
        </svg>
      );
    case "brain":
      return (
        <svg {...props}>
          <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 1 5 3 3 0 0 0 4 3V4z" />
          <path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-1 5 3 3 0 0 1-4 3V4z" />
        </svg>
      );
    case "key":
      return (
        <svg {...props}>
          <circle cx="8" cy="15" r="4" />
          <path d="m10.5 13 9-9M16 7l2 2M14 9l2 2" />
        </svg>
      );
    case "lock":
      return (
        <svg {...props}>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      );
    case "tune":
      return (
        <svg {...props}>
          <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
          <circle cx="16" cy="6" r="2" />
          <circle cx="10" cy="12" r="2" />
          <circle cx="18" cy="18" r="2" />
        </svg>
      );
    case "user":
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      );
  }
}

function InkwellDrawer({
  open,
  onClose,
  onNavigate,
  onCreateBrain,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate?: (id: string) => void;
  onCreateBrain?: () => void;
}) {
  const { activeBrain, brains, setActiveBrain } = useBrain();

  const navigate = (item: DrawerItem) => {
    if (item.onClick) {
      onClose();
      item.onClick();
      return;
    }
    if (!item.viewId) return;
    if (item.settingsTab) {
      // SettingsView reads ?tab=<id> on mount. Push the param BEFORE setView
      // so the remount reads the right tab.
      const url = new URL(window.location.href);
      url.searchParams.set("tab", item.settingsTab);
      window.history.replaceState({}, "", url);
    }
    onClose();
    onNavigate?.(item.viewId);
  };

  async function pick(brain: Brain) {
    if (brain.id === activeBrain?.id) {
      onClose();
      return;
    }
    setActiveBrain(brain);
    onClose();
    authFetch("/api/brains?action=set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: brain.id }),
    }).catch(() => {});
  }

  const librarySection: DrawerSection = {
    title: "Library",
    items: [
      { icon: "well", label: "Inkwell", viewId: "home" },
      { icon: "calendar", label: "Memory", viewId: "memory" },
      { icon: "lock", label: "Vault", viewId: "vault" },
    ],
  };

  const settingsSection: DrawerSection = {
    title: "Settings",
    items: [
      { icon: "user", label: "Persona", viewId: "settings", settingsTab: "persona" },
      { icon: "tune", label: "AI", viewId: "settings", settingsTab: "ai" },
      { icon: "brain", label: "Brain", viewId: "settings", settingsTab: "brain" },
      { icon: "key", label: "Notifications", viewId: "settings", settingsTab: "notifications" },
      { icon: "user", label: "Account", viewId: "settings", settingsTab: "account" },
      { icon: "tune", label: "Billing", viewId: "settings", settingsTab: "billing" },
      { icon: "lock", label: "Privacy", viewId: "settings", settingsTab: "privacy" },
    ],
  };

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 60,
          background: "color-mix(in oklch, oklch(8% 0.01 250) 60%, transparent)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 280ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
      <aside
        aria-hidden={!open}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          width: "82%",
          maxWidth: 320,
          zIndex: 61,
          transform: open ? "translateX(0)" : "translateX(-101%)",
          transition: "transform 360ms cubic-bezier(0.16, 1, 0.3, 1)",
          background: `linear-gradient(180deg,
            color-mix(in oklch, var(--ember) 14%, var(--surface-high)) 0%,
            var(--surface-high) 30%,
            var(--surface) 100%)`,
          borderRight: "1px solid color-mix(in oklch, var(--ember) 28%, var(--line-soft))",
          boxShadow: "8px 0 40px oklch(4% 0.01 250 / 0.55)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          // Reserve iOS status-bar height so the drawer logo + close button
          // don't sit behind the status bar (same fix MobileHome itself uses).
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -120,
            right: -120,
            width: 280,
            height: 280,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, color-mix(in oklch, var(--ember) 28%, transparent), transparent 65%)",
            filter: "blur(20px)",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px 12px",
            borderBottom: "1px solid color-mix(in oklch, var(--ember) 14%, var(--line-soft))",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div className="ink-logo">
            <span className="ink-logo-mark">
              <span></span>
            </span>
            <span>everion</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="press"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "var(--surface)",
              border: "1px solid var(--line-soft)",
              color: "var(--ink-soft)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </div>

        <nav
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 8px 12px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <DrawerSectionRender section={librarySection} onItemClick={(it) => navigate(it)} />

          <div style={{ marginTop: 14 }}>
            <div
              className="f-mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.2em",
                color: "var(--ink-faint)",
                textTransform: "uppercase",
                padding: "4px 12px 6px",
              }}
            >
              Workspaces
            </div>
            {brains.map((b) => {
              const isActive = b.id === activeBrain?.id;
              return (
                <button
                  key={b.id}
                  onClick={() => void pick(b)}
                  className="press"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    padding: "10px 12px",
                    background: "transparent",
                    border: "none",
                    borderRadius: 10,
                    cursor: "pointer",
                    color: "var(--ink)",
                    fontFamily: "var(--f-sans)",
                    fontSize: 14,
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 9,
                      background: `color-mix(in oklch, ${ACCENT} 18%, var(--surface-low))`,
                      border: `1px solid color-mix(in oklch, ${ACCENT} 50%, transparent)`,
                      color: ACCENT,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <DrawerIcon kind="brain" />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>{b.name}</span>
                  {isActive && (
                    <span
                      className="f-mono"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        color: "var(--ember)",
                        padding: "3px 7px",
                        background: "var(--ember-wash)",
                        borderRadius: 999,
                        border: "1px solid color-mix(in oklch, var(--ember) 36%, transparent)",
                      }}
                    >
                      active
                    </span>
                  )}
                </button>
              );
            })}
            {onCreateBrain && (
              <button
                onClick={() => {
                  onClose();
                  onCreateBrain();
                }}
                className="press"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: "10px 12px",
                  background: "transparent",
                  border: "none",
                  borderRadius: 10,
                  cursor: "pointer",
                  color: "var(--ink-soft)",
                  fontFamily: "var(--f-sans)",
                  fontSize: 14,
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    border: "1px dashed var(--line)",
                    color: "var(--ink-faint)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  +
                </span>
                <span>New brain</span>
              </button>
            )}
          </div>

          <DrawerSectionRender
            section={settingsSection}
            onItemClick={(it) => navigate(it)}
            topMargin={14}
          />
        </nav>

        <div
          style={{
            padding: "10px 14px 14px",
            borderTop: "1px solid color-mix(in oklch, var(--ember) 14%, var(--line-soft))",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            className="f-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.18em",
              color: "var(--ink-faint)",
              textTransform: "uppercase",
            }}
          >
            everion mind
          </div>
        </div>
      </aside>
    </>
  );
}

function DrawerSectionRender({
  section,
  onItemClick,
  topMargin = 6,
}: {
  section: DrawerSection;
  onItemClick: (it: DrawerItem) => void;
  topMargin?: number;
}) {
  return (
    <div style={{ marginTop: topMargin }}>
      <div
        className="f-mono"
        style={{
          fontSize: 9,
          letterSpacing: "0.2em",
          color: "var(--ink-faint)",
          textTransform: "uppercase",
          padding: "4px 12px 6px",
        }}
      >
        {section.title}
      </div>
      {section.items.map((it, i) => (
        <button
          key={i}
          onClick={() => onItemClick(it)}
          className="press"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            width: "100%",
            padding: "10px 12px",
            background: "transparent",
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
            color: "var(--ink)",
            fontFamily: "var(--f-sans)",
            fontSize: 14,
            textAlign: "left",
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: "var(--surface-low)",
              border: "1px solid var(--line-soft)",
              color: "var(--ink-soft)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <DrawerIcon kind={it.icon} />
          </span>
          <span style={{ flex: 1 }}>{it.label}</span>
          {it.meta && (
            <span
              className="f-mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--ink-faint)",
              }}
            >
              {it.meta}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
