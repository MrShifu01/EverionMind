import type { TypeConfig, Priority, PriorityConfig, Entry, Link } from "../types";

// Well-known type icons — unknown types fall back to TC.note at the call site.
export const TC: Record<string, TypeConfig> = {
  reminder: { i: "⏰", c: "#FF6B35" },
  document: { i: "📄", c: "#4ECDC4" },
  contact: { i: "📇", c: "#45B7D1" },
  place: { i: "📍", c: "#96CEB4" },
  person: { i: "👤", c: "#DDA0DD" },
  idea: { i: "💡", c: "#FFEAA7" },
  color: { i: "🎨", c: "#E17055" },
  decision: { i: "⚖️", c: "#74B9FF" },
  note: { i: "📝", c: "#A29BFE" },
  secret: { i: "🔐", c: "#FF4757" },
};
export const PC: Record<Priority, PriorityConfig> = {
  high: { bg: "#FF6B3520", c: "#FF6B35", l: "High" },
  medium: { bg: "#FFEAA720", c: "#FFEAA7", l: "Med" },
  low: { bg: "#4ECDC420", c: "#4ECDC4", l: "Low" },
};
export const fmtD = (d: string | Date): string =>
  new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
export const MODEL: string = import.meta.env.VITE_ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

export const INITIAL_ENTRIES: Entry[] = [];

export const LINKS: Link[] = [];

const TYPE_COLOURS = ["#9B59B6","#E67E22","#27AE60","#2980B9","#E74C3C","#16A085","#8E44AD","#D35400"];

export function getTypeConfig(type: string): TypeConfig {
  if (TC[type]) return TC[type];
  const idx = type.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % TYPE_COLOURS.length;
  return { i: "🏷️", c: TYPE_COLOURS[idx] };
}
