import { useState } from "react";
import type { PendingVoiceAction } from "../hooks/usePendingVoiceActions";

interface Props {
  pending: PendingVoiceAction[];
  onAccept: (id: string) => Promise<{ ok: boolean; error?: string }>;
  onReject: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

// Tier-2 voice safety surface. The model never executes destructive ops
// (delete/update/merge/persona.update_fact/persona.retire_fact) directly
// — they all land here as a pending row. User taps Accept to commit or
// Reject to discard. 10-min server-side TTL, banner hides silently on
// expiry (next poll returns the empty list).
export function PendingVoiceActionsBanner({ pending, onAccept, onReject }: Props) {
  const [busy, setBusy] = useState<Record<string, "accept" | "reject" | undefined>>({});
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  if (!pending.length) return null;

  async function handle(id: string, kind: "accept" | "reject") {
    setBusy((b) => ({ ...b, [id]: kind }));
    setErrors((e) => ({ ...e, [id]: undefined }));
    const r = kind === "accept" ? await onAccept(id) : await onReject(id);
    if (!r.ok) {
      setErrors((e) => ({ ...e, [id]: r.error ?? "failed" }));
    }
    setBusy((b) => ({ ...b, [id]: undefined }));
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 560,
        margin: "0 auto",
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: "var(--surface-high)",
        border: "1px solid var(--ember-soft, var(--ember))",
        borderRadius: 12,
        boxShadow: "var(--lift-1)",
      }}
    >
      <div
        className="f-sans"
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ember)",
        }}
      >
        Pending · {pending.length}
      </div>
      {pending.map((p) => {
        const state = busy[p.id];
        const err = errors[p.id];
        return (
          <div
            key={p.id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "6px 0",
              borderTop: "1px solid var(--line-soft)",
            }}
          >
            <div className="f-serif" style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.4 }}>
              {p.summary}
            </div>
            <div className="f-sans" style={{ fontSize: 10, color: "var(--ink-faint)" }}>
              {p.tool_name.replace(/_/g, " ")}
            </div>
            {err && (
              <div className="f-sans" style={{ fontSize: 11, color: "var(--blood)" }}>
                {err}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
              <button
                type="button"
                className="press f-sans"
                onClick={() => void handle(p.id, "accept")}
                disabled={!!state}
                style={{
                  flex: 1,
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--moss)",
                  background: state === "accept" ? "var(--moss)" : "transparent",
                  color: state === "accept" ? "var(--bg)" : "var(--moss)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  height: 28,
                }}
              >
                {state === "accept" ? "Accepting…" : "Accept"}
              </button>
              <button
                type="button"
                className="press f-sans"
                onClick={() => void handle(p.id, "reject")}
                disabled={!!state}
                style={{
                  flex: 1,
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--blood)",
                  background: state === "reject" ? "var(--blood)" : "transparent",
                  color: state === "reject" ? "var(--bg)" : "var(--blood)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  height: 28,
                }}
              >
                {state === "reject" ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
