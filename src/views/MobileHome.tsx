import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import { useChat } from "../hooks/useChat";
import { useVoiceMode, useGeminiLive, useGeminiVoice, type VoiceMode } from "../hooks/useVoiceMode";
import { useGeminiLiveSession } from "../hooks/useGeminiLiveSession";
import { usePendingVoiceActions } from "../hooks/usePendingVoiceActions";
import { PendingVoiceActionsBanner } from "../components/PendingVoiceActionsBanner";
import NotificationBell from "../components/NotificationBell";
import InkwellBrainPill from "../components/InkwellBrainPill";
import type { AppNotification } from "../hooks/useNotifications";

interface MobileHomeProps {
  brainId: string | undefined;
  onOpenCapture: () => void;
  onOpenCaptureWith: (text: string) => void;
  onCaptureRaw: (text: string) => void;
  onSearch?: () => void;
  onOpenMenu?: () => void;
  onCreateBrain?: () => void;
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
// Button-only accent — theme-locked so the inner ember well of the
// inkwell stays visually identical in light mode. Rim and ring keep
// using ACCENT so they still adapt to theme.
const BTN_ACCENT = "var(--ember-fixed)";
const BTN_DEEP = "var(--ember-deep-fixed)";
// Glyph colour DOES adapt to theme — dark on brass in dark mode,
// white in light mode. Token defined in family-bronze.css.
const BTN_GLYPH = "var(--orb-glyph)";

export default function MobileHome({
  brainId,
  onOpenCapture,
  onOpenCaptureWith,
  onCaptureRaw,
  onSearch,
  onOpenMenu,
  onCreateBrain,
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
      }
      // Ask + non-Live: tap is a no-op. The orb is reserved for voice
      // (hold to record); typing is started by tapping the chat box.
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

  // ── Live voice "thinking" state ──────────────────────────────────
  // The Gemini Live session stays in "listening" status between the user
  // ending their utterance and the model starting its response — there's
  // no explicit thinking signal. Derive one from transcript growth: when
  // userTranscript stops growing for >700ms while status is still listening,
  // we're thinking. Reset on speaking transition.
  const lastUserTranscriptGrowthRef = useRef(0);
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    lastUserTranscriptGrowthRef.current = Date.now();
  }, [liveSession.userTranscript]);

  useEffect(() => {
    const isListening = liveSession.status === "listening";
    const hasUserText = !!liveSession.userTranscript;
    if (!isListening || !hasUserText) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- subscribing to live session status to derive a "thinking" pseudo-state the server doesn't expose; resets to false on status transition out of listening or empty user transcript.
      setThinking(false);
      return;
    }
    const check = () => {
      const since = Date.now() - lastUserTranscriptGrowthRef.current;
      setThinking(since > 700);
    };
    check();
    const id = window.setInterval(check, 200);
    return () => window.clearInterval(id);
  }, [liveSession.status, liveSession.userTranscript]);

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

  // Belt-and-braces scroll-pin. iOS PWA can ignore overflow:hidden on
  // ancestors and still scroll something on input focus. Force scrollTop
  // back to 0 on every scroll event from window, document, and main-content.
  useEffect(() => {
    const main = document.getElementById("main-content");
    const reset = () => {
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      const doc = document.scrollingElement;
      if (doc && doc.scrollTop !== 0) doc.scrollTop = 0;
      if (main && main.scrollTop !== 0) main.scrollTop = 0;
    };
    window.addEventListener("scroll", reset, { passive: true, capture: true });
    document.addEventListener("scroll", reset, { passive: true, capture: true });
    main?.addEventListener("scroll", reset, { passive: true });
    return () => {
      window.removeEventListener("scroll", reset, { capture: true } as EventListenerOptions);
      document.removeEventListener("scroll", reset, { capture: true } as EventListenerOptions);
      main?.removeEventListener("scroll", reset);
    };
  }, []);

  // Live voice now renders its status inline on the home screen — it does
  // NOT pop the chat sheet. Sheet is reserved for actual text-chat history
  // and pending-voice-action confirmations.
  const hasChatContent = messages.length > 0 || pendingActions.pending.length > 0;
  // sheetExplicitOpen lets the user pop the sheet by tapping the inline
  // ask field BEFORE there's any content — saves the click-twice-to-send
  // jank where the inline form's submit also opened the sheet.
  const [sheetExplicitOpen, setSheetExplicitOpen] = useState(false);
  const sheetOpen = isAsk && (hasChatContent || sheetExplicitOpen) && !sheetUserDismissed;

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
  const liveStatusText = liveSession.error
    ? "voice error · tap orb to retry"
    : liveSession.status === "connecting"
      ? "connecting…"
      : thinking
        ? "thinking…"
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
        //
        // Bottom: zero padding in both modes — content sits flush with
        // the screen edge. The iOS home indicator overlays the bottom
        // automatically and adapts contrast to whatever's behind it.
        padding: `calc(8px + env(safe-area-inset-top, 0px)) 16px 0px`,
        position: "relative",
        background: "var(--bg)",
      }}
    >
      <div
        style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 4, flexShrink: 0 }}
      >
        <InkwellHeader
          onMenu={onOpenMenu}
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
        <InkwellBrainPill onCreateBrain={onCreateBrain} />
        <ModeToggle mode={mode} onChange={setModeAndReset} listening={listening} />
      </div>

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
      </div>

      {/* Inkwell stage. flex:1 fills remaining vertical space and the
          orb sits centered. Sheet, when open, covers it. */}
      <div
        style={{
          flex: 1,
          display: "flex",
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
          isSpeaking={liveSession.status === "speaking"}
          isThinking={thinking}
          connectTimedOut={connectTimedOut}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          caption={caption}
        />
      </div>

      {isAsk && !sheetOpen && (
        <button
          type="button"
          aria-label="Open chat"
          disabled={!brainId}
          onClick={() => {
            setSheetUserDismissed(false);
            setSheetExplicitOpen(true);
          }}
          style={{
            // Pinned to the visual viewport. -30px shaves the gap below
            // it so the button sits closer to the home indicator strip;
            // max(0px, ...) clamps so it never extends off-screen.
            position: "fixed",
            left: 16,
            right: 16,
            bottom:
              "max(0px, calc(100vh - var(--vvh, 100vh) + var(--edge-bottom-pad, 0px) - 30px))",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 14px",
            height: 52,
            background: "var(--surface)",
            border: `1px solid color-mix(in oklch, ${ACCENT} 32%, var(--line-soft))`,
            borderRadius: 14,
            boxShadow: `0 0 0 4px color-mix(in oklch, ${ACCENT} 8%, transparent), var(--lift-1)`,
            cursor: "pointer",
            textAlign: "left",
            color: "var(--ink-faint)",
            fontFamily: "var(--f-serif)",
            fontSize: 15,
            fontStyle: "italic",
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
          <span style={{ flex: 1, minWidth: 0 }}>Ask your second brain…</span>
        </button>
      )}

      {!isAsk && (
        <div
          style={{
            // Mirror Ask's absolute-bottom pin so both modes share the
            // same flex flow (header + headline + flex:1 stage). Without
            // this the stage is shorter in Add (pill in flow) than Ask
            // (form absolute), and the orb visibly jumps when toggling.
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "calc(24px + var(--edge-bottom-pad, 0px))",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}
        >
          <VoiceModePill mode={voiceMode} onChange={setVoiceMode} />
          <div
            className="f-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.16em",
              color: "var(--ink-faint)",
              textTransform: "uppercase",
              textAlign: "center",
              maxWidth: 280,
              lineHeight: 1.4,
            }}
          >
            {voiceMode === "preview"
              ? "preview · edit before saving"
              : "auto · saves voice notes straight away"}
          </div>
        </div>
      )}

      <ChatSheet
        open={sheetOpen}
        onClose={() => {
          setSheetUserDismissed(true);
          setSheetExplicitOpen(false);
        }}
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
    </div>
  );
}

/* ── Header ─────────────────────────────────────────────────────── */

function InkwellHeader({
  onMenu,
  onSearch,
  notificationBell,
}: {
  onMenu?: () => void;
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
        <img
          src="/logoNew.webp"
          width={28}
          height={28}
          alt=""
          aria-hidden
          decoding="async"
          style={{ flexShrink: 0, objectFit: "contain", display: "block" }}
        />
        <span
          className="f-serif"
          style={{
            fontSize: 18,
            fontWeight: 450,
            letterSpacing: "-0.01em",
            color: "var(--ink)",
            whiteSpace: "nowrap",
          }}
        >
          Everion Mind
        </span>
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
        {onMenu && (
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
        )}
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
        // Blend into the header — no surface bg, no border, just the icon.
        background: "transparent",
        border: "none",
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

/* BrainPill moved to ../components/InkwellBrainPill (shared with MobileHeader) */

/* ── Inkwell vessel ─────────────────────────────────────────────── */

function Inkwell({
  mode,
  pressed,
  listening,
  animating,
  isConnecting,
  isSpeaking,
  isThinking,
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
  isSpeaking: boolean;
  isThinking: boolean;
  connectTimedOut: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  caption: string;
}) {
  const size = 220;
  const glyph = mode === "add" ? "+" : "?";
  // Plus reads visually smaller than the question mark at the same
  // pt size, so render it a touch larger.
  const glyphFontSize = mode === "add" ? 44 : 36;
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
            color-mix(in oklch, ${BTN_ACCENT} 55%, ${BTN_DEEP}) 0%,
            color-mix(in oklch, ${BTN_ACCENT} 30%, ${BTN_DEEP}) 50%,
            ${BTN_DEEP} 100%)`,
          border: `1px solid color-mix(in oklch, ${BTN_ACCENT} 70%, transparent)`,
          cursor: "pointer",
          padding: 0,
          transform: pressed ? "scale(0.96)" : "scale(1)",
          transition: "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          boxShadow: `
            inset 0 1px 0 color-mix(in oklch, ${BTN_ACCENT} 85%, white),
            inset 0 -6px 14px color-mix(in oklch, ${BTN_DEEP} 80%, transparent),
            0 0 28px color-mix(in oklch, ${BTN_ACCENT} ${animating ? 48 : 32}%, transparent),
            var(--lift-2-fixed)`,
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
              : isSpeaking
                ? "orb-speak-glow 0.9s ease-in-out infinite"
                : isThinking
                  ? "inkwell-breathe 1.0s ease-in-out infinite"
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
            background: `radial-gradient(ellipse, color-mix(in oklch, white 32%, ${BTN_ACCENT}) 0%, transparent 70%)`,
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
                border: `1.5px solid color-mix(in oklch, white 38%, ${BTN_ACCENT})`,
                animation: "inkwell-ripple 800ms ease-out forwards",
              }}
            />
            <span
              aria-hidden
              style={{
                position: "absolute",
                inset: "30%",
                borderRadius: "50%",
                border: `1px solid color-mix(in oklch, ${BTN_ACCENT} 60%, transparent)`,
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
            fontSize: glyphFontSize,
            color: BTN_GLYPH,
            fontWeight: 300,
            lineHeight: 1,
            textShadow: `0 1px 2px color-mix(in oklch, ${BTN_DEEP} 60%, transparent)`,
          }}
        >
          {glyph}
        </span>
      </button>
      <div
        className="f-mono"
        style={{
          position: "absolute",
          bottom: -46,
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

/* ── Tiny markdown renderer ─────────────────────────────────────── */

// LLM output uses **bold**, *italic*, `code`, bullet/numbered lists,
// and the occasional ## heading. A full markdown lib is overkill for
// chat bubbles, so this stateless pair turns those into React nodes.

function renderInline(text: string, baseKey: number): ReactNode {
  const out: ReactNode[] = [];
  // Match bold first (longer pattern), then code, then italic.
  const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(<Fragment key={`${baseKey}-t${i++}`}>{text.slice(last, m.index)}</Fragment>);
    }
    const tok = m[0];
    if (tok.startsWith("**")) {
      out.push(<strong key={`${baseKey}-b${i++}`}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`")) {
      out.push(
        <code
          key={`${baseKey}-c${i++}`}
          style={{
            fontFamily: "var(--f-mono)",
            fontSize: "0.92em",
            background: "var(--surface-low)",
            padding: "1px 5px",
            borderRadius: 4,
          }}
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else {
      out.push(<em key={`${baseKey}-i${i++}`}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) {
    out.push(<Fragment key={`${baseKey}-t${i++}`}>{text.slice(last)}</Fragment>);
  }
  return out;
}

function MarkdownText({ text }: { text: string }) {
  // Split into blocks separated by blank lines, then classify each.
  const blocks = text.split(/\n\s*\n/);
  return (
    <>
      {blocks.map((raw, bi) => {
        const block = raw.replace(/^\n+|\n+$/g, "");
        if (!block) return null;
        const lines = block.split(/\r?\n/);

        const bulletRe = /^\s*[-*•]\s+(.*)$/;
        const numberedRe = /^\s*\d+\.\s+(.*)$/;
        const headerRe = /^(#{1,3})\s+(.*)$/;

        if (lines.every((l) => bulletRe.test(l))) {
          return (
            <ul key={bi} style={{ margin: "4px 0", paddingLeft: 18 }}>
              {lines.map((l, li) => {
                const text = l.match(bulletRe)?.[1] ?? "";
                return (
                  <li key={li} style={{ margin: "2px 0" }}>
                    {renderInline(text, li)}
                  </li>
                );
              })}
            </ul>
          );
        }
        if (lines.every((l) => numberedRe.test(l))) {
          return (
            <ol key={bi} style={{ margin: "4px 0", paddingLeft: 22 }}>
              {lines.map((l, li) => {
                const text = l.match(numberedRe)?.[1] ?? "";
                return (
                  <li key={li} style={{ margin: "2px 0" }}>
                    {renderInline(text, li)}
                  </li>
                );
              })}
            </ol>
          );
        }
        const h = lines[0]?.match(headerRe);
        if (h && lines.length === 1) {
          const lvl = h[1].length;
          const fontSize = lvl === 1 ? 17 : lvl === 2 ? 15 : 14;
          return (
            <div key={bi} style={{ margin: "4px 0 2px", fontSize, fontWeight: 600 }}>
              {renderInline(h[2], 0)}
            </div>
          );
        }
        return (
          <p key={bi} style={{ margin: "0 0 6px" }}>
            {lines.map((line, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(line, li)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
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
  const dragStartY = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [dragY, setDragY] = useState(0);
  const SWIPE_CLOSE_THRESHOLD = 100;

  function onGripPointerDown(e: React.PointerEvent) {
    dragStartY.current = e.clientY;
    setDragging(true);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }
  function onGripPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const dy = e.clientY - dragStartY.current;
    setDragY(dy > 0 ? dy : 0);
  }
  function onGripPointerEnd() {
    if (!dragging) return;
    setDragging(false);
    if (dragY > SWIPE_CLOSE_THRESHOLD) {
      onClose();
    }
    setDragY(0);
  }

  if (!open) return null;
  const canSend = input.trim().length > 0 && !loading && brainReady;
  return (
    <>
      <div className="inkwell-sheet-scrim" onClick={onClose} aria-hidden />
      <div
        className="inkwell-sheet"
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : "transform 220ms ease",
        }}
      >
        <div
          onPointerDown={onGripPointerDown}
          onPointerMove={onGripPointerMove}
          onPointerUp={onGripPointerEnd}
          onPointerCancel={onGripPointerEnd}
          aria-label="Drag to close"
          style={{
            // Big invisible tap zone around the visible grip line so a
            // swipe-down anywhere near the top of the sheet closes it.
            padding: "12px 0",
            margin: "-12px -16px 0",
            touchAction: "none",
            cursor: "grab",
          }}
        >
          <div className="inkwell-sheet-grip" />
        </div>
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
                wordBreak: "break-word",
              }}
            >
              {m.role === "assistant" ? (
                <MarkdownText text={m.content} />
              ) : (
                <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span>
              )}
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
