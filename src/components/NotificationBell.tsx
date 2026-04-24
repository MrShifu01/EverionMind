import { useState, useRef, useEffect, lazy, Suspense } from "react";
import type { AppNotification } from "../hooks/useNotifications";

const GmailScanReviewModal = lazy(() => import("./settings/GmailScanReviewModal"));

interface Props {
  notifications: AppNotification[];
  unreadCount: number;
  onDismiss: (id: string) => void;
  onMarkRead: (id: string) => void;
  onDismissAll: () => void;
  onAcceptMerge: (n: AppNotification) => void;
}

function BellIcon() {
  return (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function MergeCard({ n, onAccept, onDismiss }: {
  n: AppNotification;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const { source_title, target_title, confidence, would_add } = n.data;
  const addedKeys = Object.keys(would_add ?? {}).filter(
    (k) => !["source", "completeness_score"].includes(k),
  ).slice(0, 4);

  return (
    <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line-soft)" }}>
      <div className="f-sans" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: 8 }}>
        Possible duplicate · {confidence}% match
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {[source_title, target_title].map((t, i) => (
          <div key={i} style={{ flex: 1, padding: "8px 10px", borderRadius: 8,
            background: "var(--surface)", border: "1px solid var(--line-soft)", minWidth: 0 }}>
            <div className="f-sans" style={{ fontSize: 11, color: "var(--ink-faint)",
              marginBottom: 2 }}>{i === 0 ? "New" : "Existing"}</div>
            <div className="f-sans" style={{ fontSize: 13, fontWeight: 500,
              color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap" }}>{t}</div>
          </div>
        ))}
      </div>
      {addedKeys.length > 0 && (
        <div className="f-sans" style={{ fontSize: 11, color: "var(--ink-faint)",
          marginBottom: 10 }}>
          Would add: {addedKeys.map((k) => k.replace(/_/g, " ")).join(", ")}
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={onDismiss} className="press f-sans" style={{ flex: 1, height: 32,
          borderRadius: 7, border: "1px solid var(--line)", background: "transparent",
          color: "var(--ink-soft)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
          Keep separate
        </button>
        <button onClick={onAccept} className="press f-sans" style={{ flex: 1, height: 32,
          borderRadius: 7, border: "none", background: "var(--ember)",
          color: "var(--ember-ink)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          Merge →
        </button>
      </div>
    </div>
  );
}

function AutoMergedCard({ n, onDismiss }: { n: AppNotification; onDismiss: () => void }) {
  return (
    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line-soft)",
      display: "flex", alignItems: "flex-start", gap: 10 }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--moss-wash, #e8f5e9)",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
        <svg width="13" height="13" fill="none" stroke="var(--moss, #4caf50)" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="f-sans" style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
          {n.title}
        </div>
        <div className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}>
          {n.body}
        </div>
      </div>
      <button onClick={onDismiss} aria-label="Dismiss" className="press" style={{ width: 24,
        height: 24, borderRadius: 4, border: 0, background: "transparent",
        color: "var(--ink-faint)", cursor: "pointer", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" viewBox="0 0 24 24">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

function GmailReviewCard({ n, onDismiss, onReview }: {
  n: AppNotification;
  onDismiss: () => void;
  onReview: () => void;
}) {
  const { count } = n.data;
  return (
    <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line-soft)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--ember-wash)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
          <svg width="13" height="13" fill="none" stroke="var(--ember)" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <path d="M22 6l-10 7L2 6" />
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div className="f-sans" style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
            {n.title}
          </div>
          <div className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}>
            {n.body}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={onDismiss} className="press f-sans" style={{ flex: 1, height: 32,
          borderRadius: 7, border: "1px solid var(--line)", background: "transparent",
          color: "var(--ink-soft)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
          Accept all
        </button>
        <button onClick={onReview} className="press f-sans" style={{ flex: 1, height: 32,
          borderRadius: 7, border: "none", background: "var(--ember)",
          color: "var(--ember-ink)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          Review {count} items
        </button>
      </div>
    </div>
  );
}

export default function NotificationBell({
  notifications, unreadCount, onDismiss, onMarkRead, onDismissAll, onAcceptMerge,
}: Props) {
  const [open, setOpen] = useState(false);
  const [reviewItems, setReviewItems] = useState<any[] | null>(null);
  const [reviewNotifId, setReviewNotifId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  function handleOpen() {
    setOpen((v) => !v);
    // Mark all as read when opening
    notifications.filter((n) => !n.read).forEach((n) => onMarkRead(n.id));
  }

  function openGmailReview(n: AppNotification) {
    setReviewItems(n.data.items ?? []);
    setReviewNotifId(n.id);
    setOpen(false);
  }

  return (
    <div ref={panelRef} style={{ position: "relative" }}>
      <button
        onClick={handleOpen}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        className="press"
        style={{ width: 36, height: 36, minHeight: 36, display: "flex", alignItems: "center",
          justifyContent: "center", borderRadius: 6, color: "var(--ink-soft)",
          background: "transparent", border: 0, position: "relative" }}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span style={{ position: "absolute", top: 5, right: 5, width: 8, height: 8,
            borderRadius: "50%", background: "var(--ember)",
            border: "1.5px solid var(--bg)" }} />
        )}
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0,
          width: "min(340px, calc(100vw - 16px))", maxHeight: "calc(100dvh - 120px)", overflowY: "auto",
          background: "var(--surface-high)", border: "1px solid var(--line-soft)",
          borderRadius: 14, boxShadow: "var(--lift-3)", zIndex: 200 }}>
          {/* Header */}
          <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid var(--line-soft)",
            display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="f-sans" style={{ fontSize: 13, fontWeight: 600,
              color: "var(--ink)" }}>Notifications</span>
            {notifications.length > 0 && (
              <button onClick={onDismissAll} className="press f-sans"
                style={{ fontSize: 11, color: "var(--ink-faint)", background: "transparent",
                  border: 0, cursor: "pointer", padding: 0 }}>
                Clear all
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div style={{ padding: "28px 16px", textAlign: "center" }}>
              <div className="f-serif" style={{ fontSize: 13, fontStyle: "italic",
                color: "var(--ink-faint)" }}>All caught up.</div>
            </div>
          ) : (
            notifications.map((n) => {
              if (n.type === "merge_suggestion") {
                return (
                  <MergeCard key={n.id} n={n}
                    onAccept={() => onAcceptMerge(n)}
                    onDismiss={() => onDismiss(n.id)} />
                );
              }
              if (n.type === "gmail_review") {
                return (
                  <GmailReviewCard key={n.id} n={n}
                    onDismiss={() => onDismiss(n.id)}
                    onReview={() => openGmailReview(n)} />
                );
              }
              // auto_merged + catch-all
              return (
                <AutoMergedCard key={n.id} n={n} onDismiss={() => onDismiss(n.id)} />
              );
            })
          )}
        </div>
      )}

      {/* Gmail review modal spawned from notification */}
      {reviewItems && reviewItems.length > 0 && (
        <Suspense fallback={null}>
          <GmailScanReviewModal
            items={reviewItems}
            onClose={() => {
              setReviewItems(null);
              if (reviewNotifId) onDismiss(reviewNotifId);
              setReviewNotifId(null);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
