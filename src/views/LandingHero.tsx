import { useMemo, useState } from "react";

interface LandingHeroProps {
  onAuth: (mode: "login" | "signup") => void;
}

// Someday-style hero: full-bleed atmospheric backdrop, oversized serif italic
// wordmark, single ghost CTA, nothing else above the fold. The brand wordmark
// (Everion + ember dot, var(--f-serif)) is preserved exactly — only the
// scale and the surrounding negative space change.
//
// Photo source: by default loads /landing-hero.webp. The admin preview hatch
// passes ?hero=1|2|3 in the URL to compare alternates — drop those at
// /public/landing-hero-1.webp, /landing-hero-2.webp, /landing-hero-3.webp.
// Falls back to the layered gradient if the file is missing.
function pickPhotoSrc(): string {
  if (typeof window === "undefined") return "/landing-hero.webp";
  const v = new URLSearchParams(window.location.search).get("hero");
  if (v === "1" || v === "2" || v === "3") return `/landing-hero-${v}.webp`;
  return "/landing-hero.webp";
}

export default function LandingHero({ onAuth }: LandingHeroProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const photoSrc = useMemo(() => pickPhotoSrc(), []);

  return (
    <section
      style={{
        position: "relative",
        minHeight: "100dvh",
        width: "100%",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        color: "white",
        // Layered atmospheric gradient — works as standalone if no photo is
        // present, and as a vignette if a photo is layered on top.
        background: `
          radial-gradient(ellipse at 50% 85%, rgba(58, 95, 78, 0.45) 0%, transparent 55%),
          radial-gradient(ellipse at 50% 15%, rgba(120, 130, 140, 0.22) 0%, transparent 60%),
          linear-gradient(180deg, #1a2530 0%, #0f1a18 60%, #0a1410 100%)
        `,
      }}
    >
      {!photoFailed && (
        <img
          src={photoSrc}
          alt=""
          aria-hidden="true"
          decoding="async"
          loading="eager"
          onError={() => setPhotoFailed(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.85,
            zIndex: 0,
          }}
        />
      )}

      {/* Top + bottom vignette so the wordmark sits cleanly regardless of photo
          luminance. Cheap insurance against future hero swaps. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(15,20,18,0.45) 0%, transparent 25%, transparent 65%, rgba(10,15,12,0.7) 100%)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* Center stack */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
          padding: "0 24px",
          textAlign: "center",
        }}
      >
        <h1
          className="f-serif"
          style={{
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: "clamp(72px, 18vw, 220px)",
            lineHeight: 0.95,
            letterSpacing: "-0.04em",
            margin: 0,
            color: "white",
            textShadow: "0 1px 60px rgba(0,0,0,0.45)",
            display: "inline-flex",
            alignItems: "baseline",
            gap: "0.04em",
          }}
        >
          Everion
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: "0.16em",
              height: "0.16em",
              background: "var(--ember)",
              borderRadius: "50%",
              alignSelf: "flex-end",
              marginBottom: "0.18em",
              boxShadow: "0 0 24px rgba(217, 119, 6, 0.35)",
            }}
          />
        </h1>

        <p
          className="f-serif"
          style={{
            fontSize: "clamp(14px, 1.6vw, 18px)",
            fontStyle: "italic",
            fontWeight: 300,
            color: "rgba(255,255,255,0.78)",
            margin: 0,
            maxWidth: 460,
            lineHeight: 1.5,
            textShadow: "0 1px 12px rgba(0,0,0,0.4)",
          }}
        >
          your second brain — for everything that matters.
        </p>

        <button
          type="button"
          onClick={() => onAuth("signup")}
          className="press"
          style={{
            marginTop: 12,
            minHeight: 44,
            padding: "12px 26px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.22)",
            color: "white",
            fontFamily: "var(--f-sans)",
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: "0.01em",
            cursor: "pointer",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            transition: "background 200ms ease, transform 200ms ease",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.14)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.06)";
          }}
        >
          Start free
          <span aria-hidden="true" style={{ fontSize: 13, opacity: 0.85 }}>
            ↗
          </span>
        </button>
      </div>

      {/* Bottom-center copyright + scroll hint, mirroring Someday's restraint */}
      <div
        style={{
          position: "absolute",
          bottom: 26,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          zIndex: 2,
          pointerEvents: "none",
        }}
      >
        <button
          type="button"
          onClick={() => {
            document.getElementById("what")?.scrollIntoView({ behavior: "smooth" });
          }}
          aria-label="Scroll to learn more"
          style={{
            background: "transparent",
            border: 0,
            color: "rgba(255,255,255,0.5)",
            fontFamily: "var(--f-sans)",
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            cursor: "pointer",
            minWidth: 44,
            minHeight: 44,
            padding: 6,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            pointerEvents: "auto",
          }}
        >
          <span>scroll</span>
          <span style={{ fontSize: 13 }}>↓</span>
        </button>
        <div
          style={{
            fontFamily: "var(--f-sans)",
            fontSize: 11,
            color: "rgba(255,255,255,0.4)",
            letterSpacing: "0.04em",
          }}
        >
          © 2026 Everion
        </div>
      </div>
    </section>
  );
}
