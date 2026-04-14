import type { TypeConfig, Priority, PriorityConfig, Entry, Link } from "../types";

// Well-known type icons — all colors use CSS vars so they respond to light/dark mode.
export const TC: Record<string, TypeConfig> = {
  reminder: { i: "⏰", c: "var(--color-status-medium)" },
  document: { i: "📄", c: "var(--color-secondary)" },
  contact: { i: "📇", c: "var(--color-secondary)" },
  place: { i: "📍", c: "var(--color-on-surface-variant)" },
  person: { i: "👤", c: "var(--color-primary)" },
  idea: { i: "💡", c: "var(--color-status-medium)" },
  color: { i: "🎨", c: "var(--color-primary)" },
  decision: { i: "⚖️", c: "var(--color-secondary)" },
  note: { i: "📝", c: "var(--color-primary)" },
  secret: { i: "🔐", c: "var(--color-error)" },
};
export const PC: Record<Priority, PriorityConfig> = {
  high: {
    bg: "color-mix(in oklch, var(--color-error) 12%, transparent)",
    c: "var(--color-error)",
    l: "High",
  },
  medium: {
    bg: "color-mix(in oklch, var(--color-status-medium) 12%, transparent)",
    c: "var(--color-status-medium)",
    l: "Med",
  },
  low: {
    bg: "color-mix(in oklch, var(--color-secondary) 12%, transparent)",
    c: "var(--color-secondary)",
    l: "Low",
  },
};
export const fmtD = (d: string | Date): string =>
  new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
export const INITIAL_ENTRIES: Entry[] = [];

export const LINKS: Link[] = [];

const TYPE_COLOURS = [
  "var(--color-primary)",
  "var(--color-secondary)",
  "var(--color-status-medium)",
  "var(--color-on-surface-variant)",
  "var(--color-primary-dim)",
  "var(--color-secondary-dim)",
  "var(--color-error)",
  "var(--color-primary)",
];

export function getTypeConfig(type: string): TypeConfig {
  if (TC[type]) return TC[type];
  const idx = type.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % TYPE_COLOURS.length;
  return { i: "🏷️", c: TYPE_COLOURS[idx] };
}
