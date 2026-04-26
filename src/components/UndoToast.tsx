import { useState, useEffect, useRef } from "react";

const UNDO_TOAST_CREATE_MS = 3000;
const UNDO_TOAST_MUTATE_MS = 5000;

interface UndoToastProps {
  action: { type: "delete" | "update" | "create"; entry?: any; id?: string };
  onUndo: () => void;
  onDismiss: () => void;
}

export function UndoToast({ action, onUndo, onDismiss }: UndoToastProps) {
  const duration = action.type === "create" ? UNDO_TOAST_CREATE_MS : UNDO_TOAST_MUTATE_MS;
  const [pct, setPct] = useState(100);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const p = Math.max(0, 100 - ((Date.now() - start) / duration) * 100);
      setPct(p);
      if (p <= 0) {
        onDismiss();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [duration, onDismiss]);

  const label = { delete: "Entry deleted", update: "Entry updated", create: "Entry created" }[
    action.type
  ];
  const isDelete = action.type === "delete";

  return (
    <div
      role="alert"
      className="fixed bottom-24 left-1/2 z-50 w-[90vw] max-w-sm -translate-x-1/2 overflow-hidden rounded-2xl border lg:bottom-6"
      style={{
        background: "var(--color-surface-container-high)",
        borderColor: isDelete
          ? "color-mix(in oklch, var(--color-error) 25%, transparent)"
          : "color-mix(in oklch, var(--color-primary) 25%, transparent)",
        boxShadow: "var(--shadow-lg)",
        animation: "slide-up 0.25s ease-out",
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-sm"
          style={{
            background: isDelete
              ? "color-mix(in oklch, var(--color-error) 10%, transparent)"
              : "color-mix(in oklch, var(--color-primary) 10%, transparent)",
          }}
        >
          {isDelete ? "🗑" : "✓"}
        </div>
        <span className="text-on-surface flex-1 text-sm font-medium">{label}</span>
        {action.type !== "create" && (
          <button
            onClick={onUndo}
            className="text-primary hover:text-primary-dim press-scale text-xs font-bold tracking-widest uppercase transition-colors"
          >
            Undo
          </button>
        )}
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-on-surface-variant hover:text-on-surface ml-1 transition-colors"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="h-0.5 w-full" style={{ background: "var(--color-outline-variant)" }}>
        <div
          className="h-full rounded-full transition-none"
          style={{
            width: `${pct}%`,
            background: isDelete ? "var(--color-error)" : "var(--color-primary)",
          }}
        />
      </div>
    </div>
  );
}
