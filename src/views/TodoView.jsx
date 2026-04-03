import { useState } from "react";
import { PC } from "../data/constants";
import { useTheme } from "../ThemeContext";

export default function TodoView() {
  const { t } = useTheme();
  const [todos, setTodos] = useState(() => {
    try { return JSON.parse(localStorage.getItem("openbrain_todos") || "[]"); } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [priority, setPriority] = useState("medium");

  const persist = (updated) => { setTodos(updated); try { localStorage.setItem("openbrain_todos", JSON.stringify(updated)); } catch {} };
  const add = () => { if (!input.trim()) return; persist([{ id: Date.now().toString(), text: input.trim(), done: false, priority, created_at: new Date().toISOString() }, ...todos]); setInput(""); };
  const toggle = (id) => persist(todos.map(todo => todo.id === id ? { ...todo, done: !todo.done } : todo));
  const remove = (id) => persist(todos.filter(todo => todo.id !== id));

  const w = { high: 3, medium: 2, low: 1 };
  const pending = todos.filter(todo => !todo.done).sort((a, b) => (w[b.priority] || 0) - (w[a.priority] || 0));
  const done = todos.filter(todo => todo.done);

  return (
    <div>
      <div style={{ background: "#A29BFE15", border: "1px solid #A29BFE30", borderRadius: 10, padding: "10px 14px", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13 }}>🔌</span>
        <span style={{ fontSize: 11, color: "#A29BFE", lineHeight: 1.5 }}>Future: auto-populated from POS, Gmail, Calendar &amp; more — see <code style={{ color: "#4ECDC4", fontSize: 10 }}>.planning/roadmap/integrations.md</code></span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Add a task..." style={{ flex: 1, padding: "12px 16px", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, color: t.textSoft, fontSize: 14, outline: "none" }} />
        <select value={priority} onChange={e => setPriority(e.target.value)}
          style={{ padding: "0 10px", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, color: PC[priority].c, fontSize: 12, outline: "none", cursor: "pointer" }}>
          <option value="high">High</option>
          <option value="medium">Med</option>
          <option value="low">Low</option>
        </select>
        <button onClick={add} style={{ padding: "12px 20px", background: "#4ECDC4", border: "none", borderRadius: 10, color: "#0f0f23", fontWeight: 700, cursor: "pointer", fontSize: 18 }}>+</button>
      </div>

      {pending.length === 0 && done.length === 0 && (
        <p style={{ textAlign: "center", color: t.textFaint, marginTop: 40, fontSize: 14 }}>No tasks yet.</p>
      )}

      {pending.map(todo => {
        const pc = PC[todo.priority] || PC.medium;
        return (
          <div key={todo.id} style={{ display: "flex", alignItems: "center", gap: 12, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 8 }}>
            <button onClick={() => toggle(todo.id)} aria-label="Mark task complete" style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${pc.c}`, background: "transparent", cursor: "pointer", flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: 14, color: t.textSoft, flex: 1, lineHeight: 1.4 }}>{todo.text}</p>
            <span style={{ fontSize: 9, background: pc.bg, color: pc.c, padding: "2px 8px", borderRadius: 20, fontWeight: 700, flexShrink: 0 }}>{pc.l}</span>
            <button onClick={() => remove(todo.id)} aria-label="Delete task" style={{ background: "transparent", border: "none", color: t.textDim, cursor: "pointer", fontSize: 20, padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>
        );
      })}

      {done.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <p style={{ fontSize: 11, color: t.textFaint, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 12 }}>Done ({done.length})</p>
          {done.map(todo => (
            <div key={todo.id} style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 16px", marginBottom: 6, opacity: 0.45 }}>
              <button onClick={() => toggle(todo.id)} aria-label="Mark task incomplete" style={{ width: 20, height: 20, borderRadius: 6, border: "2px solid #444", background: "#4ECDC4", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#0f0f23" }}>✓</button>
              <p style={{ margin: 0, fontSize: 13, color: t.textDim, textDecoration: "line-through", flex: 1 }}>{todo.text}</p>
              <button onClick={() => remove(todo.id)} aria-label="Delete task" style={{ background: "transparent", border: "none", color: t.textDim, cursor: "pointer", fontSize: 20, padding: 0, lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
