import { useState, useEffect, useRef } from "react";

interface UndoToastProps {
  action: { type: "delete" | "update" | "create"; entry?: any; id?: string };
  onUndo: () => void;
  onDismiss: () => void;
}

export function UndoToast({ action, onUndo, onDismiss }: UndoToastProps) {
  const duration = action.type === "create" ? 3000 : 5000;
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
      className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90vw] max-w-sm overflow-hidden rounded-2xl border"
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
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-sm"
          style={{
            background: isDelete
              ? "color-mix(in oklch, var(--color-error) 10%, transparent)"
              : "color-mix(in oklch, var(--color-primary) 10%, transparent)",
          }}
        >
          {isDelete ? "🗑" : "✓"}
        </div>
        <span className="flex-1 text-sm font-medium text-on-surface">{label}</span>
        {action.type !== "create" && (
          <button
            onClick={onUndo}
            className="text-primary text-xs font-bold uppercase tracking-widest hover:text-primary-dim transition-colors press-scale"
          >
            Undo
          </button>
        )}
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-on-surface-variant hover:text-on-surface transition-colors ml-1"
        >
          <svg
            aria-hidden="true"
            className="w-4 h-4"
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
          className="h-full transition-none rounded-full"
          style={{
            width: `${pct}%`,
            background: isDelete ? "var(--color-error)" : "var(--color-primary)",
          }}
        />
      </div>
    </div>
  );
}
