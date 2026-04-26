import * as chrono from "chrono-node";
import { format } from "date-fns";

export type ParsedPriority = "p1" | "p2" | "p3" | "p4" | null;
export type ParsedEnergy = "low" | "medium" | "high" | null;

export interface ParseResult {
  cleanTitle: string;
  dueDate: string | null; // yyyy-MM-dd
  dayOfMonth: number | null; // 1–31, for monthly recurring
  priority: ParsedPriority;
  tags: string[];
  energy: ParsedEnergy;
}

const PRIORITY_RE = /\b(p[1-4])\b/i;
const TAG_RE = /#([a-zA-Z0-9_-]+)/g;
const ENERGY_RE = /!(high|med(?:ium)?|low)\b/i;
// Matches: "every 1st", "every 1st of the month", "1st of every month", "on the 15th of each month"
const DOM_RE =
  /\b(?:every|on the|the)\s+(\d+)(?:st|nd|rd|th)(?:\s+of\s+(?:every|the|each)?\s*month)?|\b(\d+)(?:st|nd|rd|th)\s+of\s+every\s+month/i;

function mapEnergy(raw: string): ParsedEnergy {
  const l = raw.toLowerCase();
  if (l === "high") return "high";
  if (l === "low") return "low";
  return "medium";
}

export function parseTask(input: string): ParseResult {
  let working = input;

  // Priority
  const priorityMatch = PRIORITY_RE.exec(working);
  const priority = priorityMatch ? (priorityMatch[1].toLowerCase() as ParsedPriority) : null;
  if (priorityMatch) working = working.replace(priorityMatch[0], "");

  // Energy
  const energyMatch = ENERGY_RE.exec(working);
  const energy = energyMatch ? mapEnergy(energyMatch[1]) : null;
  if (energyMatch) working = working.replace(energyMatch[0], "");

  // Tags
  const tags: string[] = [];
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = TAG_RE.exec(working)) !== null) tags.push(tagMatch[1]);
  working = working.replace(/#[a-zA-Z0-9_-]+/g, "");

  // Monthly recurring (before chrono so "1st" isn't consumed as a date)
  const domMatch = DOM_RE.exec(working);
  const dayOfMonth = domMatch
    ? (() => {
        const n = parseInt(domMatch[1] ?? domMatch[2], 10);
        return n >= 1 && n <= 31 ? n : null;
      })()
    : null;
  if (domMatch) working = working.replace(domMatch[0], "");

  // Normalise "next week <weekday>" → "<weekday> next week" so chrono parses correctly
  if (dayOfMonth === null) {
    working = working.replace(
      /next\s+week\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)/gi,
      "$1 next week",
    );
  }

  // One-off date (chrono-node) — only if not a monthly recurring
  const chronoResults = dayOfMonth === null ? chrono.parse(working, new Date(), { forwardDate: true }) : [];
  let dueDate: string | null = null;
  if (chronoResults.length > 0) {
    const r = chronoResults[0];
    dueDate = format(r.date(), "yyyy-MM-dd");
    working = working.replace(r.text, "");
  }

  const cleanTitle = working.replace(/\s{2,}/g, " ").trim();

  return { cleanTitle, dueDate, dayOfMonth, priority, tags, energy };
}
