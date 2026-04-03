export const TC = {
  reminder: { i: "⏰", c: "#FF6B35" }, document: { i: "📄", c: "#4ECDC4" }, contact: { i: "📇", c: "#45B7D1" },
  place: { i: "📍", c: "#96CEB4" }, person: { i: "👤", c: "#DDA0DD" }, idea: { i: "💡", c: "#FFEAA7" },
  color: { i: "🎨", c: "#E17055" }, decision: { i: "⚖️", c: "#74B9FF" }, note: { i: "📝", c: "#A29BFE" },
};
export const PC = { high: { bg: "#FF6B3520", c: "#FF6B35", l: "High" }, medium: { bg: "#FFEAA720", c: "#FFEAA7", l: "Med" }, low: { bg: "#4ECDC420", c: "#4ECDC4", l: "Low" } };
export const fmtD = d => new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
export const MODEL = import.meta.env.VITE_ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

export const INITIAL_ENTRIES = [];

export const LINKS = [];
