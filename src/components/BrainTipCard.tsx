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
        background: "rgba(38,38,38,0.6)",
        borderColor: "rgba(72,72,71,0.2)",
        fontFamily: "'Manrope', sans-serif",
      }}
    >
      <button
        onClick={onDismiss}
        className="absolute top-3 right-3 text-sm rounded-full w-6 h-6 flex items-center justify-center"
        style={{ color: "#777", background: "rgba(72,72,71,0.3)" }}
      >
        ×
      </button>

      <div className="flex items-center gap-2">
        <span className="text-xl">{emoji}</span>
        <span className="text-sm font-semibold text-white">{brain.name} is ready — start here</span>
      </div>

      <div className="space-y-2">
        {tips.map((tip) => (
          <div key={tip} className="flex items-start gap-2 text-sm" style={{ color: "#aaa" }}>
            <span style={{ color: "#72eff5" }}>✦</span>
            {tip}
          </div>
        ))}
      </div>

      <button
        onClick={onFill}
        className="w-full rounded-xl py-2 text-sm font-semibold transition-opacity hover:opacity-90"
        style={{
          background: "linear-gradient(135deg, #72eff5, #1fb1b7)",
          color: "#0a0a0a",
        }}
      >
        Start filling →
      </button>
    </div>
  );
}
