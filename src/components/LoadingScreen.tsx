import { useEffect, useState, type JSX } from "react";

// Splash shows for at least MIN_DISPLAY_MS, then waits for `ready` to flip
// true before fading out over FADE_MS. The orb in MobileHome sits at the
// same screen Y so the dissolve looks like a single continuous orb that
// just loses its loading surround.
//
// `ready` defaults to true so Suspense-fallback usage (main.tsx, App.tsx)
// dismisses the moment the min-time window elapses — those locations
// already unmount the fallback when their chunk lands.
const MIN_DISPLAY_MS = 800;
const FADE_MS = 400;

interface LoadingScreenProps {
  ready?: boolean;
}

export default function LoadingScreen({ ready = true }: LoadingScreenProps): JSX.Element | null {
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

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg, var(--color-background))",
        display: "flex",
        flexDirection: "column",
        // Matches MobileHeader-with-brain-switcher height so the orb lands
        // at the same screen Y as MobileHome's orb. See MobileHeader.tsx:53.
        paddingTop: "calc(116px + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(48px + env(safe-area-inset-bottom, 0px))",
        zIndex: "var(--z-loading)",
        opacity: phase === "fading" ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
        pointerEvents: phase === "fading" ? "none" : "auto",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          padding: "0 24px",
        }}
      >
        <div
          className="f-serif"
          style={{
            fontSize: 16,
            fontStyle: "italic",
            color: "var(--ink-soft)",
            letterSpacing: "-0.005em",
            textAlign: "center",
            minHeight: 24,
          }}
        >
          Everion Mind
        </div>

        <div
          style={{
            position: "relative",
            width: 168,
            height: 168,
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
              width={131}
              height={131}
              alt=""
              aria-hidden="true"
              decoding="async"
              style={{ objectFit: "contain", display: "block" }}
            />
          </span>
        </div>

        <div
          style={{
            minHeight: 34,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              height: 1,
              width: 112,
              overflow: "hidden",
              borderRadius: 999,
              background: "var(--color-outline-variant, var(--line-soft))",
            }}
          >
            <div
              style={{
                height: "100%",
                width: "50%",
                borderRadius: 999,
                background: "var(--ember)",
                animation: "loading-sweep 1.4s cubic-bezier(0.16, 1, 0.3, 1) infinite",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
