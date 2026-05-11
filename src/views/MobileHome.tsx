import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import { useChat } from "../hooks/useChat";
import { useVoiceMode, useGeminiLive, useGeminiVoice, type VoiceMode } from "../hooks/useVoiceMode";
import { useGeminiLiveSession } from "../hooks/useGeminiLiveSession";
import { usePendingVoiceActions } from "../hooks/usePendingVoiceActions";
import { PendingVoiceActionsBanner } from "../components/PendingVoiceActionsBanner";

interface MobileHomeProps {
  brainId: string | undefined;
  onOpenCapture: () => void;
  onOpenCaptureWith: (text: string) => void;
  onCaptureRaw: (text: string) => void;
}

type VoiceTarget = "capture" | "chat" | null;

const HOLD_THRESHOLD_MS = 250;

export default function MobileHome({
  brainId,
  onOpenCapture,
  onOpenCaptureWith,
  onCaptureRaw,
}: MobileHomeProps) {
  const [mode, setMode] = useState<"add" | "ask">("add");
  const [pressed, setPressed] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askInput, setAskInput] = useState("");
  // Orb stays centred + big in Ask mode until the user taps the text
  // input. That focus → orb shrinks + moves up so the chat panel can
  // unfold. Tapping outside the input shrinks it back.
  const [inputFocused, setInputFocused] = useState(false);
  const [voiceMode, setVoiceMode] = useVoiceMode();
  const [geminiLiveOn] = useGeminiLive();
  const [geminiVoice] = useGeminiVoice();
  const liveSession = useGeminiLiveSession();
  // Poll pending voice actions only while the orb is active. Banner is
  // hidden silently when the list is empty (during the listening/speaking
  // phase before the model has enqueued anything, and after expiry).
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
    if (mode === "ask" && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, chatLoading, mode]);

  // Wrap setMode so toggling back to Add (or away from Ask) resets the
  // focus latch — the next Ask entry should open with the orb big again
  // even if the textarea was focused last time.
  const setModeAndResetFocus = useCallback((next: "add" | "ask") => {
    setMode(next);
    setInputFocused(false);
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
    // Ask + Live = tap-to-toggle: no hold timer, no STT path. The toggle
    // itself fires on pointer-up so the press animation still shows.
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
    // Ask + Live = tap-to-toggle.
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
        // Tap: spring orb back up first, then open modal so the bounce is visible.
        window.setTimeout(() => onOpenCapture(), 220);
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
    // Don't stop the Live session on pointer cancel — it's tap-to-toggle,
    // user explicitly wants the session running until the next tap.
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
    void sendChat(text);
  }

  const transcribing = status === "transcribing";
  const isAsk = mode === "ask";
  const liveActive = liveSession.status === "listening" || liveSession.status === "speaking";
  const isSpeaking = liveSession.status === "speaking";
  const isConnecting = liveSession.status === "connecting";
  const liveShow = liveSession.status !== "idle" || !!liveSession.error;
  const animating = listening || chatLoading || liveActive || isConnecting;
  // Compact layout pins the input to the bottom and shrinks the orb so the
  // message list fills the space between. Two triggers:
  //   1. user tapped the text input (typing to chat)
  //   2. there are already messages in this session (continuing a thread)
  // Without (2), a returning Ask session with prior messages centred the
  // orb + input mid-screen with a gap below — input wasn't reachable at
  // the bottom of the viewport.
  const compact = isAsk && (inputFocused || messages.length > 0);
  const orbSize = compact ? 84 : 168;
  const logoSize = Math.round(orbSize * 0.78);
  const askLiveCopy =
    isAsk && geminiLiveOn
      ? liveActive || liveSession.status === "connecting"
        ? "tap orb to end conversation"
        : "tap orb to talk · or type below"
      : isAsk
        ? "hold orb to ask by voice · or type below"
        : "";

  return (
    <div
      style={{
        minHeight: "calc(100dvh - var(--app-header-h, 56px))",
        display: "flex",
        flexDirection: "column",
        padding: "16px 16px calc(16px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <style>{`
        @keyframes mh-ask-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes mh-clear-in {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <ModeToggle mode={mode} onChange={setModeAndResetFocus} listening={listening} />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: compact ? "flex-start" : "center",
          gap: compact ? 16 : 28,
          paddingTop: compact ? 28 : 0,
          minHeight: 0,
          transition:
            "gap 520ms cubic-bezier(0.16, 1, 0.3, 1), padding-top 520ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            opacity: compact ? 0 : 1,
            transform: compact ? "translateY(-4px) scale(0.98)" : "translateY(0) scale(1)",
            pointerEvents: compact ? "none" : "auto",
            // Slow + smooth — crossfade between Add prompt, Ask prompt, and
            // hidden-while-typing. 480ms feels considered without dragging.
            transition:
              "opacity 480ms cubic-bezier(0.16, 1, 0.3, 1), transform 480ms cubic-bezier(0.16, 1, 0.3, 1)",
            // Stop the row from collapsing height-wise when faded so the
            // orb doesn't shift as a side-effect of the text disappearing.
            height: compact ? 0 : "auto",
            overflow: "hidden",
          }}
        >
          <div
            className="f-serif"
            aria-live="polite"
            style={{
              fontSize: 16,
              fontStyle: "italic",
              color: error ? "var(--blood)" : "var(--ink-soft)",
              letterSpacing: "-0.005em",
              textAlign: "center",
              minHeight: 24,
              transition: "color 320ms ease",
            }}
          >
            {error
              ? error
              : transcribing
                ? "transcribing…"
                : listening
                  ? "recording — release to send"
                  : isAsk
                    ? askLiveCopy
                    : "Tap to add, hold to record"}
          </div>
          {!isAsk && <VoiceModePill mode={voiceMode} onChange={setVoiceMode} />}
        </div>

        <button
          type="button"
          aria-label={
            listening
              ? "Recording — release to send"
              : isAsk
                ? geminiLiveOn
                  ? liveActive || liveSession.status === "connecting"
                    ? "Tap to end voice conversation"
                    : "Tap to start voice conversation"
                  : "Hold to ask by voice"
                : "Tap to capture, hold to record"
          }
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onContextMenu={(e) => e.preventDefault()}
          data-listening={listening ? "true" : "false"}
          data-pressed={pressed ? "true" : "false"}
          data-mode={mode}
          style={{
            position: "relative",
            width: orbSize,
            height: orbSize,
            padding: 0,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            touchAction: "none",
            WebkitTapHighlightColor: "transparent",
            WebkitTouchCallout: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
            transition:
              "width 620ms cubic-bezier(0.16, 1, 0.3, 1), height 620ms cubic-bezier(0.16, 1, 0.3, 1), transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            transform: pressed ? "translateY(2px) scale(0.94)" : "translateY(0) scale(1)",
            flexShrink: 0,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: -16,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, color-mix(in oklch, var(--ember) 24%, transparent), color-mix(in oklch, var(--ember) 14%, transparent), transparent 70%)",
              filter: "blur(20px)",
              opacity: animating ? 1 : 0.55,
              transition: "opacity 240ms ease",
              animation: isSpeaking
                ? "orb-speak-glow 0.9s ease-in-out infinite"
                : animating
                  ? "hero-glow 1.6s ease-in-out infinite"
                  : "none",
            }}
          />
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "1px solid color-mix(in oklch, var(--ember) 35%, transparent)",
              animation: isSpeaking
                ? "ring-pulse 0.6s ease-in-out infinite"
                : animating
                  ? "ring-pulse 1.4s ease-in-out infinite"
                  : "none",
            }}
          />
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: -14,
              borderRadius: "50%",
              border: "1px dashed color-mix(in oklch, var(--ember) 22%, transparent)",
              animation: animating ? "orbital-spin 8s linear infinite" : "none",
              opacity: animating ? 1 : 0.4,
              transition: "opacity 240ms ease",
            }}
          />
          {/* Speaking-only: two emanating waves, staggered by 750ms so a
              ring is always travelling outward while the model talks. */}
          {isSpeaking && (
            <>
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  border: "1.5px solid color-mix(in oklch, var(--ember) 55%, transparent)",
                  animation: "orb-speak-wave 1.5s ease-out infinite",
                  pointerEvents: "none",
                }}
              />
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  border: "1.5px solid color-mix(in oklch, var(--ember) 45%, transparent)",
                  animation: "orb-speak-wave 1.5s ease-out infinite",
                  animationDelay: "750ms",
                  pointerEvents: "none",
                }}
              />
            </>
          )}
          {/* Connecting: tri-arc ember spinner around the orb. Three ember
              arcs separated by transparent gaps rotate at 1.1s, plus a
              gentle scale pulse on the orb surface so the user knows
              something is happening between mic permission and the first
              setupComplete. */}
          {isConnecting && (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: -8,
                borderRadius: "50%",
                background: `conic-gradient(
                  from 0deg,
                  var(--ember) 0deg 70deg,
                  transparent 70deg 120deg,
                  var(--ember) 120deg 190deg,
                  transparent 190deg 240deg,
                  var(--ember) 240deg 310deg,
                  transparent 310deg 360deg
                )`,
                mask: "radial-gradient(circle, transparent 47%, black 49%, black 50%, transparent 52%)",
                WebkitMask:
                  "radial-gradient(circle, transparent 47%, black 49%, black 50%, transparent 52%)",
                animation: "orb-connect-spin 1.1s linear infinite",
                pointerEvents: "none",
                opacity: 0.9,
              }}
            />
          )}
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: "var(--surface-high)",
              border: "1px solid color-mix(in oklch, var(--ember) 30%, transparent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: pressed ? "var(--lift-1)" : "var(--lift-2)",
              transition: "box-shadow 140ms ease",
              overflow: "hidden",
            }}
          >
            <img
              src="/logoNew.webp"
              width={logoSize}
              height={logoSize}
              alt=""
              aria-hidden="true"
              decoding="async"
              draggable={false}
              style={
                {
                  objectFit: "contain",
                  display: "block",
                  pointerEvents: "none",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  WebkitTouchCallout: "none",
                  WebkitUserDrag: "none",
                  transition:
                    "width 620ms cubic-bezier(0.16, 1, 0.3, 1), height 620ms cubic-bezier(0.16, 1, 0.3, 1)",
                } as React.CSSProperties
              }
            />
          </span>
        </button>

        {isAsk && (
          <div
            style={{
              width: "100%",
              maxWidth: 560,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              flex: compact ? 1 : 0,
              minHeight: 0,
              opacity: 1,
              animation: "mh-ask-in 440ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {liveShow && (
              <LiveBanner
                status={liveSession.status}
                error={liveSession.error}
                userTranscript={liveSession.userTranscript}
                assistantTranscript={liveSession.assistantTranscript}
                lastEvent={liveSession.lastEvent}
                chunksOut={liveSession.chunksOut}
                chunksIn={liveSession.chunksIn}
                closeCode={liveSession.closeCode}
                closeReason={liveSession.closeReason}
              />
            )}
            <PendingVoiceActionsBanner
              pending={pendingActions.pending}
              onAccept={pendingActions.accept}
              onReject={pendingActions.reject}
            />
            <AskPanel
              // Voice and chat are mutually exclusive in the visual stack:
              // when a Live session is non-idle the LiveBanner above shows
              // user/assistant transcripts, so hide the chat message list
              // to stop the two surfaces overlapping. Input form stays
              // visible so the user can type to stop voice and switch.
              messages={liveShow ? [] : messages}
              loading={chatLoading}
              input={askInput}
              onInputChange={setAskInput}
              onSubmit={submitAsk}
              onClear={clearHistory}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              messagesEndRef={messagesEndRef}
              brainReady={!!brainId}
              expanded={compact}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const TOGGLE_BTN_WIDTH = 78;
const TOGGLE_BTN_HEIGHT = 34;
const TOGGLE_PADDING = 3;

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
        aria-hidden="true"
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

// Map raw provider/WebSocket failures to a short, human headline.
// Detail (raw error + lastEvent + close code) stays visible underneath in a
// muted line so users can still report specifics without parsing 1008/1006/etc.
function friendlyLiveError(error: string | null, closeCode: number | null): string | null {
  if (!error) return null;
  const raw = error.toLowerCase();
  // Auth / token mint failures (server-side, before WS opens).
  if (raw.startsWith("mint:402") || raw.includes("no_ai_provider"))
    return "Add a Gemini API key in Settings to use voice.";
  if (raw.startsWith("mint:503") || raw.includes("live_not_configured"))
    return "Voice isn't enabled on the server yet.";
  if (raw.startsWith("mint:")) return "Couldn't start voice — server rejected the request.";
  // Model / config rejected by Google after handshake.
  if (raw.includes("not found") && raw.includes("bidigeneratecontent"))
    return "Voice model is unavailable. Update GEMINI_LIVE_MODEL on the server.";
  // Common WebSocket close codes.
  if (closeCode === 1008) return "Voice service rejected the request (model or auth).";
  if (closeCode === 1007) return "Voice client sent an unsupported message. Update the app.";
  if (closeCode === 1011) return "Voice service hit an internal error. Try again.";
  if (closeCode === 1006) return "Voice connection dropped. Tap mic to retry.";
  if (raw.startsWith("ws_error")) return "Voice connection failed. Check your network and retry.";
  if (raw.includes("mic_denied") || raw.includes("notallowed"))
    return "Microphone access denied. Enable it in your browser settings.";
  return "Voice session failed. Tap mic to try again.";
}

function LiveBanner({
  status,
  error,
  userTranscript,
  assistantTranscript,
  lastEvent,
  chunksOut,
  chunksIn,
  closeCode,
  closeReason,
}: {
  status: "idle" | "connecting" | "listening" | "speaking" | "error";
  error: string | null;
  userTranscript: string;
  assistantTranscript: string;
  lastEvent: string;
  chunksOut: number;
  chunksIn: number;
  closeCode: number | null;
  closeReason: string;
}) {
  const friendly = friendlyLiveError(error, closeCode);
  const label =
    status === "connecting"
      ? "connecting…"
      : status === "listening"
        ? "listening"
        : status === "speaking"
          ? "speaking"
          : status === "error"
            ? "error"
            : status === "idle"
              ? "ended"
              : "";
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 560,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "10px 14px",
        background: "var(--surface-high)",
        border: "1px solid var(--line-soft)",
        borderRadius: 12,
        boxShadow: "var(--lift-1)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div
          className="f-sans"
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: error ? "var(--blood)" : "var(--ember)",
          }}
        >
          {label}
        </div>
        <div
          className="f-sans"
          style={{
            fontSize: 10,
            color: "var(--ink-faint)",
            fontFamily: "var(--f-mono)",
          }}
        >
          out {chunksOut} · in {chunksIn}
          {closeCode !== null ? ` · close ${closeCode}` : ""}
        </div>
      </div>
      {friendly && (
        <div
          className="f-sans"
          style={{
            fontSize: 13,
            color: "var(--blood)",
            lineHeight: 1.35,
          }}
        >
          {friendly}
        </div>
      )}
      {(lastEvent || error) && (
        <div
          className="f-sans"
          style={{
            fontSize: 10,
            color: "var(--ink-faint)",
            fontFamily: "var(--f-mono)",
            wordBreak: "break-all",
            opacity: 0.75,
          }}
        >
          {error || lastEvent}
          {closeReason ? ` (${closeReason})` : ""}
        </div>
      )}
      {userTranscript && (
        <div className="f-serif" style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.45 }}>
          {userTranscript}
        </div>
      )}
      {assistantTranscript && (
        <div
          className="f-serif"
          style={{
            fontSize: 14,
            fontStyle: "italic",
            color: "var(--ink-soft)",
            lineHeight: 1.45,
          }}
        >
          {assistantTranscript}
        </div>
      )}
    </div>
  );
}

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
      style={{
        display: "flex",
        justifyContent: "center",
        marginBottom: 8,
      }}
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
          aria-hidden="true"
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

function AskPanel({
  messages,
  loading,
  input,
  onInputChange,
  onSubmit,
  onClear,
  onFocus,
  onBlur,
  messagesEndRef,
  brainReady,
  expanded,
}: {
  messages: Array<{ role: "user" | "assistant"; content: string; ts: string }>;
  loading: boolean;
  input: string;
  onInputChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClear: () => void;
  onFocus: () => void;
  onBlur: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  brainReady: boolean;
  expanded: boolean;
}) {
  const canSend = input.trim().length > 0 && !loading && brainReady;
  const hasMessages = messages.length > 0;
  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        flex: expanded ? 1 : 0,
        minHeight: 0,
      }}
    >
      {expanded && hasMessages && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "0 4px",
            animation: "mh-clear-in 240ms ease-out",
          }}
        >
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
              background: "var(--surface-high)",
              border: "1px solid var(--line-soft)",
              color: "var(--ink-soft)",
              fontFamily: "var(--f-sans)",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.01em",
              cursor: "pointer",
              boxShadow: "var(--lift-1)",
              transition: "background 180ms, color 180ms, transform 180ms",
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
              aria-hidden="true"
            >
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
            clear chat
          </button>
        </div>
      )}
      <div
        style={{
          flex: expanded ? 1 : 0,
          minHeight: 0,
          maxHeight: expanded ? "100%" : 0,
          overflowY: expanded ? "auto" : "hidden",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: expanded ? "8px 4px" : "0 4px",
          opacity: expanded ? 1 : 0,
          transition:
            "max-height 520ms cubic-bezier(0.16, 1, 0.3, 1), opacity 360ms ease, padding 320ms ease",
        }}
      >
        {messages.length === 0 && !loading && (
          <div
            className="f-serif"
            style={{
              fontSize: 14,
              fontStyle: "italic",
              color: "var(--ink-faint)",
              textAlign: "center",
              padding: "20px 0",
            }}
          >
            ask your brain anything.
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
        }}
      >
        <textarea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
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
  );
}
