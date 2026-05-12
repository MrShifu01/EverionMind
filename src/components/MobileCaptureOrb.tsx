import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import { useVoiceMode } from "../hooks/useVoiceMode";

interface Props {
  /** Required tap target — opens the capture flow. */
  onOpenCapture: () => void;
  /** Voice transcript → capture with prefilled text (preview mode). */
  onOpenCaptureWith?: (text: string) => void;
  /** Voice transcript → background save (auto mode). */
  onCaptureRaw?: (text: string) => void;
  /** Pixel diameter. Default 64 — sized to match the old BottomNav FAB. */
  size?: number;
  /** Skip useVoiceRecorder wiring. Used by App.tsx loading screen where
   *  the voice infrastructure isn't bootstrapped yet. Tap still works. */
  visualOnly?: boolean;
  /** Override the glyph rendered inside the well. Default "+". */
  glyph?: string;
  /** Override aria-label. Default "Capture". */
  ariaLabel?: string;
}

const HOLD_THRESHOLD_MS = 250;
const ACCENT = "var(--ember)";

/**
 * Mini inkwell orb. Same visual language as MobileHome's central inkwell
 * but sized down to ~64px, positioned fixed at the screen-bottom center.
 * Replaces the old BottomNav center FAB on every non-home view, and is
 * reused as the loading-screen capture button.
 */
export default function MobileCaptureOrb({
  onOpenCapture,
  onOpenCaptureWith,
  onCaptureRaw,
  size = 64,
  visualOnly = false,
  glyph = "+",
  ariaLabel = "Capture",
}: Props) {
  const [pressed, setPressed] = useState(false);
  const [voiceMode] = useVoiceMode();
  const holdTimerRef = useRef<number | null>(null);
  const recordingRef = useRef(false);
  const voiceModeRef = useRef(voiceMode);
  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  const handleTranscript = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) {
        onOpenCapture();
        return;
      }
      if (voiceModeRef.current === "auto") onCaptureRaw?.(t);
      else onOpenCaptureWith?.(t);
    },
    [onOpenCapture, onOpenCaptureWith, onCaptureRaw],
  );

  const { listening, startVoice, stopRecording } = useVoiceRecorder({
    onTranscript: handleTranscript,
    onStatus: () => {},
    onError: () => {},
    onLoading: () => {},
  });

  function clearHoldTimer() {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setPressed(true);
    if (visualOnly) return;
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      recordingRef.current = true;
      void startVoice();
    }, HOLD_THRESHOLD_MS);
  }

  function onPointerUp() {
    if (holdTimerRef.current) {
      clearHoldTimer();
      setPressed(false);
      // Tap path — small delay so the press-scale animation is visible
      window.setTimeout(() => onOpenCapture(), 150);
      return;
    }
    if (recordingRef.current) {
      recordingRef.current = false;
      setPressed(false);
      stopRecording();
      return;
    }
    setPressed(false);
    if (visualOnly) onOpenCapture();
  }

  function onPointerCancel() {
    setPressed(false);
    clearHoldTimer();
    if (recordingRef.current) {
      recordingRef.current = false;
      stopRecording();
    }
  }

  // Proportions matched to the home inkwell (220px → rim 0, ring 18,
  // button 38 → 0 / 8.18% / 17.27%; glyph fontSize 36 in 220 → 16.4%).
  // Keeps the small orb visually identical, just scaled down.
  const ringInset = Math.round(size * 0.0818);
  const buttonInset = Math.round(size * 0.1727);
  const fontSize = Math.round(size * 0.34);

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: "calc(10px + var(--edge-bottom-pad, 0px))",
        transform: "translateX(-50%)",
        zIndex: "var(--z-nav, 30)",
        width: size,
        height: size,
        pointerEvents: "auto",
      }}
    >
      <div style={{ position: "relative", width: size, height: size }}>
        {/* Outer rim */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: `radial-gradient(circle at 50% 30%,
              color-mix(in oklch, ${ACCENT} 28%, var(--surface)) 0%,
              var(--surface) 48%,
              var(--surface-low) 100%)`,
            border: `1px solid color-mix(in oklch, ${ACCENT} 42%, transparent)`,
            boxShadow: "var(--lift-2)",
          }}
        />
        {/* Inner ring */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: ringInset,
            borderRadius: "50%",
            border: `1px solid color-mix(in oklch, ${ACCENT} 55%, transparent)`,
            background: "var(--surface-dim)",
            boxShadow: "inset 0 1px 4px oklch(4% 0.01 250 / 0.8)",
          }}
        />
        {/* Push button */}
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onContextMenu={(e) => e.preventDefault()}
          aria-label={ariaLabel}
          style={{
            position: "absolute",
            inset: buttonInset,
            borderRadius: "50%",
            background: `radial-gradient(circle at 50% 30%,
              color-mix(in oklch, ${ACCENT} 55%, var(--ember-deep)) 0%,
              color-mix(in oklch, ${ACCENT} 30%, var(--ember-deep)) 50%,
              var(--ember-deep) 100%)`,
            border: `1px solid color-mix(in oklch, ${ACCENT} 70%, transparent)`,
            cursor: "pointer",
            padding: 0,
            transform: pressed ? "scale(0.94)" : "scale(1)",
            transition: "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            boxShadow: `
              inset 0 1px 0 color-mix(in oklch, ${ACCENT} 85%, white),
              0 0 12px color-mix(in oklch, ${ACCENT} 28%, transparent),
              var(--lift-1)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            touchAction: "none",
            WebkitTapHighlightColor: "transparent",
            WebkitTouchCallout: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
            animation: listening ? "inkwell-breathe 1.4s ease-in-out infinite" : "none",
          }}
        >
          <span
            className="f-serif"
            style={{
              fontSize,
              color: "var(--ember-ink)",
              fontWeight: 300,
              lineHeight: 1,
              textShadow: "0 1px 1px color-mix(in oklch, var(--ember-deep) 60%, transparent)",
            }}
          >
            {glyph}
          </span>
        </button>
      </div>
    </div>
  );
}
