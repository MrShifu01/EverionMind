import { useState, useEffect } from "react";
import TrashView from "../../views/TrashView";
import type { Brain } from "../../types";

function UsagePanel() {
  const [usage, setUsage] = useState({ inputTokens: 0, outputTokens: 0, estimatedUsd: 0 });
  useEffect(() => {
    import("../../lib/usageTracker").then(m => setUsage(m.getMonthlyUsage()));
  }, []);

  return (
    <div className="rounded-2xl border p-4 space-y-3" style={{ background: "var(--color-surface-container)", borderColor: "var(--color-outline-variant)" }}>
      <p className="text-sm font-semibold text-on-surface">Usage this month</p>
      <div className="space-y-1 text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
        <p>Input tokens: <span className="text-on-surface">{usage.inputTokens.toLocaleString()}</span></p>
        <p>Output tokens: <span className="text-on-surface">{usage.outputTokens.toLocaleString()}</span></p>
        <p>Est. cost: <span className="text-on-surface">${usage.estimatedUsd.toFixed(4)}</span> <span style={{ color: "var(--color-outline)" }}>(estimate only)</span></p>
      </div>
      <button
        onClick={() => {
          import("../../lib/usageTracker").then(m => {
            m.clearUsage();
            setUsage({ inputTokens: 0, outputTokens: 0, estimatedUsd: 0 });
          });
        }}
        className="rounded-lg px-3 text-xs"
        style={{ color: "var(--color-on-surface-variant)", border: "1px solid var(--color-outline-variant)", minHeight: 44 }}
      >
        Clear history
      </button>
    </div>
  );
}

interface Props {
  activeBrain?: Brain;
}

export default function StorageTab({ activeBrain }: Props) {
  const [showTrash, setShowTrash] = useState(false);

  return (
    <>
      <UsagePanel />

      <div className="rounded-2xl border p-4 space-y-3" style={{ background: "var(--color-surface-container-high)", borderColor: "var(--color-outline-variant)" }}>
        <p className="text-sm font-semibold text-on-surface">Data & Storage</p>
        <button
          onClick={() => setShowTrash(s => !s)}
          className="rounded-xl px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90"
          style={{ background: "color-mix(in oklch, var(--color-error) 10%, var(--color-surface-container))", color: "var(--color-error)", minHeight: 44 }}
        >
          {showTrash ? "Hide Trash" : "View Trash"}
        </button>
        {showTrash && (
          <div className="mt-2">
            <TrashView brainId={activeBrain?.id} />
          </div>
        )}
      </div>

      <div className="rounded-2xl border p-4 space-y-3" style={{ background: "var(--color-surface-container-high)", borderColor: "var(--color-outline-variant)" }}>
        <p className="text-sm font-semibold text-on-surface">Help & Onboarding</p>
        <button
          onClick={() => {
            localStorage.removeItem("openbrain_onboarded");
            window.dispatchEvent(new CustomEvent("openbrain:restart-onboarding"));
          }}
          className="rounded-xl px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90"
          style={{ background: "var(--color-primary-container)", color: "var(--color-primary)", minHeight: 44 }}
        >
          Restart Onboarding
        </button>
      </div>
    </>
  );
}
