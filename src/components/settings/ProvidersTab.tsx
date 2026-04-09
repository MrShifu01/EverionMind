import { useState } from "react";
import { authFetch } from "../../lib/authFetch";
import {
  clearAISettingsCache,
  persistKeyToDb,
  getUserApiKey,
  getOpenRouterKey,
  getGroqKey,
  getGeminiKey,
  getEmbedOpenAIKey,
} from "../../lib/aiSettings";

type Status = "idle" | "loading" | "ok" | "fail";

interface HealthResult {
  db: boolean;
  gemini: boolean;
  geminiModel?: string;
  geminiError?: string;
  groq: boolean;
}

const dot = (s: Status) => {
  if (s === "ok") return <span style={{ color: "var(--color-success, #4ade80)" }}>●</span>;
  if (s === "fail") return <span style={{ color: "var(--color-error)" }}>●</span>;
  if (s === "loading") return <span style={{ color: "var(--color-on-surface-variant)", opacity: 0.5 }}>◌</span>;
  return <span style={{ color: "var(--color-outline-variant)" }}>○</span>;
};

const label = (s: Status) => {
  if (s === "ok") return "Connected";
  if (s === "fail") return "Failed";
  if (s === "loading") return "Testing…";
  return "Not tested";
};

export default function ProvidersTab(_props?: { activeBrain?: unknown }) {
  const [gemini, setGemini] = useState<Status>("idle");
  const [geminiModel, setGeminiModel] = useState("");
  const [groq, setGroq] = useState<Status>("idle");
  const [db, setDb] = useState<Status>("idle");
  const [testing, setTesting] = useState(false);

  async function runTests() {
    setTesting(true);
    setGemini("loading");
    setGroq("loading");
    setDb("loading");
    try {
      const res = await authFetch("/api/health");
      if (res.ok) {
        const data: HealthResult = await res.json();
        setGemini(data.gemini ? "ok" : "fail");
        setGeminiModel(data.gemini ? (data.geminiModel || "") : (data.geminiError || data.geminiModel || ""));
        setGroq(data.groq ? "ok" : "fail");
        setDb(data.db ? "ok" : "fail");
      } else {
        setGemini("fail"); setGroq("fail"); setDb("fail");
      }
    } catch {
      setGemini("fail"); setGroq("fail"); setDb("fail");
    }
    setTesting(false);
  }

  const cards: { title: string; desc: string; status: Status }[] = [
    { title: "Gemini AI", desc: geminiModel || "gemma-4-31b-it · text-embedding-004", status: gemini },
    { title: "Groq Voice", desc: "whisper-large-v3-turbo", status: groq },
    { title: "Database",   desc: "Supabase", status: db },
  ];

  const hasStoredKeys = !!(getUserApiKey() || getOpenRouterKey() || getGroqKey() || getGeminiKey() || getEmbedOpenAIKey());
  const [clearing, setClearing] = useState(false);
  const [clearMsg, setClearMsg] = useState<string | null>(null);

  async function clearAllKeys() {
    setClearing(true);
    setClearMsg(null);
    const { error } = await persistKeyToDb({
      api_key: null, openrouter_key: null, groq_key: null,
      embed_openai_key: null, gemini_key: null,
    });
    clearAISettingsCache();
    setClearMsg(error ? `Error: ${error}` : "All frontend API keys removed.");
    setClearing(false);
  }

  return (
    <div className="space-y-4 px-1">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: "var(--color-on-surface)" }}>
          System Status
        </h3>
        <button
          onClick={runTests}
          disabled={testing}
          className="rounded-xl px-4 py-2 text-xs font-semibold transition-all disabled:opacity-50"
          style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
        >
          {testing ? "Testing…" : "Test all"}
        </button>
      </div>

      <div className="space-y-2">
        {cards.map(({ title, desc, status }) => (
          <div
            key={title}
            className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{
              background: "var(--color-surface-container)",
              border: "1px solid var(--color-outline-variant)",
            }}
          >
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--color-on-surface)" }}>{title}</p>
              <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>{desc}</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--color-on-surface-variant)" }}>
              {dot(status)}
              <span>{label(status)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Clear stored frontend keys */}
      <div
        className="rounded-xl p-4 space-y-3"
        style={{ background: "var(--color-surface-container)", border: "1px solid var(--color-outline-variant)" }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-on-surface)" }}>Frontend API keys</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>
            {hasStoredKeys ? "Keys stored from previous configuration — no longer needed." : "No frontend keys stored."}
          </p>
        </div>
        {hasStoredKeys && (
          <button
            onClick={clearAllKeys}
            disabled={clearing}
            className="w-full rounded-xl py-2 text-xs font-semibold transition-all disabled:opacity-50"
            style={{ background: "var(--color-error-container)", color: "var(--color-on-error-container)" }}
          >
            {clearing ? "Clearing…" : "Remove all stored keys"}
          </button>
        )}
        {clearMsg && (
          <p className="text-xs text-center" style={{ color: clearMsg.startsWith("Error") ? "var(--color-error)" : "var(--color-primary)" }}>
            {clearMsg}
          </p>
        )}
      </div>
    </div>
  );
}
