import { useState, useMemo, type JSX } from "react";
import { SUGGESTIONS } from "../data/personalSuggestions";
import { FAMILY_SUGGESTIONS } from "../data/familySuggestions";
import { BUSINESS_SUGGESTIONS } from "../data/businessSuggestions";
import type { Brain, Suggestion } from "../types";

const DISMISSED_KEY = "openbrain_checklist_dismissed";
const ANSWERED_KEY = "openbrain_answered_qs";

function getSuggestions(type: string): Suggestion[] {
  if (type === "family") return FAMILY_SUGGESTIONS;
  if (type === "business") return BUSINESS_SUGGESTIONS;
  return SUGGESTIONS;
}

function getDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]");
  } catch {
    return [];
  }
}

function getAnswered(): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(ANSWERED_KEY) || "[]"));
  } catch {
    return new Set<string>();
  }
}

interface OnboardingChecklistProps {
  activeBrain: Brain | null;
  onNavigate: (view: string) => void;
}

export default function OnboardingChecklist({
  activeBrain,
  onNavigate,
}: OnboardingChecklistProps): JSX.Element | null {
  const [dismissed, setDismissed] = useState<string[]>(getDismissed);
  const [expanded, setExpanded] = useState<boolean>(false);

  const brainType = activeBrain?.type || "personal";
  const answered = useMemo(() => getAnswered(), []);

  const questions = useMemo(() => {
    const all = getSuggestions(brainType);
    return all.filter((s) => s.p === "high" && !answered.has(s.q) && !dismissed.includes(s.q));
  }, [brainType, answered, dismissed]);

  const categories = useMemo((): [string, Suggestion[]][] => {
    const cats: Record<string, Suggestion[]> = {};
    questions.forEach((q) => {
      if (!cats[q.cat]) cats[q.cat] = [];
      cats[q.cat].push(q);
    });
    return (Object.entries(cats) as [string, Suggestion[]][]).sort(
      (a, b) => b[1].length - a[1].length,
    );
  }, [questions]);

  if (questions.length === 0) return null;

  function dismissAll(): void {
    const next = [...dismissed, ...questions.map((s) => s.q)];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {}
  }

  function dismissCategory(cat: string): void {
    const catQs = questions.filter((q) => q.cat === cat).map((q) => q.q);
    const next = [...dismissed, ...catQs];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {}
  }

  return (
    <div className="mx-4 mt-3">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 border text-left transition-colors"
        style={{
          background: "rgba(38,38,38,0.5)",
          borderColor: expanded ? "rgba(114,239,245,0.2)" : "rgba(72,72,71,0.15)",
        }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(114,239,245,0.1)", color: "#72eff5" }}
        >
          <span className="text-sm">✦</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{questions.length} things to capture</p>
          <p className="text-xs text-[#777] truncate">
            {categories.slice(0, 3).map(([cat]) => cat).join(" · ")}
            {categories.length > 3 && ` +${categories.length - 3}`}
          </p>
        </div>
        <span className="text-xs text-[#555] flex-shrink-0">{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Expanded categories */}
      {expanded && (
        <div
          className="mt-2 rounded-2xl border p-3"
          style={{ background: "rgba(38,38,38,0.4)", borderColor: "rgba(72,72,71,0.15)" }}
        >
          <div className="flex flex-wrap gap-2 mb-3">
            {categories.map(([cat, items]) => (
              <div
                key={cat}
                onClick={() => onNavigate("suggest")}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 border cursor-pointer transition-colors hover:border-[rgba(114,239,245,0.3)]"
                style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}
              >
                <span className="text-xs text-white">
                  {cat} <span className="text-[#777]">({items.length})</span>
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissCategory(cat);
                  }}
                  className="text-[#555] hover:text-[#ff6e84] text-xs ml-0.5 transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-2 border-t" style={{ borderColor: "rgba(72,72,71,0.15)" }}>
            <button
              onClick={() => onNavigate("suggest")}
              className="flex-1 py-2 rounded-xl text-xs font-bold transition-colors"
              style={{ background: "linear-gradient(135deg, #72eff5, #1fb1b7)", color: "#0a0a0a" }}
            >
              Fill Brain →
            </button>
            <button
              onClick={dismissAll}
              className="py-2 px-4 rounded-xl text-xs text-[#777] border transition-colors hover:bg-white/5"
              style={{ borderColor: "rgba(72,72,71,0.2)", background: "transparent" }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
