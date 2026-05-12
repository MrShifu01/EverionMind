import { useState } from "react";
import { useBrain } from "../context/BrainContext";
import { authFetch } from "../lib/authFetch";
import type { Brain } from "../types";

const ACCENT = "var(--ember)";

interface Props {
  onCreateBrain?: () => void;
}

/**
 * Compact "BRAIN My Brain v" pill used in the global mobile header.
 * Extracted from MobileHome's original inline BrainPill so the same
 * visual + dropdown logic is shared across home and every other view.
 */
export default function InkwellBrainPill({ onCreateBrain }: Props) {
  const { activeBrain, brains, setActiveBrain } = useBrain();
  const [open, setOpen] = useState(false);
  if (!activeBrain) return null;

  const personal = brains.find((b) => b.is_personal);
  const others = brains.filter((b) => !b.is_personal).sort((a, b) => a.name.localeCompare(b.name));
  const sorted = personal ? [personal, ...others] : others;

  async function pick(brain: Brain) {
    if (brain.id === activeBrain?.id) {
      setOpen(false);
      return;
    }
    setActiveBrain(brain);
    setOpen(false);
    authFetch("/api/brains?action=set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: brain.id }),
    }).catch(() => {});
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="press"
        aria-label={`Active brain: ${activeBrain.name}. Tap to switch.`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          height: 30,
          padding: "0 12px 0 8px",
          background: "var(--surface)",
          border: "1px solid var(--line-soft)",
          borderRadius: 999,
          color: "var(--ink)",
          fontFamily: "var(--f-sans)",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: `color-mix(in oklch, ${ACCENT} 22%, var(--surface-low))`,
            border: `1px solid color-mix(in oklch, ${ACCENT} 60%, transparent)`,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: ACCENT,
            fontSize: 10,
            lineHeight: 1,
          }}
        >
          ●
        </span>
        <span
          className="f-mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.16em",
            color: "var(--ink-faint)",
            textTransform: "uppercase",
          }}
        >
          brain
        </span>
        <span
          style={{
            maxWidth: 140,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {activeBrain.name}
        </span>
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          style={{ opacity: 0.55 }}
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
            aria-hidden
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: "50%",
              transform: "translateX(-50%)",
              minWidth: 220,
              background: "var(--surface-high)",
              border: "1px solid var(--line-soft)",
              borderRadius: 14,
              padding: 6,
              boxShadow: "var(--lift-3)",
              zIndex: 41,
              animation: "fade-up 180ms ease both",
            }}
          >
            {sorted.map((b) => {
              const isActive = b.id === activeBrain.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => void pick(b)}
                  className="press"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "8px 8px",
                    background: isActive ? "var(--ember-wash)" : "transparent",
                    border: "none",
                    borderRadius: 8,
                    color: "var(--ink)",
                    cursor: "pointer",
                    fontFamily: "var(--f-sans)",
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: `color-mix(in oklch, ${ACCENT} 22%, var(--surface-low))`,
                      border: `1px solid color-mix(in oklch, ${ACCENT} 60%, transparent)`,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: ACCENT,
                      fontSize: 11,
                      flexShrink: 0,
                    }}
                  >
                    {b.is_personal ? "●" : "▲"}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>{b.name}</span>
                  {isActive && (
                    <span
                      className="f-mono"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.16em",
                        color: ACCENT,
                        textTransform: "uppercase",
                      }}
                    >
                      active
                    </span>
                  )}
                </button>
              );
            })}
            {onCreateBrain && (
              <>
                <div style={{ height: 1, background: "var(--line-soft)", margin: "4px 6px" }} />
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onCreateBrain();
                  }}
                  className="press"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "8px 8px",
                    background: "transparent",
                    border: "none",
                    borderRadius: 8,
                    color: "var(--ink-soft)",
                    cursor: "pointer",
                    fontFamily: "var(--f-sans)",
                    fontSize: 13,
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      border: "1px dashed var(--line)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--ink-faint)",
                      fontSize: 14,
                      lineHeight: 1,
                    }}
                  >
                    +
                  </span>
                  <span>New brain</span>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
