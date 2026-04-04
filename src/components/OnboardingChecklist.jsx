import { useState } from "react";
import { useTheme } from "../ThemeContext";

const LS_KEY = "openbrain_checklist_dismissed";

const STEPS = [
  { id: "fill",    icon: "✦", label: "Fill your brain",         desc: "Answer guided questions to build your memory", view: "suggest" },
  { id: "capture", icon: "✍️", label: "Capture your first memory", desc: "Type anything — AI will structure it",        view: null },
  { id: "ask",     icon: "◈", label: "Ask your brain something", desc: "Chat with AI about everything you've stored",  view: "chat" },
  { id: "grid",    icon: "▦", label: "Browse Memory Grid",       desc: "See all your memories organised",              view: "grid" },
];

function getDismissed() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}

export default function OnboardingChecklist({ entries, onNavigate }) {
  const { t } = useTheme();
  const [dismissed, setDismissed] = useState(getDismissed);

  const remaining = STEPS.filter(s => {
    if (dismissed.includes(s.id)) return false;
    // Auto-complete "capture" if user already has entries
    if (s.id === "capture" && entries.length > 0) return false;
    return true;
  });

  if (remaining.length === 0) return null;

  function dismiss(id) {
    const next = [...dismissed, id];
    setDismissed(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
  }

  function handleTap(step) {
    if (step.view) {
      onNavigate(step.view);
    }
    // "capture" step has no view — just dismiss it since QuickCapture is already on screen
    if (!step.view) dismiss(step.id);
  }

  function dismissAll() {
    const allIds = STEPS.map(s => s.id);
    setDismissed(allIds);
    try { localStorage.setItem(LS_KEY, JSON.stringify(allIds)); } catch {}
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: t.textMid }}>
          Getting started
        </p>
        <button
          onClick={dismissAll}
          style={{ background: "none", border: "none", color: t.textFaint, fontSize: 11, cursor: "pointer", padding: "2px 6px" }}
        >
          Dismiss all
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {remaining.map(step => (
          <div
            key={step.id}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 14px",
              background: t.surface,
              border: `1px solid ${t.border}`,
              borderRadius: 12,
              cursor: "pointer",
            }}
            onClick={() => handleTap(step)}
          >
            <span style={{ fontSize: 16, color: "#4ECDC4", width: 24, textAlign: "center", flexShrink: 0 }}>{step.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{step.label}</div>
              <div style={{ fontSize: 11, color: t.textDim }}>{step.desc}</div>
            </div>
            <button
              onClick={e => { e.stopPropagation(); dismiss(step.id); }}
              title="Dismiss"
              style={{ background: "none", border: "none", color: t.textFaint, fontSize: 16, cursor: "pointer", padding: "2px 6px", flexShrink: 0, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
