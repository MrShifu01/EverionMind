import { useState, useMemo } from "react";
import { useTheme } from "../ThemeContext";
import { SUGGESTIONS } from "../data/personalSuggestions";
import { FAMILY_SUGGESTIONS } from "../data/familySuggestions";
import { BUSINESS_SUGGESTIONS } from "../data/businessSuggestions";

const DISMISSED_KEY = "openbrain_checklist_dismissed";
const ANSWERED_KEY = "openbrain_answered_qs";
const MAX_VISIBLE = 5;

function getSuggestions(type) {
  if (type === "family") return FAMILY_SUGGESTIONS;
  if (type === "business") return BUSINESS_SUGGESTIONS;
  return SUGGESTIONS;
}

function getDismissed() {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]"); } catch { return []; }
}

function getAnswered() {
  try { return new Set(JSON.parse(localStorage.getItem(ANSWERED_KEY) || "[]")); } catch { return new Set(); }
}

export default function OnboardingChecklist({ activeBrain, onNavigate }) {
  const { t } = useTheme();
  const [dismissed, setDismissed] = useState(getDismissed);
  const [expanded, setExpanded] = useState(false);

  const brainType = activeBrain?.type || "personal";
  const answered = useMemo(() => getAnswered(), []);

  const questions = useMemo(() => {
    const all = getSuggestions(brainType);
    return all.filter(s =>
      s.p === "high" &&
      !answered.has(s.q) &&
      !dismissed.includes(s.q)
    );
  }, [brainType, answered, dismissed]);

  if (questions.length === 0) return null;

  function dismiss(q) {
    const next = [...dismissed, q];
    setDismissed(next);
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(next)); } catch {}
  }

  function dismissAll() {
    const next = [...dismissed, ...questions.map(s => s.q)];
    setDismissed(next);
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(next)); } catch {}
  }

  // Group by category for display
  const grouped = {};
  const visible = expanded ? questions : questions.slice(0, MAX_VISIBLE);
  visible.forEach(q => {
    if (!grouped[q.cat]) grouped[q.cat] = [];
    grouped[q.cat].push(q);
  });

  const brainLabel = brainType === "business" ? "Business" : brainType === "family" ? "Family" : "Personal";

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: t.textMid }}>
          {brainLabel} brain — things to capture
          <span style={{ fontSize: 11, fontWeight: 400, color: t.textDim, marginLeft: 6 }}>
            {questions.length} remaining
          </span>
        </p>
        <button
          onClick={dismissAll}
          style={{ background: "none", border: "none", color: t.textFaint, fontSize: 11, cursor: "pointer", padding: "2px 6px" }}
        >
          Dismiss all
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <p style={{ margin: "6px 0 4px", fontSize: 10, fontWeight: 600, color: t.textDim, textTransform: "uppercase", letterSpacing: 1 }}>
              {cat}
            </p>
            {items.map(item => (
              <div
                key={item.q}
                onClick={() => onNavigate("suggest")}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", marginBottom: 4,
                  background: t.surface,
                  border: `1px solid ${t.border}`,
                  borderRadius: 10,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 10, color: "#FF6B35", flexShrink: 0 }}>●</span>
                <p style={{ margin: 0, fontSize: 12, color: t.textSoft, flex: 1, lineHeight: 1.4 }}>
                  {item.q}
                </p>
                <button
                  onClick={e => { e.stopPropagation(); dismiss(item.q); }}
                  title="Dismiss"
                  style={{ background: "none", border: "none", color: t.textFaint, fontSize: 15, cursor: "pointer", padding: "2px 6px", flexShrink: 0, lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {questions.length > MAX_VISIBLE && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ display: "block", margin: "8px auto 0", background: "none", border: "none", color: "#4ECDC4", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
        >
          {expanded ? "Show less" : `Show ${questions.length - MAX_VISIBLE} more`}
        </button>
      )}

      <button
        onClick={() => onNavigate("suggest")}
        style={{
          display: "block", width: "100%", marginTop: 10,
          padding: "10px 16px",
          background: "rgba(78,205,196,0.08)",
          border: "1px solid rgba(78,205,196,0.25)",
          borderRadius: 10,
          color: "#4ECDC4", fontSize: 12, fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Go to Fill Brain to answer these →
      </button>
    </div>
  );
}
