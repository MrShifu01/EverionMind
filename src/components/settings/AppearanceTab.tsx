import {
  useDesignTheme,
  VARIANT_LABEL,
  VARIANT_BLURB,
  type DesignVariant,
  type DesignMode,
} from "../../design/DesignThemeContext";

const VARIANT_SWATCHES: Record<
  DesignVariant,
  { bg: string; surface: string; ember: string; ink: string }
> = {
  dusk: {
    bg: "oklch(21% 0.012 62)",
    surface: "oklch(30% 0.016 64)",
    ember: "oklch(72% 0.135 52)",
    ink: "oklch(94% 0.010 78)",
  },
  paper: {
    bg: "oklch(96% 0.022 85)",
    surface: "oklch(93% 0.025 82)",
    ember: "oklch(37% 0.088 120)",
    ink: "oklch(20% 0.028 32)",
  },
  bronze: {
    bg: "oklch(21% 0.008 250)",
    surface: "oklch(31% 0.012 246)",
    ember: "oklch(76% 0.105 82)",
    ink: "oklch(94% 0.012 84)",
  },
};

const VARIANTS: DesignVariant[] = ["dusk", "paper", "bronze"];
const MODES: DesignMode[] = ["light", "dark"];

export default function AppearanceTab() {
  const { variant, mode, setVariant, setMode } = useDesignTheme();

  return (
    <div>
      <div className="micro" style={{ marginBottom: 10 }}>
        Design
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
          marginBottom: 28,
        }}
      >
        {VARIANTS.map((v) => {
          const active = variant === v;
          const sw = VARIANT_SWATCHES[v];
          return (
            <button
              key={v}
              onClick={() => setVariant(v)}
              aria-pressed={active}
              className="press"
              style={{
                textAlign: "left",
                padding: 14,
                borderRadius: 10,
                background: active ? "var(--surface-high)" : "var(--surface-low)",
                border: `1px solid ${active ? "var(--ember)" : "var(--line-soft)"}`,
                cursor: "pointer",
                transition: "background 180ms, border-color 180ms",
              }}
            >
              <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                {[sw.bg, sw.surface, sw.ember, sw.ink].map((c, i) => (
                  <span
                    key={i}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: c,
                      border: "1px solid var(--line-soft)",
                    }}
                  />
                ))}
              </div>
              <div
                className="f-serif"
                style={{
                  fontSize: 16,
                  fontWeight: 450,
                  letterSpacing: "-0.005em",
                  color: active ? "var(--ember)" : "var(--ink)",
                }}
              >
                {VARIANT_LABEL[v]}
              </div>
              <div
                className="f-serif"
                style={{
                  fontSize: 12,
                  fontStyle: "italic",
                  color: "var(--ink-faint)",
                  marginTop: 4,
                  lineHeight: 1.45,
                }}
              >
                {VARIANT_BLURB[v]}
              </div>
            </button>
          );
        })}
      </div>

      <div className="micro" style={{ marginBottom: 10 }}>
        Mode
      </div>
      <div
        style={{
          display: "inline-flex",
          padding: 3,
          background: "var(--surface-low)",
          border: "1px solid var(--line-soft)",
          borderRadius: 8,
          gap: 2,
        }}
      >
        {MODES.map((m) => {
          const active = mode === m;
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={active}
              className="press"
              style={{
                padding: "0 18px",
                height: 30,
                minHeight: 30,
                borderRadius: 6,
                fontFamily: "var(--f-sans)",
                fontSize: 13,
                fontWeight: 500,
                background: active ? "var(--surface-high)" : "transparent",
                color: active ? "var(--ink)" : "var(--ink-faint)",
                border: active ? "1px solid var(--line-soft)" : "1px solid transparent",
                cursor: "pointer",
                textTransform: "capitalize",
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
