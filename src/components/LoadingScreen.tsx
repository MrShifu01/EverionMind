import type { JSX } from "react";

export default function LoadingScreen(): JSX.Element {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ background: "var(--color-background)", zIndex: 100 }}
    >
      <div className="synapse-bg" />
      <div className="grain" />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
        }}
      >
        {/* Orbital brain orb */}
        <div style={{ position: "relative", width: 72, height: 72 }}>
          <div
            style={{
              position: "absolute",
              inset: -8,
              background:
                "radial-gradient(circle, color-mix(in oklch, var(--color-primary) 22%, transparent), color-mix(in oklch, var(--color-tertiary) 18%, transparent), transparent 70%)",
              filter: "blur(14px)",
              borderRadius: "50%",
              animation: "hero-glow 3s ease-in-out infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "1px solid color-mix(in oklch, var(--color-primary) 25%, transparent)",
              animation: "ring-pulse 2.6s ease-in-out infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: -10,
              borderRadius: "50%",
              border: "1px dashed color-mix(in oklch, var(--color-tertiary) 20%, transparent)",
              animation: "orbital-spin 18s linear infinite",
            }}
          />
          <div
            className="glass-panel"
            style={{
              position: "relative",
              width: 72,
              height: 72,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid color-mix(in oklch, var(--color-primary) 20%, transparent)",
              color: "var(--color-primary)",
            }}
          >
            <svg
              width={72 * 0.42}
              height={72 * 0.42}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M8.5 3a3.5 3.5 0 0 0-3.5 3.5c-1.5.5-2.5 2-2.5 3.5 0 1 .5 2 1.5 2.5-.5.8-.5 2 0 3 .3.6.8 1 1.5 1.3-.2.9.1 2 .8 2.7.8.7 2 1 3 .5.3 1 1.3 2 2.7 2A2.5 2.5 0 0 0 14.5 20V4.5A1.5 1.5 0 0 0 13 3M15.5 3A3.5 3.5 0 0 1 19 6.5c1.5.5 2.5 2 2.5 3.5 0 1-.5 2-1.5 2.5.5.8.5 2 0 3-.3.6-.8 1-1.5 1.3.2.9-.1 2-.8 2.7-.8.7-2 1-3 .5-.3 1-1.3 2-2.7 2A2.5 2.5 0 0 1 9.5 20V4.5A1.5 1.5 0 0 1 11 3" />
            </svg>
          </div>
        </div>

        {/* Brand */}
        <h1
          className="font-headline gradient-text glow-text"
          style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.04em" }}
        >
          Everion Mind
        </h1>

        {/* Loading bar */}
        <div
          style={{
            height: 1,
            width: 112,
            overflow: "hidden",
            borderRadius: 999,
            background: "var(--color-outline-variant)",
          }}
        >
          <div
            style={{
              height: "100%",
              width: "50%",
              borderRadius: 999,
              background: "var(--color-primary)",
              animation: "loading-sweep 1.4s cubic-bezier(0.16, 1, 0.3, 1) infinite",
            }}
          />
        </div>
      </div>
    </div>
  );
}
