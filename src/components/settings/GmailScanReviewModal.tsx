import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { authFetch } from "../../lib/authFetch";

export interface ScanResultItem {
  entryId: string;
  groupIds: string[];
  groupCount: number;
  threadMessageCount?: number;
  title: string;
  summary: string;
  from: string;
  subject: string;
  emailType: string;
  urgency: string;
  amount?: string | null;
  dueDate?: string | null;
  relevanceScore?: number;
}

interface Props {
  items: ScanResultItem[];
  onClose: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  invoices: "Invoice",
  "action-required": "Action required",
  "subscription-renewal": "Subscription",
  appointment: "Appointment",
  deadline: "Deadline",
  delivery: "Delivery",
  "signing-requests": "Signing",
};

const URGENCY_COLORS: Record<string, string> = {
  high: "var(--blood)",
  medium: "var(--ember)",
  low: "var(--ink-faint)",
};

const SWIPE_THRESHOLD = 85;

export default function GmailScanReviewModal({ items, onClose }: Props) {
  const capped = items.slice(0, 10);
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [exiting, setExiting] = useState<"left" | "right" | null>(null);
  const [done, setDone] = useState(false);
  const [rulesAdded, setRulesAdded] = useState(0);

  const startX = useRef(0);
  const dragging = useRef(false);
  const rulesRef = useRef(0);

  const current = capped[index];
  const next = capped[index + 1];

  function advance(capturedIdx: number) {
    setExiting(null);
    setDragX(0);
    setTransitioning(false);
    if (capturedIdx >= capped.length - 1) {
      setDone(true);
      setRulesAdded(rulesRef.current);
    } else {
      setIndex(capturedIdx + 1);
    }
  }

  function triggerAccept(capturedIdx: number) {
    setTransitioning(true);
    setExiting("right");
    setDragX(700);
    setTimeout(() => advance(capturedIdx), 300);
  }

  function triggerReject(capturedIdx: number) {
    const item = capped[capturedIdx];
    authFetch("/api/gmail?action=delete-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryIds: item.groupIds, from: item.from }),
    }).catch(() => {});
    authFetch("/api/gmail?action=ignore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: item.subject,
        from: item.from,
        email_type: item.emailType,
        content_preview: item.summary,
      }),
    })
      .then(() => {
        rulesRef.current++;
      })
      .catch(() => {});
    setTransitioning(true);
    setExiting("left");
    setDragX(-700);
    setTimeout(() => advance(capturedIdx), 300);
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
    if (dx > SWIPE_THRESHOLD) {
      triggerAccept(index);
    } else if (dx < -SWIPE_THRESHOLD) {
      triggerReject(index);
    } else {
      setDragX(0);
    }
  }

  const keepOpacity = Math.min(Math.max(dragX / 100, 0), 1);
  const skipOpacity = Math.min(Math.max(-dragX / 100, 0), 1);
  const backScale = 0.94 + Math.min(Math.abs(dragX) / 800, 0.06);
  const backY = 10 - Math.min(Math.abs(dragX) / 50, 10);

  const cardTransition = transitioning
    ? exiting
      ? "transform 300ms ease-in"
      : "transform 350ms cubic-bezier(0.16, 1, 0.3, 1)"
    : "none";

  if (done) {
    return createPortal(
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "oklch(14% 0.012 55 / 0.82)",
        }}
      >
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
            All reviewed
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
            {rulesAdded > 0
              ? `${rulesAdded} exclusion rule${rulesAdded !== 1 ? "s" : ""} added — future scans will be smarter.`
              : "No changes made — your preferences are unchanged."}
          </p>
          <button
            onClick={onClose}
            className="press f-sans"
            style={{
              width: "100%",
              height: 44,
              borderRadius: 10,
              border: "none",
              background: "var(--ember)",
              color: "var(--ember-ink)",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
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
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        background: "oklch(14% 0.012 55 / 0.92)",
        overflow: "hidden",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          padding: "20px 20px 12px",
        }}
      >
        <div>
          <h3
            className="f-serif"
            style={{ margin: 0, fontSize: 17, fontWeight: 450, color: "oklch(94% 0.01 55)" }}
          >
            Review Gmail Captures
          </h3>
          <p
            className="f-sans"
            style={{
              margin: "3px 0 0",
              fontSize: 11,
              color: "oklch(94% 0.01 55 / 0.4)",
              letterSpacing: "0.02em",
            }}
          >
            {index + 1} of {capped.length}
          </p>
        </div>
        <button
          onClick={onClose}
          className="f-sans"
          style={{
            width: 32,
            height: 32,
            minWidth: 32,
            minHeight: 32,
            borderRadius: "50%",
            border: "1px solid oklch(94% 0.01 55 / 0.18)",
            background: "transparent",
            color: "oklch(94% 0.01 55 / 0.55)",
            fontSize: 13,
            padding: 0,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
            aspectRatio: "1",
          }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 2,
          background: "oklch(94% 0.01 55 / 0.1)",
          flexShrink: 0,
          margin: "0 20px",
        }}
      >
        <div
          style={{
            height: "100%",
            background: "var(--ember)",
            width: `${(index / capped.length) * 100}%`,
            transition: "width 300ms ease-out",
          }}
        />
      </div>

      {/* Card stack */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", margin: "16px 16px 0" }}>
        {/* Back card */}
        {next && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 16,
              background: "var(--surface)",
              border: "1px solid var(--line-soft)",
              transform: `scale(${backScale}) translateY(${backY}px)`,
              transition: transitioning ? "transform 300ms ease-out" : "none",
              transformOrigin: "bottom center",
              overflow: "hidden",
              padding: "24px 20px",
              boxSizing: "border-box",
            }}
          >
            <CardContent item={next} dragX={0} />
          </div>
        )}

        {/* Front card */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 16,
            background: "var(--bg)",
            border: "1px solid var(--line-soft)",
            transform: `translateX(${dragX}px) rotate(${dragX * 0.03}deg)`,
            transition: cardTransition,
            transformOrigin: "bottom center",
            overflow: "hidden",
            padding: "24px 20px",
            boxSizing: "border-box",
            cursor: exiting ? "default" : "grab",
            userSelect: "none",
            touchAction: "none",
          }}
        >
          {/* Keep indicator */}
          <div
            style={{
              position: "absolute",
              top: 20,
              left: 20,
              opacity: keepOpacity,
              color: "var(--moss)",
              fontFamily: "var(--f-sans)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              pointerEvents: "none",
              zIndex: 2,
            }}
          >
            Keep
          </div>

          {/* Discard indicator */}
          <div
            style={{
              position: "absolute",
              top: 20,
              right: 20,
              opacity: skipOpacity,
              color: "var(--blood)",
              fontFamily: "var(--f-sans)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              pointerEvents: "none",
              zIndex: 2,
            }}
          >
            Discard
          </div>

          <CardContent item={current} dragX={dragX} />
        </div>
      </div>

      {/* Action buttons */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "16px 16px 36px",
        }}
      >
        <button
          onClick={() => triggerReject(index)}
          disabled={!!exiting}
          className="press f-sans"
          style={{
            flex: 1,
            height: 48,
            borderRadius: 10,
            border: "1px solid oklch(94% 0.01 55 / 0.18)",
            background: "transparent",
            color: "oklch(94% 0.01 55 / 0.65)",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
            letterSpacing: "0.01em",
          }}
          aria-label="Discard"
        >
          ← Discard
        </button>
        <button
          onClick={() => triggerAccept(index)}
          disabled={!!exiting}
          className="press f-sans"
          style={{
            flex: 1,
            height: 48,
            borderRadius: 10,
            border: "none",
            background: "var(--ember)",
            color: "var(--ember-ink)",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            letterSpacing: "0.01em",
          }}
          aria-label="Keep"
        >
          Keep →
        </button>
      </div>
    </div>,
    document.body,
  );
}

function CardContent({ item, dragX }: { item: ScanResultItem; dragX: number }) {
  const senderName = item.from.replace(/<.*>/, "").trim() || item.from;
  const urgencyColor = URGENCY_COLORS[item.urgency] ?? "var(--ink-faint)";

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Badges */}
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
        }}
      >
        <span
          className="f-sans"
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "4px 10px",
            borderRadius: 999,
            background: "var(--ember-wash)",
            color: "var(--ember)",
          }}
        >
          {TYPE_LABELS[item.emailType] ?? item.emailType}
        </span>
        {item.groupCount > 1 && (
          <span
            className="f-sans"
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "4px 10px",
              borderRadius: 999,
              background: "var(--surface-high)",
              color: "var(--ink-soft)",
              border: "1px solid var(--line-soft)",
            }}
          >
            ×{item.groupCount} from same sender
          </span>
        )}
        {item.threadMessageCount && item.threadMessageCount > 1 && (
          <span
            className="f-sans"
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "4px 10px",
              borderRadius: 999,
              background: "var(--surface-high)",
              color: "var(--ink-soft)",
              border: "1px solid var(--line-soft)",
            }}
          >
            {item.threadMessageCount}-msg thread
          </span>
        )}
        {item.urgency === "high" && (
          <span
            className="f-sans"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "4px 10px",
              borderRadius: 999,
              background: "var(--blood-wash)",
              color: "var(--blood)",
            }}
          >
            Urgent
          </span>
        )}
      </div>

      <h2
        className="f-serif"
        style={{
          fontSize: 20,
          fontWeight: 500,
          color: "var(--ink)",
          margin: "0 0 6px",
          lineHeight: 1.25,
          letterSpacing: "-0.01em",
        }}
      >
        {item.title}
      </h2>

      <p
        className="f-serif"
        style={{
          fontSize: 13,
          color: "var(--ink-faint)",
          fontStyle: "italic",
          margin: "0 0 14px",
          lineHeight: 1.4,
        }}
      >
        {senderName}
      </p>

      {item.summary && (
        <p
          className="f-sans"
          style={{
            fontSize: 13,
            color: "var(--ink-soft)",
            lineHeight: 1.6,
            margin: "0 0 14px",
          }}
        >
          {item.summary}
        </p>
      )}

      {(item.amount || item.dueDate) && (
        <div className="flex flex-wrap gap-2" style={{ marginBottom: 14 }}>
          {item.amount && (
            <span
              className="f-sans"
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: "5px 12px",
                borderRadius: 999,
                background: "var(--surface-high)",
                color: "var(--ink)",
                border: "1px solid var(--line-soft)",
              }}
            >
              {item.amount}
            </span>
          )}
          {item.dueDate && (
            <span
              className="f-sans"
              style={{
                fontSize: 13,
                fontWeight: 500,
                padding: "5px 12px",
                borderRadius: 999,
                background: "var(--surface-high)",
                color: urgencyColor,
                border: `1px solid ${urgencyColor}`,
              }}
            >
              Due{" "}
              {new Date(item.dueDate).toLocaleDateString("en-ZA", {
                day: "numeric",
                month: "short",
              })}
            </span>
          )}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Drag dots */}
      <div
        style={{
          borderTop: "1px solid var(--line-soft)",
          paddingTop: 12,
          display: "flex",
          justifyContent: "center",
          gap: 6,
          opacity: Math.max(0, 1 - Math.abs(dragX) / 40),
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: "var(--ink-ghost)",
              display: "block",
            }}
          />
        ))}
      </div>
    </div>
  );
}
