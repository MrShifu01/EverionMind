import { useEffect, useState, type JSX } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

// Splash mirrors MobileHome's bottom-anchored layout so the orb sits at
// the SAME screen Y as MobileHome's "Ask" orb. Once the splash fades, the
// orb element below it appears at the same position, reading visually as
// a single continuous orb that the home page reveals around. The wordmark
// fades out shortly before the rest of the home content fades in.
//
// Motion is driven by framer-motion springs (orb fall + bounce) and
// AnimatePresence (wordmark mount/unmount). Honours prefers-reduced-motion
// by collapsing the fall to an instant settle.
//
// `ready` defaults to true so Suspense-fallback usage (main.tsx, App.tsx)
// dismisses the moment the min-time window elapses — those locations
// already unmount the fallback when their chunk lands.
const MIN_DISPLAY_MS = 1200;
const FADE_MS = 400;
const ORB_SIZE = 168;
const LOGO_SIZE = Math.round(ORB_SIZE * 0.78); // matches MobileHome line 259

interface LoadingScreenProps {
  ready?: boolean;
}

export default function LoadingScreen({ ready = true }: LoadingScreenProps): JSX.Element | null {
  const reduceMotion = useReducedMotion();
  // Two independent timers — both flip via setTimeout callbacks (not
  // synchronous setState in an effect body) so the eslint
  // react-hooks/set-state-in-effect rule stays happy. `phase` is derived.
  const [minTimeReached, setMinTimeReached] = useState(false);
  const [fadeElapsed, setFadeElapsed] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setMinTimeReached(true), MIN_DISPLAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  const fadeStarted = minTimeReached && ready;

  useEffect(() => {
    if (!fadeStarted) return;
    const t = window.setTimeout(() => setFadeElapsed(true), FADE_MS);
    return () => window.clearTimeout(t);
  }, [fadeStarted]);

  const phase: "visible" | "fading" | "gone" = fadeElapsed
    ? "gone"
    : fadeStarted
      ? "fading"
      : "visible";

  if (phase === "gone") return null;

  // Spring config: low damping = visible overshoot + bounce. Mass 0.8 +
  // stiffness 120 give a satisfying ~900ms fall with two diminishing
  // bounces, similar to the hand-tuned cubic-bezier curves we replace.
  const orbSpring = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, mass: 0.9, stiffness: 120, damping: 9, restDelta: 0.5 };

  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 1 }}
      animate={{ opacity: phase === "fading" ? 0 : 1 }}
      transition={{ duration: FADE_MS / 1000, ease: "easeOut" }}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg, var(--color-background))",
        display: "flex",
        flexDirection: "column",
        // Mirrors MobileHome's layout: app header (56px) reserved at top,
        // then flex column that pads 16px around with safe-area-bottom.
        // The orb sits in the same screen-Y as MobileHome's orb because
        // both use the same flex column + flex:1 top-spacer pattern.
        padding:
          "calc(56px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px))",
        zIndex: "var(--z-loading)",
        pointerEvents: phase === "fading" ? "none" : "auto",
      }}
    >
      {/* Top spacer pushes orb cluster to the bottom — matches MobileHome
          line 312 (`flex: 1` spacer). */}
      <div style={{ flex: 1, minHeight: 0 }} />

      {/* Ask group — same width + centred + column-flex as MobileHome's
          ask group (line 318). Orb on top, wordmark where the prompt text
          would be in MobileHome. `marginBottom` reserves the vertical space
          that MobileHome's AskPanel (input form + chat) occupies, so the
          orb lands at the same screen-Y as MobileHome's orb on first paint. */}
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          margin: "0 auto",
          marginBottom: 120,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          minHeight: 0,
        }}
      >
        <motion.div
          // layoutId would let framer interpolate this orb to MobileHome's
          // orb across the LoadingScreen → MobileHome handoff. Disabled
          // for now because both elements need to be alive simultaneously
          // within a shared LayoutGroup, which the Suspense boundary
          // doesn't support without a boot-orchestrator refactor. Position
          // alignment + fade-out handles the visual continuity in the
          // meantime; flipping this on is a follow-up.
          // layoutId="brain-orb"
          initial={reduceMotion ? { y: 0, opacity: 1 } : { y: "-110vh", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{
            y: orbSpring,
            opacity: { duration: reduceMotion ? 0 : 0.15, ease: "easeOut" },
          }}
          style={{
            position: "relative",
            width: ORB_SIZE,
            height: ORB_SIZE,
            willChange: "transform, opacity",
          }}
        >
          <span
            style={{
              position: "absolute",
              inset: -16,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, color-mix(in oklch, var(--ember) 24%, transparent), color-mix(in oklch, var(--ember) 14%, transparent), transparent 70%)",
              filter: "blur(20px)",
              opacity: 0.55,
            }}
          />
          <span
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "1px solid color-mix(in oklch, var(--ember) 35%, transparent)",
            }}
          />
          <span
            style={{
              position: "absolute",
              inset: -14,
              borderRadius: "50%",
              border: "1px dashed color-mix(in oklch, var(--ember) 22%, transparent)",
              opacity: 0.4,
            }}
          />
          <span
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
              overflow: "hidden",
            }}
          >
            <img
              src="/logoNew.webp"
              width={LOGO_SIZE}
              height={LOGO_SIZE}
              alt=""
              aria-hidden="true"
              decoding="async"
              style={{ objectFit: "contain", display: "block" }}
            />
          </span>
        </motion.div>

        {/* "Everion Mind" wordmark — fades in once the orb has settled.
            AnimatePresence mode="wait" so on the eventual exit it fades
            out cleanly before the container itself begins its fade. */}
        <AnimatePresence mode="wait">
          {phase === "visible" && (
            <motion.div
              key="wordmark"
              className="f-serif"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{
                duration: reduceMotion ? 0 : 0.38,
                delay: reduceMotion ? 0 : 0.7,
                ease: [0.16, 1, 0.3, 1],
              }}
              style={{
                fontSize: 18,
                fontStyle: "italic",
                color: "var(--ink-soft)",
                letterSpacing: "-0.005em",
                textAlign: "center",
                minHeight: 26,
              }}
            >
              Everion Mind
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
