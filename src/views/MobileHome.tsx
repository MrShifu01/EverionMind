import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";

interface MobileHomeProps {
  onOpenCapture: () => void;
  onOpenCaptureWith: (text: string) => void;
  onNavigate: (view: string) => void;
}

const HOLD_THRESHOLD_MS = 250;

export default function MobileHome({
  onOpenCapture,
  onOpenCaptureWith,
  onNavigate,
}: MobileHomeProps) {
  const [mode, setMode] = useState<"add" | "ask">("add");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendingOpenRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const recordingRef = useRef(false);

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

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    };
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
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      recordingRef.current = true;
      pendingOpenRef.current = true;
      void startVoice();
    }, HOLD_THRESHOLD_MS);
  }

  function onPointerUp() {
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

  function handleModeChange(next: "add" | "ask") {
    setMode(next);
    if (next === "ask") onNavigate("chat");
  }

  const transcribing = status === "transcribing";

  return (
    <div
      style={{
        minHeight: "calc(100dvh - var(--app-header-h, 56px))",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        padding: "0 24px calc(48px + env(safe-area-inset-bottom, 0px))",
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

      <button
        type="button"
        aria-label={listening ? "Recording — release to stop" : "Tap to capture, hold to record"}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        data-listening={listening ? "true" : "false"}
        style={{
          position: "relative",
          width: 168,
          height: 168,
          padding: 0,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          touchAction: "none",
          WebkitTapHighlightColor: "transparent",
          userSelect: "none",
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
            opacity: listening ? 1 : 0.55,
            transition: "opacity 240ms ease",
            animation: listening ? "hero-glow 1.6s ease-in-out infinite" : "none",
          }}
        />
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "1px solid color-mix(in oklch, var(--ember) 35%, transparent)",
            animation: listening ? "ring-pulse 1.4s ease-in-out infinite" : "none",
          }}
        />
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: -14,
            borderRadius: "50%",
            border: "1px dashed color-mix(in oklch, var(--ember) 22%, transparent)",
            animation: listening ? "orbital-spin 8s linear infinite" : "none",
            opacity: listening ? 1 : 0.4,
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
            boxShadow: "var(--lift-2)",
            transform: listening ? "scale(0.97)" : "scale(1)",
            transition: "transform 180ms ease",
          }}
        >
          <svg
            width="44"
            height="44"
            fill="none"
            stroke="var(--ember)"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
          </svg>
        </span>
      </button>

      <div
        role="tablist"
        aria-label="Capture mode"
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
          return (
            <button
              key={m}
              role="tab"
              aria-selected={active}
              onClick={() => handleModeChange(m)}
              className="press"
              style={{
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
                transition: "background 180ms, color 180ms",
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
