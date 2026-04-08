import type { JSX } from "react";
import type { Brain } from "../types";

const TIPS: Record<string, string[]> = {
  family: [
    "Emergency contacts for each family member",
    "Medical aid numbers & blood types",
    "School names, contacts & pickup rules",
    "Home insurance policy & emergency numbers",
  ],
  business: [
    "Key supplier contacts & account numbers",
    "Staff names, roles & emergency contacts",
    "Licences, registration numbers & renewal dates",
    "SOPs for your most common tasks",
  ],
};

interface BrainTipCardProps {
  brain: Brain;
  onDismiss: () => void;
  onFill: () => void;
}

export default function BrainTipCard({ brain, onDismiss, onFill }: BrainTipCardProps): JSX.Element {
  const tips = TIPS[brain.type || ""] || [];
  const emoji = brain.type === "business" ? "🏪" : "🏠";

  return (
    <div
      className="relative rounded-2xl border p-4 space-y-3"
      style={{
        background: "var(--color-surface-container)",
        borderColor: "var(--color-outline-variant)",
      }}
    >
      <button
        onClick={onDismiss}
        aria-label="Dismiss tip"
        className="absolute top-2 right-2 text-sm rounded-full w-11 h-11 flex items-center justify-center"
        style={{ color: "var(--color-on-surface-variant)", background: "var(--color-outline-variant)" }}
      >
        ×
      </button>

      <div className="flex items-center gap-2">
        <span className="text-xl">{emoji}</span>
        <span className="text-sm font-semibold text-on-surface">{brain.name} is ready — start here</span>
      </div>

      <div className="space-y-2">
        {tips.map((tip) => (
          <div key={tip} className="flex items-start gap-2 text-sm text-on-surface-variant">
            <span className="text-primary">✦</span>
            {tip}
          </div>
        ))}
      </div>

      <button
        onClick={onFill}
        className="w-full rounded-xl py-2 text-sm font-semibold transition-opacity hover:opacity-90 press-scale"
        style={{
          background: "var(--color-primary)",
          color: "var(--color-on-primary)",
        }}
      >
        Start filling →
      </button>
    </div>
  );
}
