import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { authFetch } from "../../lib/authFetch";
import type { Entry } from "../../types";

interface Props {
  onClose: () => void;
  onCountChange?: (n: number) => void;
}

const TYPE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  "action-required": "Action required",
  subscription: "Subscription",
  appointment: "Appointment",
  deadline: "Deadline",
  delivery: "Delivery",
  "signing-request": "Signing",
};

const URGENCY_COLORS: Record<string, string> = {
  high: "var(--blood)",
  medium: "var(--ember)",
  low: "var(--ink-faint)",
};

const SWIPE_THRESHOLD = 85;

export default function GmailStagingInbox({ onClose, onCountChange }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [exiting, setExiting] = useState<"left" | "right" | null>(null);
  const [done, setDone] = useState(false);

  const startX = useRef(0);
  const dragging = useRef(false);

  useEffect(() => {
    authFetch("/api/entries?staged=true")
      .then((r) => r.json())
      .then((data) => {
        const loaded: Entry[] = (data.entries ?? []).filter(
          (e: Entry) => e.metadata?.source === "gmail",
        );
        setEntries(loaded);
        onCountChange?.(loaded.length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [onCountChange]);

  const current = entries[index];
  const next = entries[index + 1];

  function advance(idx: number) {
    setExiting(null);
    setDragX(0);
    setTransitioning(false);
    if (idx >= entries.length - 1) {
      setDone(true);
      onCountChange?.(0);
    } else {
      setIndex(idx + 1);
      onCountChange?.(entries.length - idx - 2);
    }
  }

  function triggerAccept(idx: number) {
    const entry = entries[idx];
    authFetch("/api/entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id, status: "active" }),
    }).catch(() => {});
    setTransitioning(true);
    setExiting("right");
    setDragX(700);
    setTimeout(() => advance(idx), 300);
  }

  function triggerReject(idx: number) {
    const entry = entries[idx];
    authFetch("/api/entries", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id }),
    }).catch(() => {});
    setTransitioning(true);
    setExiting("left");
    setDragX(-700);
    setTimeout(() => advance(idx), 300);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (exiting || done) return;
    startX.current = e.clientX;
    dragging.current = true;
    setTransitioning(false);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current || exiting) return;
    setDragX(e.clientX - startX.current);
  }

  function onPointerUp() {
    if (!dragging.current) return;
    dragging.current = false;
    const dx = dragX;
    setTransitioning(true);
    if (dx > SWIPE_THRESHOLD) triggerAccept(index);
    else if (dx < -SWIPE_THRESHOLD) triggerReject(index);
    else setDragX(0);
  }

  const keepOpacity = Math.min(Math.max(dragX / 100, 0), 1);
  const skipOpacity = Math.min(Math.max(-dragX / 100, 0), 1);
  const backScale = 0.94 + Math.min(Math.abs(dragX) / 800, 0.06);
  const backY = 10 - Math.min(Math.abs(dragX) / 50, 10);
  const cardTransition = transitioning
    ? exiting ? "transform 300ms ease-in" : "transform 350ms cubic-bezier(0.16, 1, 0.3, 1)"
    : "none";

  const meta = (current?.metadata ?? {}) as Record<string, any>;
  const urgency = meta.urgency ?? "low";
  const typeLabel = TYPE_LABELS[current?.type ?? ""] ?? current?.type ?? "Gmail";
  const isParsed = meta.enrichment?.parsed === true;
  const hasInsight = !!(meta.ai_insight) || meta.enrichment?.has_insight === true;
  const isEmbedded = !!(current?.embedded_at);
  const enrichedCount = [isParsed, hasInsight, isEmbedded].filter(Boolean).length;

  const overlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "oklch(14% 0.012 55 / 0.82)",
  };

  if (loading) {
    return createPortal(
      <div style={overlay}>
        <div style={{ color: "var(--ink-faint)", fontSize: 14, fontFamily: "var(--f-sans)" }}>
          Loading…
        </div>
      </div>,
      document.body,
    );
  }

  if (done || entries.length === 0) {
    return createPortal(
      <div style={overlay}>
        <div
          style={{
            background: "var(--bg)",
            borderRadius: 16,
            padding: "40px 32px 36px",
            maxWidth: 360,
            width: "calc(100% - 48px)",
            textAlign: "center",
            border: "1px solid var(--line-soft)",
          }}
        >
          <div
            style={{
              width: 44, height: 44, borderRadius: "50%",
              background: "var(--ember-wash)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 10.5l4.5 4.5 7.5-9" stroke="var(--ember)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h3 className="f-serif" style={{ fontSize: 20, fontWeight: 450, color: "var(--ink)", margin: "0 0 10px" }}>
            {entries.length === 0 ? "Inbox is clear" : "All reviewed"}
          </h3>
          <p className="f-serif" style={{ fontSize: 14, color: "var(--ink-faint)", fontStyle: "italic", lineHeight: 1.6, margin: "0 0 28px" }}>
            {entries.length === 0
              ? "No staged Gmail entries are waiting."
              : "Accepted entries are now in your brain."}
          </p>
          <button
            onClick={onClose}
            className="press f-sans"
            style={{
              width: "100%", height: 44, borderRadius: 10, border: "none",
              background: "var(--ember)", color: "var(--ember-ink)",
              fontSize: 15, fontWeight: 600, cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      {/* Back card */}
      {next && (
        <div
          style={{
            position: "absolute",
            width: "calc(100% - 48px)",
            maxWidth: 360,
            background: "var(--bg)",
            borderRadius: 16,
            border: "1px solid var(--line-soft)",
            transform: `scale(${backScale}) translateY(${backY}px)`,
            transition: transitioning ? "transform 300ms ease" : "none",
            padding: "24px 20px 20px",
            boxSizing: "border-box",
            pointerEvents: "none",
          }}
        >
          <div style={{ height: 80 }} />
        </div>
      )}

      {/* Action labels */}
      <div style={{ position: "absolute", top: "calc(50% - 80px)", left: "50%", transform: "translateX(-50%)", width: "calc(100% - 48px)", maxWidth: 360, display: "flex", justifyContent: "space-between", pointerEvents: "none", zIndex: 10000 }}>
        <div style={{ opacity: skipOpacity, background: "var(--blood)", color: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 700, fontFamily: "var(--f-sans)", border: "2px solid var(--blood)" }}>
          REJECT
        </div>
        <div style={{ opacity: keepOpacity, background: "var(--moss)", color: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 700, fontFamily: "var(--f-sans)", border: "2px solid var(--moss)" }}>
          ACCEPT
        </div>
      </div>

      {/* Main card */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: "relative",
          width: "calc(100% - 48px)",
          maxWidth: 360,
          background: "var(--bg)",
          borderRadius: 16,
          border: "1px solid var(--line-soft)",
          padding: "24px 20px 20px",
          boxSizing: "border-box",
          cursor: "grab",
          userSelect: "none",
          transform: `translateX(${dragX}px) rotate(${dragX * 0.04}deg)`,
          transition: cardTransition,
          boxShadow: "0 8px 32px oklch(0% 0 0 / 0.18)",
          zIndex: 10001,
        }}
      >
        {/* Counter + enrichment status */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: "var(--ink-faint)", fontFamily: "var(--f-sans)" }}>
            {index + 1} / {entries.length}
          </span>
          <span style={{ fontSize: 11, color: "var(--ink-faint)", fontFamily: "var(--f-sans)" }}>
            {enrichedCount}/3 enriched
          </span>
        </div>

        {/* Type + urgency */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "var(--f-sans)", color: "var(--bg)", background: "var(--ember)", borderRadius: 5, padding: "2px 8px" }}>
            {typeLabel}
          </span>
          {urgency !== "low" && (
            <span style={{ fontSize: 11, fontFamily: "var(--f-sans)", color: URGENCY_COLORS[urgency] ?? "var(--ink-faint)", fontWeight: 600 }}>
              {urgency.toUpperCase()}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="f-serif" style={{ fontSize: 17, fontWeight: 500, color: "var(--ink)", margin: "0 0 8px", lineHeight: 1.35 }}>
          {current.title}
        </h3>

        {/* Content */}
        {current.content && (
          <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: "0 0 14px", lineHeight: 1.55, fontFamily: "var(--f-sans)" }}>
            {current.content.slice(0, 180)}
          </p>
        )}

        {/* Key fields */}
        {(meta.amount || meta.due_date) && (
          <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
            {meta.amount && (
              <div>
                <div style={{ fontSize: 10, color: "var(--ink-faint)", fontFamily: "var(--f-sans)", marginBottom: 2 }}>AMOUNT</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--f-sans)" }}>{meta.amount}</div>
              </div>
            )}
            {meta.due_date && (
              <div>
                <div style={{ fontSize: 10, color: "var(--ink-faint)", fontFamily: "var(--f-sans)", marginBottom: 2 }}>DUE</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: urgency === "high" ? "var(--blood)" : "var(--ink)", fontFamily: "var(--f-sans)" }}>
                  {new Date(meta.due_date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sender */}
        {meta.gmail_from && (
          <div style={{ fontSize: 11, color: "var(--ink-faint)", fontFamily: "var(--f-sans)", marginBottom: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {meta.gmail_from}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => triggerReject(index)}
            className="press f-sans"
            style={{ flex: 1, height: 40, borderRadius: 10, border: "1.5px solid var(--line-soft)", background: "transparent", color: "var(--ink-faint)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Reject
          </button>
          <button
            onClick={() => triggerAccept(index)}
            className="press f-sans"
            style={{ flex: 1, height: 40, borderRadius: 10, border: "none", background: "var(--ember)", color: "var(--ember-ink)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Accept
          </button>
        </div>

        {/* Swipe hint */}
        <p style={{ textAlign: "center", fontSize: 11, color: "var(--ink-ghost)", fontFamily: "var(--f-sans)", margin: "12px 0 0" }}>
          swipe right to accept · swipe left to reject
        </p>
      </div>
    </div>,
    document.body,
  );
}
