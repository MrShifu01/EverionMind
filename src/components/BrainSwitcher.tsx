import { useState } from "react";
import { useBrain } from "../context/BrainContext";
import { authFetch } from "../lib/authFetch";
import CreateBrainModal from "./CreateBrainModal";
import type { Brain } from "../types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface Props {
  /** Optional — when true the dropdown opens upward (used in mobile menus). */
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

export default function BrainSwitcher({ dropUp, compact, cardMode, onPick, hideCreate }: Props) {
  const { activeBrain, brains, setActiveBrain, refresh } = useBrain();
  const [creating, setCreating] = useState(false);

  if (!activeBrain) return null;

  const personal = brains.find((b) => b.is_personal);
  const others = brains.filter((b) => !b.is_personal).sort((a, b) => a.name.localeCompare(b.name));
  const sorted = personal ? [personal, ...others] : others;

  async function pick(brain: Brain) {
    if (brain.id === activeBrain?.id) return;
    if (onPick) {
      onPick(brain);
      return;
    }
    setActiveBrain(brain);
    authFetch("/api/brains?action=set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: brain.id }),
    }).catch(() => {});
  }

  const truncate = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  return (
    <div style={{ position: "relative", flexShrink: 0, width: cardMode ? "100%" : undefined }}>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Active brain: ${activeBrain.name}. Click to switch.`}
          className="press"
          style={
            cardMode
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
                }
          }
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
              <svg
                aria-hidden="true"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
                style={{ flexShrink: 0, color: "var(--ink-soft)", opacity: 0.7 }}
              >
                {dropUp ? <path d="m6 15 6-6 6 6" /> : <path d="m6 9 6 6 6-6" />}
              </svg>
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
              <svg
                aria-hidden="true"
                width="10"
                height="10"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
                style={{ flexShrink: 0, opacity: 0.6 }}
              >
                {dropUp ? <path d="m6 15 6-6 6 6" /> : <path d="m6 9 6 6 6-6" />}
              </svg>
            </>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side={dropUp ? "top" : "bottom"}
          align="start"
          className="max-w-[320px] min-w-[240px] gap-0.5 rounded-xl p-1.5"
        >
          {sorted.map((b) => {
            const isActive = b.id === activeBrain.id;
            return (
              <DropdownMenuItem
                key={b.id}
                onSelect={() => pick(b)}
                className="gap-2 rounded-lg px-2.5 py-2"
                style={{
                  background: isActive ? "var(--ember-wash)" : undefined,
                  color: "var(--ink)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    {b.name}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--ink-faint)", marginTop: 2 }}>
                    {b.is_personal ? "Personal" : "Shared"}
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
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </DropdownMenuItem>
            );
          })}

          {!hideCreate && (
            <>
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuItem
                onSelect={() => setCreating(true)}
                className="gap-2 rounded-lg px-2.5 py-2"
                style={{ color: "var(--ember)", fontWeight: 500, fontSize: 13 }}
              >
                <span style={{ width: 14, textAlign: "center" }}>+</span>
                <span>New brain</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

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
