import { useState, useMemo } from "react";
import { useTheme } from "../ThemeContext";
import { SUGGESTIONS } from "../data/personalSuggestions";
import { FAMILY_SUGGESTIONS } from "../data/familySuggestions";
import { BUSINESS_SUGGESTIONS } from "../data/businessSuggestions";

const DISMISSED_KEY = "openbrain_checklist_dismissed";
const ANSWERED_KEY = "openbrain_answered_qs";

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

  // Group by category
  const categories = useMemo(() => {
    const cats = {};
    questions.forEach(q => {
      if (!cats[q.cat]) cats[q.cat] = [];
      cats[q.cat].push(q);
    });
    return Object.entries(cats).sort((a, b) => b[1].length - a[1].length);
  }, [questions]);

  if (questions.length === 0) return null;

  function dismissAll() {
    const next = [...dismissed, ...questions.map(s => s.q)];
    setDismissed(next);
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(next)); } catch {}
  }

  function dismissCategory(cat) {
    const catQs = questions.filter(q => q.cat === cat).map(q => q.q);
    const next = [...dismissed, ...catQs];
    setDismissed(next);
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(next)); } catch {}
  }

  const brainEmoji = brainType === "business" ? "🏪" : brainType === "family" ? "🏠" : "🧠";

  return (
    <div style={{
      background: t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: 14,
      overflow: "hidden",
      marginBottom: 12,
    }}>
      {/* Compact header — always visible */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 14px",
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 14 }}>{brainEmoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: t.text }}>
            {questions.length} things to capture
          </p>
          <p style={{ margin: 0, fontSize: 11, color: t.textDim }}>
            {categories.slice(0, 3).map(([cat]) => cat).join(" · ")}
            {categories.length > 3 && ` +${categories.length - 3}`}
          </p>
        </div>
        <span style={{ fontSize: 10, color: t.textDim, flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {/* Expanded: show categories as compact rows */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${t.border}`, padding: "6px 0" }}>
          {categories.map(([cat, items]) => (
            <div
              key={cat}
              onClick={() => onNavigate("suggest")}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 14px",
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 11, color: t.textDim, flex: 1, fontWeight: 500 }}>
                {cat} <span style={{ color: t.textFaint }}>({items.length})</span>
              </span>
              <button
                onClick={e => { e.stopPropagation(); dismissCategory(cat); }}
                style={{ background: "none", border: "none", color: t.textFaint, fontSize: 13, cursor: "pointer", padding: "2px 4px", lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, padding: "8px 14px 10px", borderTop: `1px solid ${t.border}`, marginTop: 4 }}>
            <button
              onClick={() => onNavigate("suggest")}
              style={{
                flex: 1, padding: "8px 12px",
                background: "rgba(78,205,196,0.1)",
                border: "1px solid rgba(78,205,196,0.25)",
                borderRadius: 8,
                color: "#4ECDC4", fontSize: 12, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Fill Brain →
            </button>
            <button
              onClick={dismissAll}
              style={{
                padding: "8px 12px",
                background: "none",
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                color: t.textFaint, fontSize: 12,
                cursor: "pointer",
              }}
            >
              Dismiss all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
