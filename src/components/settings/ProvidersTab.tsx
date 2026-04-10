import { useState } from "react";
import { authFetch } from "../../lib/authFetch";
import { callAI } from "../../lib/ai";
import { PROMPTS } from "../../config/prompts";
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

// ── Parse test cases ──────────────────────────────────────────────────────────
// Test 1: single entry — should produce title, specific type, date metadata, phone, tags
const PARSE_TEST_1 =
  "Renew vehicle licence disc for the Toyota Hilux (CA 123-456) — expires 31 July 2026. " +
  "Contact the licensing department at 051-405-4850. " +
  "Must bring the roadworthy certificate and proof of insurance.";

// Test 2: two clearly distinct records — should SPLIT into supplier + reminder
const PARSE_TEST_2 =
  "New supplier: Cape Fresh Produce. Contact Sarah van der Berg on 083-222-5555. " +
  "Delivers Mondays and Thursdays, minimum order R800. " +
  "Payment terms: 30 days. " +
  "Also: staff training day scheduled for 3 June 2026, 08:00–17:00 at Protea Hotel Bloemfontein. " +
  "All kitchen staff must attend — confirm attendance by 27 May.";

interface ParseResult {
  ok: boolean;
  rawText: string;
  parsed: unknown;
  error?: string;
}

function extractJSON(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const m = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  return JSON.parse(m ? m[1] : cleaned);
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

export default function ProvidersTab(props?: { activeBrain?: any }) {
  const [gemini, setGemini] = useState<Status>("idle");
  const [geminiModel, setGeminiModel] = useState("");
  const [groq, setGroq] = useState<Status>("idle");
  const [db, setDb] = useState<Status>("idle");
  const [testing, setTesting] = useState(false);
  const [reembedding, setReembedding] = useState(false);
  const [reembedProgress, setReembedProgress] = useState<{ processed: number; failed: number; remaining: number } | null>(null);

  const [llmTesting, setLlmTesting] = useState(false);
  const [llmResult, setLlmResult] = useState<{ ok: boolean; text: string } | null>(null);

  const [parseLoading, setParseLoading] = useState<1 | 2 | null>(null);
  const [parseResult1, setParseResult1] = useState<ParseResult | null>(null);
  const [parseResult2, setParseResult2] = useState<ParseResult | null>(null);

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

  async function testLLM() {
    setLlmTesting(true);
    setLlmResult(null);
    try {
      const res = await authFetch("/api/openrouter", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-api-key": "" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Reply with exactly: WORKING" }],
          max_tokens: 10,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const text = data.content?.[0]?.text || data.choices?.[0]?.message?.content || "(empty)";
        const model = data.model || "unknown";
        setLlmResult({ ok: true, text: `✓ Model: ${model}\nResponse: "${text}"` });
      } else {
        const err = data?.error?.message || data?.error || JSON.stringify(data);
        setLlmResult({ ok: false, text: `HTTP ${res.status}: ${err}` });
      }
    } catch (e: any) {
      setLlmResult({ ok: false, text: `Network error: ${e?.message}` });
    }
    setLlmTesting(false);
  }

  async function runParseTest(num: 1 | 2) {
    const text = num === 1 ? PARSE_TEST_1 : PARSE_TEST_2;
    const setter = num === 1 ? setParseResult1 : setParseResult2;
    setParseLoading(num);
    setter(null);
    try {
      const res = await callAI({
        system: PROMPTS.CAPTURE,
        max_tokens: 2000,
        messages: [{ role: "user", content: text }],
      });
      const data = await res.json();
      if (!res.ok) {
        const err = data?.error?.message || data?.error || JSON.stringify(data);
        setter({ ok: false, rawText: JSON.stringify(data), parsed: null, error: `HTTP ${res.status}: ${err}` });
        return;
      }
      const rawText: string = data.content?.[0]?.text || data.choices?.[0]?.message?.content || "(empty)";
      try {
        const parsed = extractJSON(rawText);
        setter({ ok: true, rawText, parsed });
      } catch (e: any) {
        setter({ ok: false, rawText, parsed: null, error: `JSON parse failed: ${e?.message}` });
      }
    } catch (e: any) {
      setter({ ok: false, rawText: "", parsed: null, error: `Network: ${e?.message}` });
    } finally {
      setParseLoading(null);
    }
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

  async function reembedAll() {
    const brainId = (props?.activeBrain as any)?.id;
    if (!brainId || reembedding) return;
    setReembedding(true);
    setReembedProgress({ processed: 0, failed: 0, remaining: 1 });
    let totalProcessed = 0;
    let totalFailed = 0;
    let remaining = 1;
    while (remaining > 0) {
      try {
        const res = await authFetch("/api/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Embed-Provider": "google", "X-Embed-Key": "" },
          body: JSON.stringify({ brain_id: brainId, batch: true, force: true }),
        });
        const data = await res.json();
        if (!res.ok) { console.error("[re-embed]", data); break; }
        totalProcessed += data.processed ?? 0;
        totalFailed += data.failed ?? 0;
        remaining = data.remaining ?? 0;
        setReembedProgress({ processed: totalProcessed, failed: totalFailed, remaining });
        if ((data.processed ?? 0) === 0) break;
      } catch (err) { console.error("[re-embed]", err); break; }
    }
    setReembedding(false);
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

      {/* Direct LLM pipeline test */}
      <div
        className="rounded-xl p-4 space-y-3"
        style={{ background: "var(--color-surface-container)", border: "1px solid var(--color-outline-variant)" }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-on-surface)" }}>Live AI test</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>
            Tests the exact path the AI features use (no key required).
          </p>
        </div>
        <button
          onClick={testLLM}
          disabled={llmTesting}
          className="w-full rounded-xl py-2 text-xs font-semibold transition-all disabled:opacity-50"
          style={{ background: "var(--color-secondary-container)", color: "var(--color-on-secondary-container)" }}
        >
          {llmTesting ? "Calling model…" : "Test AI pipeline"}
        </button>
        {llmResult && (
          <p className="text-xs font-mono break-all whitespace-pre-wrap" style={{ color: llmResult.ok ? "var(--color-primary)" : "var(--color-error)" }}>
            {llmResult.text}
          </p>
        )}
      </div>

      {/* ── Parse pipeline tests ─────────────────────────────────────────── */}
      <div
        className="rounded-xl p-4 space-y-4"
        style={{ background: "var(--color-surface-container)", border: "1px solid var(--color-outline-variant)" }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-on-surface)" }}>Parse pipeline tests</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>
            Runs the full CAPTURE prompt through Gemma and shows raw + parsed output.
          </p>
        </div>

        {/* Test 1 */}
        <ParseTestBlock
          num={1}
          label="Test 1 — single entry (vehicle licence, should get title + type + expiry date + phone)"
          input={PARSE_TEST_1}
          loading={parseLoading === 1}
          result={parseResult1}
          onRun={() => runParseTest(1)}
        />

        {/* Test 2 */}
        <ParseTestBlock
          num={2}
          label="Test 2 — should SPLIT into 2 entries (supplier + reminder)"
          input={PARSE_TEST_2}
          loading={parseLoading === 2}
          result={parseResult2}
          onRun={() => runParseTest(2)}
        />
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

      {/* Re-embed all entries */}
      <div
        className="rounded-xl p-4 space-y-3"
        style={{ background: "var(--color-surface-container)", border: "1px solid var(--color-outline-variant)" }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-on-surface)" }}>Re-embed all entries</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>
            Force re-generate all embeddings with the current model (gemini-embedding-001). Use after switching embedding models.
          </p>
        </div>
        <button
          onClick={reembedAll}
          disabled={reembedding || !props?.activeBrain}
          className="w-full rounded-xl py-2 text-xs font-semibold transition-all disabled:opacity-50"
          style={{ background: "var(--color-secondary-container)", color: "var(--color-on-secondary-container)" }}
        >
          {reembedding ? "Re-embedding…" : "Re-embed all entries"}
        </button>
        {reembedProgress !== null && (
          <p className="text-xs text-center" style={{ color: "var(--color-on-surface-variant)" }}>
            {reembedding
              ? `Processing… ${reembedProgress.processed} done${reembedProgress.failed > 0 ? `, ${reembedProgress.failed} failed` : ""}${reembedProgress.remaining > 0 ? `, ${reembedProgress.remaining} remaining` : ""}`
              : `Done — ${reembedProgress.processed} embedded${reembedProgress.failed > 0 ? `, ${reembedProgress.failed} failed` : ""}`}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Sub-component ─────────────────────────────────────────────────────────────

interface ParseTestBlockProps {
  num: number;
  label: string;
  input: string;
  loading: boolean;
  result: ParseResult | null;
  onRun: () => void;
}

function ParseTestBlock({ num, label, input, loading, result, onRun }: ParseTestBlockProps) {
  const [showInput, setShowInput] = useState(false);

  const isArray = result?.ok && Array.isArray(result.parsed);
  const count = isArray ? (result!.parsed as unknown[]).length : null;

  return (
    <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--color-outline-variant)" }}>
      <p className="text-[11px] font-semibold leading-snug" style={{ color: "var(--color-on-surface-variant)" }}>
        {label}
      </p>

      <button
        onClick={() => setShowInput((p) => !p)}
        className="text-[10px] underline"
        style={{ color: "var(--color-on-surface-variant)" }}
      >
        {showInput ? "hide input" : "show input text"}
      </button>

      {showInput && (
        <p className="text-[10px] font-mono break-all rounded-lg p-2" style={{ background: "var(--color-surface-container-high)", color: "var(--color-on-surface-variant)" }}>
          {input}
        </p>
      )}

      <button
        onClick={onRun}
        disabled={loading}
        className="w-full rounded-xl py-2 text-xs font-semibold transition-all disabled:opacity-50"
        style={{ background: "var(--color-primary-container)", color: "var(--color-primary)" }}
      >
        {loading ? `Running test ${num}…` : `Run test ${num}`}
      </button>

      {result && (
        <div className="space-y-2">
          {/* Status line */}
          <p className="text-[11px] font-semibold" style={{ color: result.ok ? "var(--color-primary)" : "var(--color-error)" }}>
            {result.ok
              ? isArray
                ? `✓ Array with ${count} entr${count === 1 ? "y" : "ies"}`
                : "✓ Single object"
              : `✗ ${result.error}`}
          </p>

          {/* Parsed output — one card per entry if array */}
          {result.ok && isArray && (result.parsed as any[]).map((entry: any, i: number) => (
            <EntryCard key={i} index={i + 1} entry={entry} />
          ))}
          {result.ok && !isArray && result.parsed && (
            <EntryCard index={0} entry={result.parsed as any} />
          )}

          {/* Raw AI text (collapsed) */}
          <details>
            <summary className="text-[10px] cursor-pointer" style={{ color: "var(--color-on-surface-variant)" }}>
              Raw AI response
            </summary>
            <p className="text-[10px] font-mono break-all whitespace-pre-wrap mt-1 rounded-lg p-2" style={{ background: "var(--color-surface-container-high)", color: "var(--color-on-surface-variant)" }}>
              {result.rawText || "(empty)"}
            </p>
          </details>
        </div>
      )}
    </div>
  );
}

function EntryCard({ index, entry }: { index: number; entry: Record<string, any> }) {
  const fields = [
    { key: "title", label: "Title", important: true },
    { key: "type", label: "Type", important: true },
    { key: "tags", label: "Tags" },
    { key: "content", label: "Content" },
    { key: "workspace", label: "Workspace" },
  ];
  const meta = entry.metadata && typeof entry.metadata === "object" ? Object.entries(entry.metadata) : [];

  return (
    <div
      className="rounded-xl p-3 space-y-1.5"
      style={{ background: "var(--color-surface-container-high)", border: "1px solid var(--color-outline-variant)" }}
    >
      {index > 0 && (
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-on-surface-variant)" }}>
          Entry {index}
        </p>
      )}
      {fields.map(({ key, label, important }) => {
        const val = entry[key];
        if (val === undefined || val === null || (Array.isArray(val) && val.length === 0)) return null;
        const display = Array.isArray(val) ? val.join(", ") : String(val);
        return (
          <div key={key} className="flex gap-1.5">
            <span className="text-[10px] font-semibold shrink-0 w-16" style={{ color: "var(--color-on-surface-variant)" }}>{label}</span>
            <span
              className="text-[11px] break-all"
              style={{ color: important ? "var(--color-on-surface)" : "var(--color-on-surface-variant)", fontWeight: important ? 600 : 400 }}
            >
              {display.slice(0, 120)}{display.length > 120 ? "…" : ""}
            </span>
          </div>
        );
      })}
      {meta.length > 0 && (
        <div className="flex gap-1.5">
          <span className="text-[10px] font-semibold shrink-0 w-16" style={{ color: "var(--color-on-surface-variant)" }}>Meta</span>
          <span className="text-[10px] font-mono break-all" style={{ color: "var(--color-on-surface-variant)" }}>
            {meta.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(" · ")}
          </span>
        </div>
      )}
    </div>
  );
}
