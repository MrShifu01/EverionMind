import { useState, useMemo } from "react";
import { TC, fmtD } from "../data/constants";
import { useTheme } from "../ThemeContext";

export default function CalendarView({ entries }) {
  const { t } = useTheme();
  const [month, setMonth] = useState(() => new Date());
  const [selDay, setSelDay] = useState(null);

  const year = month.getFullYear();
  const mon = month.getMonth();
  const today = new Date().toISOString().slice(0, 10);

  const DOW = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

  const dateMap = useMemo(() => {
    const map = {};
    const addTo = (key, entry) => { if (!map[key]) map[key] = []; if (!map[key].find(e => e.id === entry.id)) map[key].push(entry); };

    // Explicit date fields — skip completed reminders
    entries.forEach(e => {
      if (e.type === "reminder" && e.metadata?.status === "done") return;
      [e.metadata?.deadline, e.metadata?.due_date, e.metadata?.valid_to, e.metadata?.valid_from, e.metadata?.date, e.metadata?.event_date].filter(Boolean).forEach(d => addTo(d.slice(0, 10), e));
    });

    // Recurring day-of-week entries — show on every matching weekday in displayed month
    entries.forEach(e => {
      const rawDay = (e.metadata?.day_of_week || e.metadata?.weekday || e.metadata?.recurring_day || "").toString().toLowerCase().trim();
      const dowIndex = DOW[rawDay];
      if (dowIndex === undefined) return;
      for (let d = 1; d <= new Date(year, mon + 1, 0).getDate(); d++) {
        if (new Date(year, mon, d).getDay() === dowIndex) {
          addTo(`${year}-${String(mon + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, e);
        }
      }
    });

    return map;
  }, [entries, year, mon]);

  const firstDow = new Date(year, mon, 1).getDay();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const monthLabel = month.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
  const dayKey = (d) => `${year}-${String(mon + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const selKey = selDay ? dayKey(selDay) : null;
  const selEntries = selKey ? (dateMap[selKey] || []) : [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button onClick={() => setMonth(new Date(year, mon - 1, 1))} aria-label="Previous month" style={{ minHeight: 44, minWidth: 44, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textMuted, padding: "8px 16px", cursor: "pointer", fontSize: 16 }}>←</button>
        <span style={{ fontSize: 16, fontWeight: 700, color: t.text }}>{monthLabel}</span>
        <button onClick={() => setMonth(new Date(year, mon + 1, 1))} aria-label="Next month" style={{ minHeight: 44, minWidth: 44, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textMuted, padding: "8px 16px", cursor: "pointer", fontSize: 16 }}>→</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 9, color: "#555", fontWeight: 700, letterSpacing: 1, padding: "4px 0" }}>{d}</div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />;
          const key = dayKey(day);
          const dots = dateMap[key] || [];
          const isToday = key === today;
          const isSel = day === selDay;
          return (
            <div key={key} onClick={() => setSelDay(day === selDay ? null : day)}
              style={{ minHeight: 44, aspectRatio: "1/1", borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer",
                background: isSel ? "#4ECDC4" : isToday ? "#4ECDC420" : dots.length ? t.surface : "transparent",
                border: isToday && !isSel ? "1px solid #4ECDC440" : dots.length && !isSel ? `1px solid ${t.border}` : "1px solid transparent" }}>
              <span style={{ fontSize: 12, fontWeight: isToday ? 800 : 400, color: isSel ? "#0f0f23" : isToday ? "#4ECDC4" : t.textMid }}>{day}</span>
              {dots.length > 0 && !isSel && (
                <div style={{ display: "flex", gap: 2, marginTop: 2 }}>
                  {dots.slice(0, 3).map((e, ei) => <div key={ei} style={{ width: 4, height: 4, borderRadius: "50%", background: e.importance >= 2 ? "#FF6B35" : (TC[e.type] || TC.note).c }} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selDay && (
        <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 11, color: "#666", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 12 }}>
            {selEntries.length ? `${selEntries.length} item${selEntries.length > 1 ? "s" : ""} — ${selKey}` : `Nothing on ${selKey}`}
          </p>
          {selEntries.map(e => {
            const cfg = TC[e.type] || TC.note;
            return (
              <div key={e.id} style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14 }}>{cfg.i}</span>
                  <span style={{ fontSize: 11, color: cfg.c, fontWeight: 700, textTransform: "uppercase" }}>{e.type}</span>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: t.textSoft, fontWeight: 500 }}>{e.title}</p>
                {e.content && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#999", lineHeight: 1.5 }}>{e.content.slice(0, 120)}</p>}
              </div>
            );
          })}
          {selEntries.length === 0 && <p style={{ color: "#555", fontSize: 13 }}>No entries with this date in their metadata.</p>}
        </div>
      )}
    </div>
  );
}
