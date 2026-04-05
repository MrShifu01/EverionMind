import type { JSX } from "react";
import { useTheme } from "../ThemeContext";
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
  const { t } = useTheme();
  const tips = TIPS[brain.type || ""] || [];
  const emoji = brain.type === "business" ? "🏪" : "🏠";

  return (
    <div style={{
      margin: "0 20px 16px",
      padding: "16px 18px",
      background: "linear-gradient(135deg, rgba(78,205,196,0.08), rgba(69,183,209,0.06))",
      border: "1px solid rgba(78,205,196,0.25)",
      borderRadius: 14,
      position: "relative",
    }}>
      <button
        onClick={onDismiss}
        style={{
          position: "absolute", top: 10, right: 12,
          background: "none", border: "none", color: t.textFaint,
          fontSize: 16, cursor: "pointer", lineHeight: 1,
        }}
      >×</button>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 18 }}>{emoji}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>
          {brain.name} is ready — start here
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {tips.map(tip => (
          <div key={tip} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: t.textDim }}>
            <span style={{ color: "#4ECDC4", marginTop: 1, flexShrink: 0 }}>✦</span>
            {tip}
          </div>
        ))}
      </div>

      <button
        onClick={onFill}
        style={{
          padding: "8px 18px",
          background: "linear-gradient(135deg, #4ECDC4, #45B7D1)",
          border: "none",
          borderRadius: 8,
          color: "#0f0f23",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Start filling →
      </button>
    </div>
  );
}
