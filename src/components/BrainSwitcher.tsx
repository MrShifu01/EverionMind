import { useState } from "react";
import { useBrain } from "../context/BrainContext";
import { authFetch } from "../lib/authFetch";
import { startViewTransition } from "../lib/viewTransitions";
import CreateBrainModal from "./CreateBrainModal";
import type { Brain } from "../types";
import { Dialog, DialogContent } from "./ui/dialog";

interface Props {
  /** Optional — when true the sheet opens upward (kept for API compat;
   *  the dialog is centered now so this has no visual effect, but call
   *  sites that pass it still compile). */
  dropUp?: boolean;
  /** Compact pill rendering for tight spots like CaptureSheet header. */
  compact?: boolean;
  /** Full-width "active brain" card with avatar + label + chevron. Used
   *  below the mobile header. */
  cardMode?: boolean;
  /** Override what happens after picking a brain (e.g. CaptureSheet wants
   *  per-capture redirect, not global switch). When omitted, switches the
   *  app-wide active brain. */
  onPick?: (brain: Brain) => void;
  /** Hide "+ New brain" footer (e.g. in CaptureSheet). */
  hideCreate?: boolean;
}

// ─── BrainSwitcher (Dialog + shared-element morph) ───────────────────
//
// Was a Radix DropdownMenu (small popover next to trigger). Converted to
// a Dialog so it can be a real sheet — matches the Inkwell design intent
// where tapping the brain pill expands into a brain-selection surface,
// not a tiny menu that hugs the trigger.
//
// Shared-element morph: the pill (trigger) carries
// `view-transition-name: brain-pill` while closed; the active row inside
// the sheet carries the same name while open. setOpen is wrapped in
// startViewTransition, so the browser identifies the named element
// across snapshots (closed pill ↔ open active-row) and morphs between
// their positions. Pill is hidden via visibility:hidden while open so
// only one element carries the name in any rest state.
//
// Compact / cardMode / dropUp props preserved for API back-compat;
// they affect the trigger's visual variant only — every variant opens
// the same Dialog.

export default function BrainSwitcher({ compact, cardMode, onPick, hideCreate }: Props) {
  const { activeBrain, brains, setActiveBrain, refresh } = useBrain();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  if (!activeBrain) return null;

  const personal = brains.find((b) => b.is_personal);
  const others = brains.filter((b) => !b.is_personal).sort((a, b) => a.name.localeCompare(b.name));
  const sorted = personal ? [personal, ...others] : others;

  function handleOpenChange(next: boolean) {
    startViewTransition(() => setOpen(next));
  }

  async function pick(brain: Brain) {
    if (brain.id === activeBrain?.id) {
      handleOpenChange(false);
      return;
    }
    if (onPick) {
      onPick(brain);
      handleOpenChange(false);
      return;
    }
    setActiveBrain(brain);
    handleOpenChange(false);
    authFetch("/api/brains?action=set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: brain.id }),
    }).catch(() => {});
  }

  const truncate = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  // Pill carries the morph anchor while the sheet is CLOSED. When the
  // sheet opens, the active-brain row inside the sheet carries it
  // instead — browser identifies "brain-pill" across BEFORE/AFTER
  // snapshots and morphs between the two positions.
  const pillStyle: React.CSSProperties = cardMode
    ? {
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        background: "var(--surface)",
        color: "var(--ink)",
        border: "1px solid var(--line-soft)",
        borderRadius: 14,
        fontFamily: "var(--f-sans)",
        cursor: "pointer",
        textAlign: "left",
        viewTransitionName: open ? undefined : "brain-pill",
        visibility: open ? ("hidden" as const) : ("visible" as const),
      }
    : {
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: compact ? 28 : 32,
        padding: compact ? "0 8px" : "0 10px",
        background: "var(--surface)",
        border: "1px solid var(--line-soft)",
        borderRadius: 8,
        color: "var(--ink)",
        fontFamily: "var(--f-sans)",
        fontSize: compact ? 12 : 13,
        fontWeight: 500,
        cursor: "pointer",
        maxWidth: compact ? 160 : 220,
        minWidth: 0,
        viewTransitionName: open ? undefined : "brain-pill",
        visibility: open ? ("hidden" as const) : ("visible" as const),
      };

  return (
    <div style={{ position: "relative", flexShrink: 0, width: cardMode ? "100%" : undefined }}>
      <button
        type="button"
        aria-label={`Active brain: ${activeBrain.name}. Click to switch.`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="press"
        onClick={() => handleOpenChange(true)}
        style={pillStyle}
      >
        {cardMode ? (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="micro"
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--ink-faint)",
                  lineHeight: 1,
                }}
              >
                Active brain
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  marginTop: 4,
                  color: "var(--ink)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {activeBrain.name}
              </div>
            </div>
            <Chevron />
          </>
        ) : (
          <>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {truncate(activeBrain.name, compact ? 16 : 22)}
            </span>
            <Chevron small />
          </>
        )}
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="max-w-[420px]"
          style={{
            padding: 0,
            background: "var(--surface-high)",
            border: "1px solid var(--line-soft)",
            borderRadius: 18,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "18px 20px 8px",
              borderBottom: "1px solid var(--line-soft)",
              background: "color-mix(in oklch, var(--surface-low) 40%, var(--surface-high))",
            }}
          >
            <div
              className="f-mono"
              style={{
                fontSize: 9.5,
                letterSpacing: "0.22em",
                color: "var(--ink-faint)",
                textTransform: "uppercase",
              }}
            >
              switch brain
            </div>
            <div
              className="f-serif"
              style={{
                fontSize: 22,
                color: "var(--ink)",
                letterSpacing: "-0.02em",
                marginTop: 4,
                marginBottom: 10,
              }}
            >
              Pick a <span style={{ fontStyle: "italic", color: "var(--ember)" }}>brain</span>
            </div>
          </div>

          <div
            style={{
              maxHeight: "60dvh",
              overflowY: "auto",
              padding: 8,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {sorted.map((b) => {
              const isActive = b.id === activeBrain.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => pick(b)}
                  className="press"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    background: isActive
                      ? "color-mix(in oklch, var(--ember) 8%, var(--surface))"
                      : "transparent",
                    border: `1px solid ${
                      isActive
                        ? "color-mix(in oklch, var(--ember) 32%, var(--line-soft))"
                        : "transparent"
                    }`,
                    borderRadius: 12,
                    cursor: "pointer",
                    color: "var(--ink)",
                    textAlign: "left",
                    width: "100%",
                    // Active row picks up the brain-pill morph anchor
                    // when the sheet is open; pill carries it when closed.
                    viewTransitionName: isActive && open ? "brain-pill" : undefined,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: isActive
                        ? "color-mix(in oklch, var(--ember) 22%, var(--surface-low))"
                        : "var(--surface-low)",
                      border: `1px solid ${
                        isActive
                          ? "color-mix(in oklch, var(--ember) 55%, transparent)"
                          : "var(--line-soft)"
                      }`,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: isActive ? "var(--ember)" : "var(--ink-faint)",
                      fontSize: 11,
                      flexShrink: 0,
                    }}
                  >
                    ●
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="f-sans"
                      style={{
                        fontSize: 14,
                        fontWeight: isActive ? 600 : 500,
                        color: "var(--ink)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {b.name}
                    </div>
                    <div
                      className="f-mono"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.18em",
                        color: isActive ? "var(--ember)" : "var(--ink-faint)",
                        textTransform: "uppercase",
                        marginTop: 3,
                      }}
                    >
                      {b.is_personal ? "personal" : "shared"}
                    </div>
                  </div>
                  {isActive && (
                    <svg
                      aria-hidden="true"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--ember)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ flexShrink: 0 }}
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          {!hideCreate && (
            <div
              style={{
                padding: "10px 12px 14px",
                borderTop: "1px solid var(--line-soft)",
                background: "color-mix(in oklch, var(--surface-low) 30%, var(--surface-high))",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  handleOpenChange(false);
                  setCreating(true);
                }}
                className="press"
                style={{
                  width: "100%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "10px 14px",
                  background: "transparent",
                  border: "1px dashed var(--line)",
                  borderRadius: 10,
                  color: "var(--ember)",
                  cursor: "pointer",
                  fontFamily: "var(--f-mono)",
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
                new brain
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {creating && (
        <CreateBrainModal
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function Chevron({ small }: { small?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width={small ? 10 : 14}
      height={small ? 10 : 14}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      style={{ flexShrink: 0, color: "var(--ink-soft)", opacity: 0.7 }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
