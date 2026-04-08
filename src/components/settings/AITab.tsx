import { useState } from "react";
import { callAI } from "../../lib/ai";
import { authFetch } from "../../lib/authFetch";
import { getModelForTask, setModelForTask } from "../../lib/aiSettings";
import { MODELS } from "../../config/models";

const ALL_MODELS = [...MODELS.ANTHROPIC, ...MODELS.OPENAI, ...MODELS.OPENROUTER];

export default function AITab() {
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [taskModels, setTaskModels] = useState<Record<string, string | null>>(() => {
    const tasks = ["capture", "questions", "refine", "chat", "vision"];
    const result: Record<string, string | null> = {};
    for (const t of tasks) result[t] = getModelForTask(t);
    return result;
  });

  const testAI = async () => {
    setTestStatus("testing-ai");
    try {
      const res = await callAI({ max_tokens: 10, messages: [{ role: "user", content: "Say ok" }] });
      setTestStatus(res.ok ? "ai-success" : "ai-fail");
    } catch {
      setTestStatus("ai-fail");
    }
    setTimeout(() => setTestStatus(null), 3000);
  };

  const testDB = async () => {
    setTestStatus("testing");
    try {
      const res = await authFetch("/api/health");
      setTestStatus(res.ok ? "success" : "fail");
    } catch {
      setTestStatus("fail");
    }
    setTimeout(() => setTestStatus(null), 3000);
  };

  return (
    <>
      <div className="rounded-2xl border p-4 space-y-3" style={{ background: "var(--color-surface-container-high)", borderColor: "var(--color-outline-variant)" }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-on-surface">AI Status</p>
          </div>
          <button
            onClick={testAI}
            className="rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors hover:bg-white/5"
            style={{ color: "var(--color-on-surface-variant)", borderColor: "var(--color-outline-variant)" }}
          >
            {testStatus === "testing-ai" ? "Testing…" : testStatus === "ai-success" ? "✓ Connected" : testStatus === "ai-fail" ? "✗ Failed" : "Test"}
          </button>
        </div>
        <div className="border-t" style={{ borderColor: "var(--color-outline-variant)" }} />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-on-surface">Database</p>
            <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>Supabase</p>
          </div>
          <button
            onClick={testDB}
            className="rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors hover:bg-white/5"
            style={{ color: "var(--color-on-surface-variant)", borderColor: "var(--color-outline-variant)" }}
          >
            {testStatus === "testing" ? "Testing…" : testStatus === "success" ? "✓ Connected" : testStatus === "fail" ? "✗ Failed" : "Test"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border p-4 space-y-3" style={{ background: "var(--color-surface-container-high)", borderColor: "var(--color-outline-variant)" }}>
        <p className="text-sm font-semibold text-on-surface">Per-task model overrides</p>
        <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>Override which model handles each task. Leave as default to use your global provider setting.</p>
        {([
          ["Entry capture", "capture"],
          ["Fill Brain questions", "questions"],
          ["Refine collection", "refine"],
          ["Brain chat", "chat"],
          ["Image reading", "vision"],
        ] as [string, string][]).map(([label, task]) => (
          <div key={task} className="flex items-center gap-2">
            <span className="text-xs w-40 shrink-0" style={{ color: "var(--color-on-surface-variant)" }}>{label}</span>
            <select
              value={taskModels[task] ?? "default"}
              onChange={e => {
                const v = e.target.value;
                const model = v === "default" ? null : v;
                setModelForTask(task, model);
                setTaskModels(prev => ({ ...prev, [task]: model }));
              }}
              className="flex-1 rounded-lg px-2 text-xs"
              style={{ background: "var(--color-surface-container)", color: "var(--color-on-surface)", border: "1px solid var(--color-outline-variant)", height: 44 }}
            >
              <option value="default">Same as global default</option>
              {ALL_MODELS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </>
  );
}
