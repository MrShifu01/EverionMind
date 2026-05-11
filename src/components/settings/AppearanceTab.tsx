import { useDesignTheme, type DesignMode } from "../../design/DesignThemeContext";

const MODES: DesignMode[] = ["light", "dark"];

export default function AppearanceTab() {
  const { mode, setMode } = useDesignTheme();

  return (
    <div>
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
