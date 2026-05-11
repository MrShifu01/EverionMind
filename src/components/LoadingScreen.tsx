import { useEffect, useState, type JSX } from "react";

const STUCK_AFTER_MS = 15000;

async function nukeAndReload() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    /* fall through */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_sw", Date.now().toString(36));
  window.location.replace(url.toString());
}

export default function LoadingScreen(): JSX.Element {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStuck(true), STUCK_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg, var(--color-background))",
        display: "flex",
        flexDirection: "column",
        paddingTop: "calc(56px + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(48px + env(safe-area-inset-bottom, 0px))",
        zIndex: "var(--z-loading)",
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
          aria-hidden="true"
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

        {stuck && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              marginTop: 4,
            }}
          >
            <p
              className="f-sans"
              style={{
                fontSize: 13,
                color: "var(--ink-soft, #888)",
                margin: 0,
                textAlign: "center",
                maxWidth: 260,
                lineHeight: 1.4,
              }}
            >
              Taking longer than usual.
            </p>
            <button
              type="button"
              onClick={nukeAndReload}
              className="press-scale f-sans"
              style={{
                height: 36,
                padding: "0 20px",
                borderRadius: 999,
                background: "var(--ember)",
                color: "var(--ember-ink)",
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              Force refresh
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
