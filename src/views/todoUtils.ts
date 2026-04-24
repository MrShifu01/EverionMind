import type { Entry } from "../types";

/* ─── Date extraction ─── */
export const ALL_DATE_KEYS = [
  "deadline",
  "due_date",
  "valid_to",
  "valid_from",
  "date",
  "event_date",
  "start_date",
  "end_date",
  "match_date",
  "game_date",
  "scheduled_date",
  "appointment_date",
  "event_start",
  "expiry_date",
  "expiry",
  "renewal_date",
];
export const ACTION_DATE_KEYS = ["due_date", "deadline"];
export const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
export const CONTENT_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/g;
export const DOW: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

export function extractDates(entry: Entry): string[] {
  const m = (entry.metadata || {}) as Record<string, unknown>;
  const dates = new Set<string>();
  ALL_DATE_KEYS.forEach((k) => {
    if (m[k] && DATE_RE.test(String(m[k]))) dates.add(String(m[k]).slice(0, 10));
  });
  Object.values(m).forEach((v) => {
    if (typeof v === "string" && DATE_RE.test(v)) dates.add(v.slice(0, 10));
  });
  const text = `${entry.title || ""} ${entry.content || ""}`;
  let match;
  while ((match = CONTENT_DATE_RE.exec(text)) !== null) dates.add(match[1]);
  return [...dates];
}

export function extractActionDates(entry: Entry): string[] {
  const m = (entry.metadata || {}) as Record<string, unknown>;
  const dates = new Set<string>();
  ACTION_DATE_KEYS.forEach((k) => {
    if (m[k] && DATE_RE.test(String(m[k]))) dates.add(String(m[k]).slice(0, 10));
  });
  return [...dates];
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function isDone(entry: Entry): boolean {
  return (entry.metadata as { status?: string } | undefined)?.status === "done";
}

export interface TodoItem {
  entry: Entry;
  dateStr: string;
}

/* ─── External calendar event shape ─── */
export interface ExternalCalEvent {
  id: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  allDay?: boolean;
  provider: "google" | "microsoft";
  calendarEmail?: string;
}

/* ─── Recurring helper ─── */
export function addRecurring(
  entries: Entry[],
  add: (key: string, e: Entry) => void,
  targetYear?: number,
  targetMon?: number,
) {
  const now = new Date();
  const year = targetYear ?? now.getFullYear();
  const mon = targetMon ?? now.getMonth();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  entries.forEach((e) => {
    const m = (e.metadata || {}) as Record<string, unknown>;
    let rawDay = (m.day_of_week || m.weekday || m.recurring_day || "")
      .toString()
      .toLowerCase()
      .trim();
    if (!rawDay) {
      const text = `${e.title || ""} ${e.content || ""}`.toLowerCase();
      const match = text.match(
        /every\s+(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)/i,
      );
      if (match) rawDay = match[1];
    }
    const dowIndex = DOW[rawDay];
    if (dowIndex === undefined) return;
    for (let d = 1; d <= daysInMonth; d++) {
      if (new Date(year, mon, d).getDay() === dowIndex)
        add(`${year}-${String(mon + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, e);
    }
  });
}
