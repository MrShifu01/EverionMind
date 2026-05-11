import { useState, useRef, useEffect } from "react";
import type { AppNotification } from "../hooks/useNotifications";
import { Button } from "./ui/button";

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
    <svg
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function MergeCard({
  n,
  onAccept,
  onDismiss,
}: {
  n: AppNotification;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const { source_title, target_title, confidence, would_add } = n.data;
  const addedKeys = Object.keys(would_add ?? {})
    .filter((k) => !["source", "completeness_score"].includes(k))
    .slice(0, 4);

  return (
    <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line-soft)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--ember-wash)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          <svg
            width="13"
            height="13"
            fill="none"
            stroke="var(--ember)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <path d="M12 4v16M4 12h16" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="f-sans" style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
            Suggested merge
          </div>
          <div className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}>
            “{source_title}” into “{target_title}”
            {typeof confidence === "number" && (
              <span style={{ marginLeft: 6, opacity: 0.7 }}>· {Math.round(confidence * 100)}%</span>
            )}
          </div>
          {addedKeys.length > 0 && (
            <div
              className="f-sans"
              style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 4 }}
            >
              adds: {addedKeys.join(", ")}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <Button variant="outline" size="sm" className="flex-1" onClick={onDismiss}>
          Dismiss
        </Button>
        <Button size="sm" className="flex-1" onClick={onAccept}>
          Merge
        </Button>
      </div>
    </div>
  );
}

function AutoMergedCard({ n, onDismiss }: { n: AppNotification; onDismiss: () => void }) {
  return (
    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line-soft)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="f-sans" style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
            {n.title}
          </div>
          {n.body && (
            <div
              className="f-sans"
              style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}
            >
              {n.body}
            </div>
          )}
        </div>
        <Button variant="link" size="xs" onClick={onDismiss} className="px-0">
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export default function NotificationBell({
  notifications,
  unreadCount,
  onDismiss,
  onMarkRead,
  onDismissAll,
  onAcceptMerge,
}: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  function handleClose() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) handleClose();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open, notifications]);

  function handleOpen() {
    if (open) {
      handleClose();
      return;
    }
    setOpen(true);
    notifications.filter((n) => !n.read).forEach((n) => onMarkRead(n.id));
  }

  function handleClearAll() {
    onDismissAll();
    setOpen(false);
  }

  return (
    <div ref={panelRef} style={{ position: "relative" }}>
      {(() => {
        const hasSignal = unreadCount > 0;
        const ariaLabelParts: string[] = ["Notifications"];
        if (unreadCount > 0) ariaLabelParts.push(`${unreadCount} unread`);
        return (
          <button
            onClick={handleOpen}
            aria-label={ariaLabelParts.join(" · ")}
            className="press"
            style={{
              width: 36,
              height: 36,
              minHeight: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              color: "var(--ink-soft)",
              background: "transparent",
              border: 0,
              position: "relative",
            }}
          >
            <BellIcon />
            {hasSignal && (
              <span
                style={{
                  position: "absolute",
                  top: 5,
                  right: 5,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--ember)",
                  border: "1.5px solid var(--bg)",
                }}
              />
            )}
          </button>
        );
      })()}

      {open && (
        <div
          style={{
            position: "fixed",
            top: 64,
            left: 8,
            right: 8,
            maxWidth: 340,
            margin: "0 auto",
            maxHeight: "calc(100dvh - 120px)",
            overflowY: "auto",
            background: "var(--surface-high)",
            border: "1px solid var(--line-soft)",
            borderRadius: 14,
            boxShadow: "var(--lift-3)",
            zIndex: "var(--z-toast)",
          }}
        >
          <div
            style={{
              padding: "12px 16px 10px",
              borderBottom: "1px solid var(--line-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span className="f-sans" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
              Notifications
            </span>
            {notifications.length > 0 && (
              <Button variant="link" size="xs" onClick={handleClearAll} className="px-0">
                Clear all
              </Button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div style={{ padding: "28px 16px", textAlign: "center" }}>
              <div
                className="f-serif"
                style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-faint)" }}
              >
                All caught up.
              </div>
            </div>
          ) : (
            notifications.map((n) => {
              if (n.type === "merge_suggestion") {
                return (
                  <MergeCard
                    key={n.id}
                    n={n}
                    onAccept={() => onAcceptMerge(n)}
                    onDismiss={() => onDismiss(n.id)}
                  />
                );
              }
              return <AutoMergedCard key={n.id} n={n} onDismiss={() => onDismiss(n.id)} />;
            })
          )}
        </div>
      )}
    </div>
  );
}
