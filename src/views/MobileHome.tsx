import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import { useChat } from "../hooks/useChat";
import { useBrain } from "../context/BrainContext";

interface MobileHomeProps {
  brainId: string | undefined;
  onOpenCapture: () => void;
  onOpenCaptureWith: (text: string) => void;
}

const HOLD_THRESHOLD_MS = 250;

export default function MobileHome({ brainId, onOpenCapture, onOpenCaptureWith }: MobileHomeProps) {
  const { brains, activeBrain } = useBrain();
  const [mode, setMode] = useState<"add" | "ask">("add");
  const [pressed, setPressed] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askInput, setAskInput] = useState("");
  const [showDebug, setShowDebug] = useState(true);

  const pendingOpenRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const recordingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const handleTranscript = useCallback(
    (text: string) => {
      if (!pendingOpenRef.current) return;
      pendingOpenRef.current = false;
      if (text.trim()) onOpenCaptureWith(text);
      else onOpenCapture();
    },
    [onOpenCapture, onOpenCaptureWith],
  );

  const { listening, startVoice, stopRecording } = useVoiceRecorder({
    onTranscript: handleTranscript,
    onStatus: setStatus,
    onError: setError,
    onLoading: () => {},
  });

  const { messages, loading: chatLoading, send: sendChat } = useChat(brainId);

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

  function clearHoldTimer() {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (mode === "ask") return;
    setError(null);
    setPressed(true);
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      recordingRef.current = true;
      pendingOpenRef.current = true;
      void startVoice();
    }, HOLD_THRESHOLD_MS);
  }

  function onPointerUp() {
    setPressed(false);
    if (mode === "ask") return;
    if (holdTimerRef.current) {
      clearHoldTimer();
      onOpenCapture();
      return;
    }
    if (recordingRef.current) {
      recordingRef.current = false;
      stopRecording();
    }
  }

  function onPointerCancel() {
    setPressed(false);
    if (holdTimerRef.current) {
      clearHoldTimer();
      return;
    }
    if (recordingRef.current) {
      recordingRef.current = false;
      pendingOpenRef.current = false;
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
  const animating = listening || chatLoading;
  const orbSize = isAsk ? 84 : 168;
  const logoSize = Math.round(orbSize * 0.78);

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
      `}</style>

      {showDebug && (
        <button
          type="button"
          onClick={() => setShowDebug(false)}
          aria-label="Dismiss debug"
          style={{
            position: "fixed",
            top: "calc(env(safe-area-inset-top, 0px) + 64px)",
            right: 8,
            zIndex: 9999,
            padding: "6px 10px",
            background: "rgba(0,0,0,0.78)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 11,
            lineHeight: 1.4,
            textAlign: "left",
            cursor: "pointer",
            maxWidth: 240,
            wordBreak: "break-all",
            whiteSpace: "pre-line",
          }}
        >
          {`brains=${brains.length}\nactive=${activeBrain?.id ? activeBrain.id.slice(0, 8) : "null"}\nprop=${brainId ? brainId.slice(0, 8) : "undef"}\nname=${activeBrain?.name ?? "—"}`}
        </button>
      )}

      <ModeToggle mode={mode} onChange={setMode} listening={listening} />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: isAsk ? "flex-start" : "center",
          gap: isAsk ? 16 : 28,
          paddingTop: isAsk ? 8 : 0,
          minHeight: 0,
        }}
      >
        {!isAsk && (
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
            }}
          >
            {error
              ? error
              : transcribing
                ? "transcribing…"
                : listening
                  ? "recording — release to send"
                  : "Tap to add, hold to record"}
          </div>
        )}

        <button
          type="button"
          aria-label={
            isAsk
              ? "Ask mode orb"
              : listening
                ? "Recording — release to stop"
                : "Tap to capture, hold to record"
          }
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onContextMenu={(e) => e.preventDefault()}
          data-listening={listening ? "true" : "false"}
          data-pressed={pressed ? "true" : "false"}
          data-mode={mode}
          disabled={isAsk}
          style={{
            position: "relative",
            width: orbSize,
            height: orbSize,
            padding: 0,
            background: "transparent",
            border: "none",
            cursor: isAsk ? "default" : "pointer",
            touchAction: "none",
            WebkitTapHighlightColor: "transparent",
            WebkitTouchCallout: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
            transition:
              "width 360ms cubic-bezier(0.22, 1, 0.36, 1), height 360ms cubic-bezier(0.22, 1, 0.36, 1), transform 140ms ease",
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
              animation: animating ? "hero-glow 1.6s ease-in-out infinite" : "none",
            }}
          />
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "1px solid color-mix(in oklch, var(--ember) 35%, transparent)",
              animation: animating ? "ring-pulse 1.4s ease-in-out infinite" : "none",
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
                    "width 360ms cubic-bezier(0.22, 1, 0.36, 1), height 360ms cubic-bezier(0.22, 1, 0.36, 1)",
                } as React.CSSProperties
              }
            />
          </span>
        </button>

        {isAsk && (
          <AskPanel
            messages={messages}
            loading={chatLoading}
            input={askInput}
            onInputChange={setAskInput}
            onSubmit={submitAsk}
            messagesEndRef={messagesEndRef}
            brainReady={!!brainId}
          />
        )}
      </div>
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
          display: "inline-flex",
          padding: 3,
          background: "var(--surface-low)",
          border: "1px solid var(--line-soft)",
          borderRadius: 999,
          gap: 2,
        }}
      >
        {(["add", "ask"] as const).map((m) => {
          const active = mode === m;
          const highlight = listening && m === "add";
          return (
            <button
              key={m}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(m)}
              className="press"
              style={{
                position: "relative",
                padding: "0 22px",
                height: 34,
                minHeight: 34,
                borderRadius: 999,
                fontFamily: "var(--f-sans)",
                fontSize: 13,
                fontWeight: 600,
                background: active ? "var(--ember)" : "transparent",
                color: active ? "var(--ember-ink)" : "var(--ink-soft)",
                border: "none",
                cursor: "pointer",
                textTransform: "capitalize",
                transition: "background 180ms, color 180ms, box-shadow 180ms",
                boxShadow: highlight
                  ? "0 0 0 2px color-mix(in oklch, var(--ember) 60%, transparent)"
                  : "none",
                animation: highlight ? "ring-pulse 1.4s ease-in-out infinite" : "none",
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
  messagesEndRef,
  brainReady,
}: {
  messages: Array<{ role: "user" | "assistant"; content: string; ts: string }>;
  loading: boolean;
  input: string;
  onInputChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  brainReady: boolean;
}) {
  const canSend = input.trim().length > 0 && !loading && brainReady;
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 560,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        flex: 1,
        minHeight: 0,
        animation: "mh-ask-in 340ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: "8px 4px",
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
