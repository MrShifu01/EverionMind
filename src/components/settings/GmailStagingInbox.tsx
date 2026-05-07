import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { authFetch } from "../../lib/authFetch";
import type { Entry } from "../../types";
import { Button } from "../ui/button";

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
  // Track the live drag delta in a ref alongside React state. onPointerUp
  // can't trust the state value — the last setDragX from pointermove may
  // not have flushed before the user lifts their finger, so a fast swipe
  // would read 0 from state and never trip the threshold.
  const dragXRef = useRef(0);

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
    // Optimistic UI: animate the card off-screen and advance immediately.
    // The PATCH runs in the background; we dispatch staged-changed *after*
    // it resolves so useStagedCount's refetch sees the new server state.
    // Dispatching before the PATCH lands caused the badge to stay at the
    // pre-accept count because /api/entries?staged=true still returned the
    // entry that was technically still status='staged' on the DB.
    void authFetch("/api/entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id, status: "active" }),
    })
      .then(() => {
        window.dispatchEvent(new CustomEvent("everion:staged-changed"));
      })
      .catch((err) => {
        console.error("[gmail-inbox] accept failed:", err);
        // Tell the shell anyway so it refetches and shows the truth — the
        // entry stays staged, the badge stays accurate.
        window.dispatchEvent(new CustomEvent("everion:staged-changed"));
      });
    recordDecision(entry, "accept", null);
    setTransitioning(true);
    setExiting("right");
    setDragX(700);
    setTimeout(() => advance(idx), 300);
  }

  function triggerReject(idx: number, reason?: string | null) {
    const entry = entries[idx];
    void authFetch("/api/entries", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id }),
    })
      .then(() => {
        window.dispatchEvent(new CustomEvent("everion:staged-changed"));
      })
      .catch((err) => {
        console.error("[gmail-inbox] reject failed:", err);
        window.dispatchEvent(new CustomEvent("everion:staged-changed"));
      });
    recordDecision(entry, "reject", reason ?? null);
    setTransitioning(true);
    setExiting("left");
    setDragX(-700);
    setTimeout(() => advance(idx), 300);
  }

  // Persist the user's accept/reject choice as a learning signal. Pulls the
  // sender / subject / snippet out of the entry's metadata so the next scan's
  // distillation pass has enough context to find patterns. Fire-and-forget;
  // the staging UI doesn't block on the network round-trip.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- entry metadata is dynamic per row; cluster/gmail_* fields read via untyped access.
  function recordDecision(entry: any, decision: "accept" | "reject", reason: string | null) {
    const meta = entry?.metadata ?? {};
    const fromHeader = String(meta.gmail_from || meta.from || "");
    const fromEmailMatch = fromHeader.match(/<([^>]+)>/);
    const from_email = fromEmailMatch ? fromEmailMatch[1] : fromHeader;
    const from_name = fromEmailMatch
      ? fromHeader
          .replace(/<[^>]+>/, "")
          .trim()
          .replace(/^"|"$/g, "")
      : "";

    // Cluster mode: record one signal that captures the cluster shape so
    // the distiller learns at the right level of generality. The reason
    // line includes the cluster size + sender domain + a few member
    // subjects so the LLM can spot the pattern without being given 50
    // separate rejection rows for the same kind of email.
    const cluster = meta.cluster as
      | { size: number; sender_domain?: string; members?: Array<{ subject: string }> }
      | undefined;
    let augmentedSubject = meta.gmail_subject || entry?.title || "";
    let augmentedSnippet = (entry?.content || "").slice(0, 400);
    if (cluster?.size && cluster.size > 1) {
      const memberSubjects =
        cluster.members
          ?.slice(0, 5)
          .map((m) => m.subject)
          .filter(Boolean)
          .join(" | ") ?? "";
      augmentedSubject = `[cluster ×${cluster.size}] ${augmentedSubject}`;
      augmentedSnippet = `Cluster of ${cluster.size} similar emails from ${
        cluster.sender_domain || "(unknown)"
      }. Sample subjects: ${memberSubjects}`;
    }

    authFetch("/api/entries?action=gmail-decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        subject: augmentedSubject,
        from_email,
        from_name,
        snippet: augmentedSnippet,
        reason,
        source_id: entry?.id,
        // Each staging row already represents N deduped emails. The pattern
        // scorer treats one tap as N decisions so a 49-cluster reject jumps
        // straight to hard-block instead of crawling +1 per swipe.
        cluster_size: cluster?.size && cluster.size > 1 ? cluster.size : 1,
      }),
    }).catch(() => {});
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (exiting || done) return;
    startX.current = e.clientX;
    dragging.current = true;
    dragXRef.current = 0;
    setTransitioning(false);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current || exiting) return;
    const dx = e.clientX - startX.current;
    dragXRef.current = dx;
    setDragX(dx);
  }

  function onPointerUp() {
    if (!dragging.current) return;
    dragging.current = false;
    // Read from the ref, not state — the last setDragX from pointermove may
    // not have flushed yet, so the closure-captured `dragX` could still be
    // the previous frame's value (often 0 on a quick swipe).
    const dx = dragXRef.current;
    setTransitioning(true);
    if (dx > SWIPE_THRESHOLD) triggerAccept(index);
    else if (dx < -SWIPE_THRESHOLD) triggerReject(index);
    else {
      dragXRef.current = 0;
      setDragX(0);
    }
  }

  const cardTransition = transitioning
    ? exiting
      ? "transform 300ms ease-in"
      : "transform 350ms cubic-bezier(0.16, 1, 0.3, 1)"
    : "none";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- gmail metadata is heterogeneous (cluster shape, enrichment flags, ai_insight, gmail_subject). Accessors below tolerate missing fields.
  const meta = (current?.metadata ?? {}) as Record<string, any>;
  const urgency = meta.urgency ?? "low";
  const typeLabel = TYPE_LABELS[current?.type ?? ""] ?? current?.type ?? "Gmail";
  const cluster = meta.cluster;
  const clusterSize = cluster?.size ?? 0;
  const isParsed = meta.enrichment?.parsed === true;
  const hasInsight = !!meta.ai_insight || meta.enrichment?.has_insight === true;
  const isEmbedded = !!current?.embedded_at;
  const enrichedCount = [isParsed, hasInsight, isEmbedded].filter(Boolean).length;

  const overlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: "var(--z-native-overlay)",
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
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "var(--ember-wash)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M4 10.5l4.5 4.5 7.5-9"
                stroke="var(--ember)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h3
            className="f-serif"
            style={{ fontSize: 20, fontWeight: 450, color: "var(--ink)", margin: "0 0 10px" }}
          >
            {entries.length === 0 ? "Inbox is clear" : "All reviewed"}
          </h3>
          <p
            className="f-serif"
            style={{
              fontSize: 14,
              color: "var(--ink-faint)",
              fontStyle: "italic",
              lineHeight: 1.6,
              margin: "0 0 28px",
            }}
          >
            {entries.length === 0
              ? "No staged Gmail entries are waiting."
              : "Accepted entries are now in your brain."}
          </p>
          <Button onClick={onClose} size="lg" className="w-full">
            Done
          </Button>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      {/* Main card — stack-of-cards visual removed; floating REJECT/ACCEPT
          pills removed too. Direction is conveyed by the card's own tilt +
          translate, plus the helper hint at the bottom of the panel. */}
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
          // Without this, mobile browsers steal the horizontal motion for
          // native scroll / iOS back-swipe and the pointer-move handlers
          // never fire — buttons work because they're discrete clicks, but
          // the Tinder swipe never gets a chance to track.
          touchAction: "none",
          WebkitUserSelect: "none",
          transform: `translateX(${dragX}px) rotate(${dragX * 0.04}deg)`,
          transition: cardTransition,
          boxShadow: "0 8px 32px oklch(0% 0 0 / 0.18)",
          zIndex: "calc(var(--z-native-overlay) + 2)",
        }}
      >
        {/* Counter + enrichment status */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--ink-faint)", fontFamily: "var(--f-sans)" }}>
            {index + 1} / {entries.length}
          </span>
          <span style={{ fontSize: 11, color: "var(--ink-faint)", fontFamily: "var(--f-sans)" }}>
            {enrichedCount}/3 enriched
          </span>
        </div>

        {/* Type + urgency + cluster badge */}
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "var(--f-sans)",
              color: "var(--bg)",
              background: "var(--ember)",
              borderRadius: 5,
              padding: "2px 8px",
            }}
          >
            {typeLabel}
          </span>
          {clusterSize > 1 && (
            <span
              title={
                cluster?.sender_domain
                  ? `${clusterSize} similar emails from ${cluster.sender_domain}`
                  : `${clusterSize} similar emails`
              }
              style={{
                fontSize: 11,
                fontWeight: 700,
                fontFamily: "var(--f-sans)",
                color: "var(--ember)",
                background: "var(--ember-wash)",
                border: "1px solid color-mix(in oklch, var(--ember) 30%, transparent)",
                borderRadius: 999,
                padding: "2px 10px",
              }}
            >
              {clusterSize} similar
            </span>
          )}
          {urgency !== "low" && (
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--f-sans)",
                color: URGENCY_COLORS[urgency] ?? "var(--ink-faint)",
                fontWeight: 600,
              }}
            >
              {urgency.toUpperCase()}
            </span>
          )}
          {/* Probation badge — pattern at score 8+ but still inside the
              7-day probation window. Once auto_accept_eligible_at passes,
              future matching emails skip staging entirely. */}
          {meta.auto_accept_pending === true && (
            <span
              title={
                meta.auto_accept_eligible_at
                  ? `auto-accepting from ${new Date(meta.auto_accept_eligible_at as string).toLocaleDateString()}`
                  : "auto-accepting soon"
              }
              style={{
                fontSize: 11,
                fontWeight: 700,
                fontFamily: "var(--f-sans)",
                color: "var(--moss)",
                background: "color-mix(in oklch, var(--moss) 14%, transparent)",
                border: "1px solid color-mix(in oklch, var(--moss) 30%, transparent)",
                borderRadius: 999,
                padding: "2px 10px",
              }}
            >
              auto-accept{" "}
              {meta.auto_accept_eligible_at
                ? new Date(meta.auto_accept_eligible_at as string).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                  })
                : "soon"}
            </span>
          )}
        </div>

        {/* Title */}
        <h3
          className="f-serif"
          style={{
            fontSize: 17,
            fontWeight: 500,
            color: "var(--ink)",
            margin: "0 0 8px",
            lineHeight: 1.35,
          }}
        >
          {current.title}
        </h3>

        {/* Content */}
        {current.content && (
          <p
            style={{
              fontSize: 13,
              color: "var(--ink-muted)",
              margin: "0 0 14px",
              lineHeight: 1.55,
              fontFamily: "var(--f-sans)",
            }}
          >
            {current.content.slice(0, 180)}
          </p>
        )}

        {/* Key fields */}
        {(meta.amount || meta.due_date) && (
          <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
            {meta.amount && (
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--ink-faint)",
                    fontFamily: "var(--f-sans)",
                    marginBottom: 2,
                  }}
                >
                  AMOUNT
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--ink)",
                    fontFamily: "var(--f-sans)",
                  }}
                >
                  {meta.amount}
                </div>
              </div>
            )}
            {meta.due_date && (
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--ink-faint)",
                    fontFamily: "var(--f-sans)",
                    marginBottom: 2,
                  }}
                >
                  DUE
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: urgency === "high" ? "var(--blood)" : "var(--ink)",
                    fontFamily: "var(--f-sans)",
                  }}
                >
                  {new Date(meta.due_date).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sender */}
        {meta.gmail_from && (
          <div
            style={{
              fontSize: 11,
              color: "var(--ink-faint)",
              fontFamily: "var(--f-sans)",
              marginBottom: 16,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {meta.gmail_from}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <Button
            onClick={() => triggerReject(index)}
            variant="outline"
            className="flex-1"
            style={{ color: "var(--ink-faint)" }}
          >
            Reject
          </Button>
          <Button onClick={() => triggerAccept(index)} className="flex-1">
            Accept
          </Button>
        </div>

        {/* Swipe hint */}
        <p
          style={{
            textAlign: "center",
            fontSize: 11,
            color: "var(--ink-ghost)",
            fontFamily: "var(--f-sans)",
            margin: "12px 0 0",
          }}
        >
          swipe right to accept · swipe left to reject
        </p>
      </div>
    </div>,
    document.body,
  );
}
