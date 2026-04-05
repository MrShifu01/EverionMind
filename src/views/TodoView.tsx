import { useMemo } from "react";
import { TC, fmtD } from "../data/constants";
import { useTheme } from "../ThemeContext";
import type { Entry } from "../types";

const DATE_KEYS = [
  "deadline", "due_date", "valid_to", "expiry_date", "expiry",
  "renewal_date", "event_date", "date", "start_date", "end_date",
  "scheduled_date", "appointment_date", "event_start", "match_date", "game_date",
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

function extractDates(entry: Entry): string[] {
  const m = entry.metadata || {};
  const dates = new Set<string>();

  // Explicit date fields
  DATE_KEYS.forEach(k => {
    if (m[k] && DATE_RE.test(String(m[k]))) dates.add(String(m[k]).slice(0, 10));
  });

  // Generic metadata scan
  Object.values(m).forEach(v => {
    if (typeof v === "string" && DATE_RE.test(v)) dates.add(v.slice(0, 10));
  });

  return [...dates];
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface TodoViewProps {
  entries?: Entry[];
}

interface TodoItem {
  entry: Entry;
  dateStr: string;
}

export default function TodoView({ entries = [] }: TodoViewProps) {
  const { t } = useTheme();

  const { today, tomorrow, thisWeek, overdue } = useMemo(() => {
    const now = new Date();
    const todayKey = toDateKey(now);

    const tom = new Date(now);
    tom.setDate(tom.getDate() + 1);
    const tomorrowKey = toDateKey(tom);

    // End of week (Sunday)
    const endOfWeek = new Date(now);
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
    const endOfWeekKey = toDateKey(endOfWeek);

    const today: TodoItem[] = [];
    const tomorrow: TodoItem[] = [];
    const thisWeek: TodoItem[] = []; // days after tomorrow through end of week
    const overdue: TodoItem[] = [];

    entries.forEach(entry => {
      // Skip completed reminders
      if (entry.type === "reminder" && entry.metadata?.status === "done") return;

      const dates = extractDates(entry);
      dates.forEach(dateStr => {
        const item = { entry, dateStr };
        if (dateStr === todayKey) {
          today.push(item);
        } else if (dateStr === tomorrowKey) {
          tomorrow.push(item);
        } else if (dateStr > tomorrowKey && dateStr <= endOfWeekKey) {
          thisWeek.push(item);
        } else if (dateStr < todayKey) {
          overdue.push(item);
        }
      });
    });

    // Sort each section by date
    const byDate = (a: TodoItem, b: TodoItem) => a.dateStr.localeCompare(b.dateStr);
    thisWeek.sort(byDate);
    overdue.sort((a, b) => b.dateStr.localeCompare(a.dateStr)); // most recent first

    return { today, tomorrow, thisWeek, overdue };
  }, [entries]);

  const total = today.length + tomorrow.length + thisWeek.length + overdue.length;

  function renderItem({ entry, dateStr }: TodoItem, showDate: boolean) {
    const tc = TC[entry.type] || TC.note;
    return (
      <div
        key={`${entry.id}-${dateStr}`}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px",
          background: t.surface,
          border: `1px solid ${t.border}`,
          borderRadius: 10,
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 16, flexShrink: 0 }}>{tc.i}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.title}
          </p>
          {entry.content && entry.content !== entry.title && (
            <p style={{ margin: "2px 0 0", fontSize: 11, color: t.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {entry.content}
            </p>
          )}
        </div>
        {showDate && (
          <span style={{ fontSize: 10, color: t.textDim, flexShrink: 0 }}>
            {fmtD(dateStr)}
          </span>
        )}
        <span style={{
          fontSize: 9, padding: "2px 8px", borderRadius: 20, fontWeight: 700, flexShrink: 0,
          background: `${tc.c}20`, color: tc.c,
        }}>
          {entry.type}
        </span>
      </div>
    );
  }

  function renderSection(title: string, emoji: string, items: TodoItem[], showDate: boolean, accentColor?: string) {
    if (items.length === 0) return null;
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 14 }}>{emoji}</span>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: accentColor || t.textMid, textTransform: "uppercase", letterSpacing: 1 }}>
            {title}
          </p>
          <span style={{ fontSize: 11, color: t.textDim, fontWeight: 400 }}>({items.length})</span>
        </div>
        {items.map(item => renderItem(item, showDate))}
      </div>
    );
  }

  return (
    <div>
      {total === 0 && (
        <div style={{ textAlign: "center", paddingTop: 48 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: t.text, marginBottom: 4 }}>All clear</p>
          <p style={{ fontSize: 13, color: t.textDim, margin: 0, lineHeight: 1.6 }}>
            No upcoming deadlines, events, or reminders this week.<br />
            Entries with dates will show up here automatically.
          </p>
        </div>
      )}

      {renderSection("Overdue", "🔴", overdue, true, "#FF6B35")}
      {renderSection("Today", "🟢", today, false, "#4ECDC4")}
      {renderSection("Tomorrow", "🟡", tomorrow, false, "#FFEAA7")}
      {renderSection("This week", "📅", thisWeek, true)}
    </div>
  );
}

