import type { JSX } from "react";
import type { Brain } from "../types";
import { BrainTypeIcon } from "./icons/BrainTypeIcon";

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

  return (
    <div
      className="relative space-y-3 rounded-2xl border p-4"
      style={{
        background: "var(--color-surface-container)",
        borderColor: "var(--color-outline-variant)",
      }}
    >
      <button
        onClick={onDismiss}
        aria-label="Dismiss tip"
        className="absolute top-2 right-2 flex h-11 w-11 items-center justify-center rounded-full text-sm"
        style={{
          color: "var(--color-on-surface-variant)",
          background: "var(--color-outline-variant)",
        }}
      >
        ×
      </button>

      <div className="flex items-center gap-2">
        <span className="text-on-surface-variant">
          <BrainTypeIcon type={brain.type ?? "personal"} className="h-5 w-5" />
        </span>
        <span className="text-on-surface text-sm font-semibold">
          {brain.name} is ready — start here
        </span>
      </div>

      <div className="space-y-2">
        {tips.map((tip) => (
          <div key={tip} className="text-on-surface-variant flex items-start gap-2 text-sm">
            <span className="text-primary">✦</span>
            {tip}
          </div>
        ))}
      </div>

      <button
        onClick={onFill}
        className="press-scale w-full rounded-xl py-2 text-sm font-semibold transition-opacity hover:opacity-90"
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
