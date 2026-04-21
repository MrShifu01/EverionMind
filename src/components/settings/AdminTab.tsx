import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { authFetch } from "../../lib/authFetch";
import SettingsRow, { SettingsButton } from "./SettingsRow";

type TestStatus = "idle" | "running" | "pass" | "fail";

interface TestResult {
  status: TestStatus;
  latencyMs?: number;
  detail?: string;
}

function ResultBlock({ result }: { result: TestResult }) {
  if (result.status === "idle") return null;
  if (result.status === "running") {
    return (
      <div style={{ marginTop: 10, fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--ink-faint)" }}>
        running…
      </div>
    );
  }
  const pass = result.status === "pass";
  return (
    <div
      style={{
        marginTop: 10,
        padding: 12,
        borderRadius: 8,
        background: pass ? "var(--surface-low)" : "var(--blood-wash)",
        border: `1px solid ${pass ? "var(--line-soft)" : "var(--blood)"}`,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: result.detail ? 6 : 0 }}>
        <span
          style={{
            fontFamily: "var(--f-mono)",
            fontSize: 12,
            fontWeight: 700,
            color: pass ? "var(--ember)" : "var(--blood)",
          }}
        >
          {pass ? "✓ PASS" : "✗ FAIL"}
        </span>
        {result.latencyMs != null && (
          <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-faint)" }}>
            {result.latencyMs}ms
          </span>
        )}
      </div>
      {result.detail && (
        <pre
          style={{
            margin: 0,
            fontFamily: "var(--f-mono)",
            fontSize: 11,
            color: "var(--ink-soft)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            maxHeight: 400,
            overflowY: "auto",
          }}
        >
          {result.detail}
        </pre>
      )}
    </div>
  );
}

const SPLIT_TEST_INPUT = `John Smith 082 111 1111
Jane Doe 083 222 2222
Bob Jones 084 333 3333
Alice Green 085 444 4444
Charlie Brown 086 555 5555
Diana Prince 087 666 6666
Evan Rogers 088 777 7777
Fiona Apple 089 888 8888
George King 061 999 9999
Helen Troy 062 000 0000`;

const CAPTURE_SYSTEM = `You classify and structure a raw text capture into one or more OpenBrain entries. Return ONLY valid JSON.
SPLIT RULES: If the input contains 2 or more clearly distinct real-world entities (e.g. a person + their company, multiple ingredients, a vehicle + its insurance, a recipe + a supplier), return a JSON ARRAY of entries. A name alias for the same entity is NOT a split. Otherwise return a single JSON OBJECT.
Single: {"title":"...","content":"...","type":"...","icon":"SINGLE_EMOJI","metadata":{},"tags":[],"workspace":"business"|"personal"|"both","confidence":{"type":"extracted"|"inferred"|"ambiguous","tags":"...","title":"...","content":"..."}}
Multiple: [{"title":"...","content":"...","type":"...","icon":"SINGLE_EMOJI","metadata":{},"tags":[],"workspace":"...","confidence":{...}}, ...]
CRITICAL: Any phone number found ANYWHERE in the input MUST go into metadata.phone.`;

export default function AdminTab() {
  const [authResult, setAuthResult] = useState<TestResult>({ status: "idle" });
  const [llmResult, setLlmResult] = useState<TestResult>({ status: "idle" });
  const [captureResult, setCaptureResult] = useState<TestResult>({ status: "idle" });
  const [splitResult, setSplitResult] = useState<TestResult>({ status: "idle" });
  const [running, setRunning] = useState(false);

  async function testAuth(): Promise<boolean> {
    setAuthResult({ status: "running" });
    const t0 = Date.now();
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      const ms = Date.now() - t0;
      if (error) {
        setAuthResult({ status: "fail", latencyMs: ms, detail: `Auth error: ${error.message}` });
        return false;
      }
      if (!session) {
        setAuthResult({ status: "fail", latencyMs: ms, detail: "No session — user is not authenticated." });
        return false;
      }
      const now = Math.floor(Date.now() / 1000);
      const expired = session.expires_at != null && session.expires_at < now;
      const expiresAt = session.expires_at
        ? new Date(session.expires_at * 1000).toISOString()
        : "unknown";
      setAuthResult({
        status: expired ? "fail" : "pass",
        latencyMs: ms,
        detail: [
          `User:     ${session.user.email}`,
          `ID:       ${session.user.id}`,
          `Expires:  ${expiresAt}`,
          `State:    ${expired ? "⚠ TOKEN EXPIRED" : "valid"}`,
          `Provider: ${session.user.app_metadata?.provider ?? "email"}`,
        ].join("\n"),
      });
      return !expired;
    } catch (e: any) {
      setAuthResult({ status: "fail", latencyMs: Date.now() - t0, detail: String(e?.message ?? e) });
      return false;
    }
  }

  async function testLLM(): Promise<boolean> {
    setLlmResult({ status: "running" });
    const t0 = Date.now();
    try {
      const res = await authFetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemini-2.5-flash-lite",
          messages: [{ role: "user", content: 'Reply with exactly the word: OK' }],
          system: 'Reply with exactly the word: OK',
          max_tokens: 10,
        }),
      });
      const ms = Date.now() - t0;
      const text = await res.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { /* raw text */ }

      if (!res.ok) {
        setLlmResult({
          status: "fail",
          latencyMs: ms,
          detail: `HTTP ${res.status}\n\n${text}`,
        });
        return false;
      }

      const aiText =
        parsed?.content?.[0]?.text ??
        parsed?.choices?.[0]?.message?.content ??
        "(no text field)";
      setLlmResult({
        status: "pass",
        latencyMs: ms,
        detail: `HTTP ${res.status}\n\nAI replied: "${aiText}"\n\nFull response:\n${JSON.stringify(parsed, null, 2)}`,
      });
      return true;
    } catch (e: any) {
      setLlmResult({ status: "fail", latencyMs: Date.now() - t0, detail: String(e?.message ?? e) });
      return false;
    }
  }

  async function testCapture(): Promise<boolean> {
    setCaptureResult({ status: "running" });
    const t0 = Date.now();
    try {
      const res = await authFetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p_title: "[ADMIN TEST] Ping",
          p_content: "Test entry created by admin debug panel — safe to delete.",
          p_type: "note",
          p_metadata: { _admin_test: true },
          p_tags: ["_test"],
        }),
      });
      const ms = Date.now() - t0;
      const text = await res.text();
      if (!res.ok) {
        setCaptureResult({ status: "fail", latencyMs: ms, detail: `HTTP ${res.status}\n\n${text}` });
        return false;
      }
      setCaptureResult({
        status: "pass",
        latencyMs: ms,
        detail: `HTTP ${res.status}\n\nResponse:\n${text}`,
      });
      return true;
    } catch (e: any) {
      setCaptureResult({ status: "fail", latencyMs: Date.now() - t0, detail: String(e?.message ?? e) });
      return false;
    }
  }

  async function testSplitEntry(): Promise<boolean> {
    setSplitResult({ status: "running" });
    const t0 = Date.now();
    try {
      const res = await authFetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemini-2.5-flash-lite",
          system: CAPTURE_SYSTEM,
          messages: [{ role: "user", content: SPLIT_TEST_INPUT }],
          max_tokens: 2000,
        }),
      });
      const ms = Date.now() - t0;
      const text = await res.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { /* raw text */ }

      if (!res.ok) {
        setSplitResult({
          status: "fail",
          latencyMs: ms,
          detail: `HTTP ${res.status}\n\n${text}`,
        });
        return false;
      }

      const aiText =
        parsed?.content?.[0]?.text ??
        parsed?.choices?.[0]?.message?.content ??
        "";

      // Attempt to parse the AI JSON response (same logic as useCaptureSheetParse)
      let entries: any[] = [];
      let parseError = "";
      try {
        const stripped = aiText.replace(/```json|```/g, "").trim();
        const jsonMatch = stripped.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        const jsonResult = JSON.parse(jsonMatch ? jsonMatch[1] : stripped);
        entries = Array.isArray(jsonResult) ? jsonResult : [jsonResult];
      } catch (e: any) {
        parseError = `JSON parse failed: ${e?.message ?? e}`;
      }

      const tokensUsed = parsed?.usage?.total_tokens ?? "unknown";

      if (parseError) {
        setSplitResult({
          status: "fail",
          latencyMs: ms,
          detail: [
            `HTTP ${res.status} — tokens used: ${tokensUsed}`,
            "",
            parseError,
            "",
            `Raw AI output (${aiText.length} chars):`,
            aiText,
          ].join("\n"),
        });
        return false;
      }

      const titlesWithPhones = entries.map(
        (e: any) => `• ${e.title ?? "(no title)"} — phone: ${e.metadata?.phone ?? "(missing)"}`
      );

      setSplitResult({
        status: "pass",
        latencyMs: ms,
        detail: [
          `HTTP ${res.status} — ${entries.length} entries parsed — tokens: ${tokensUsed}`,
          "",
          "Entries:",
          ...titlesWithPhones,
          "",
          `Raw AI output (${aiText.length} chars):`,
          aiText.slice(0, 600) + (aiText.length > 600 ? "\n…[truncated]" : ""),
        ].join("\n"),
      });
      return true;
    } catch (e: any) {
      setSplitResult({ status: "fail", latencyMs: Date.now() - t0, detail: String(e?.message ?? e) });
      return false;
    }
  }

  async function runAll() {
    setRunning(true);
    await testAuth();
    await testLLM();
    await testCapture();
    await testSplitEntry();
    setRunning(false);
  }

  const sections: { label: string; hint: string; btn: string; result: TestResult; run: () => void }[] = [
    {
      label: "Auth token",
      hint: "verifies the session JWT is present and not expired.",
      btn: "Test auth",
      result: authResult,
      run: () => testAuth(),
    },
    {
      label: "LLM call",
      hint: "POST /api/llm — pings Gemini with a 1-token reply.",
      btn: "Test LLM",
      result: llmResult,
      run: () => testLLM(),
    },
    {
      label: "Capture API",
      hint: "POST /api/capture — creates a test entry (safe to delete).",
      btn: "Test capture",
      result: captureResult,
      run: () => testCapture(),
    },
    {
      label: "Split entry — 10 phones",
      hint: "sends 10 contacts to /api/llm with the real CAPTURE prompt and max_tokens 2000, then parses the JSON.",
      btn: "Test split",
      result: splitResult,
      run: () => testSplitEntry(),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
        <button
          onClick={runAll}
          disabled={running}
          className="press f-sans"
          style={{
            height: 36,
            padding: "0 20px",
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 8,
            background: running ? "var(--surface-high)" : "var(--ember)",
            color: running ? "var(--ink-faint)" : "var(--ember-ink)",
            border: "none",
            cursor: running ? "not-allowed" : "pointer",
            opacity: running ? 0.6 : 1,
            transition: "background 180ms",
          }}
        >
          {running ? "Running…" : "Run all tests"}
        </button>
      </div>

      {sections.map(({ label, hint, btn, result, run }, i) => (
        <div
          key={label}
          style={{
            borderBottom: i < sections.length - 1 ? "1px solid var(--line-soft)" : "none",
            paddingBottom: 20,
            marginBottom: i < sections.length - 1 ? 4 : 0,
          }}
        >
          <SettingsRow label={label} hint={hint} last>
            <SettingsButton onClick={run} disabled={result.status === "running"}>
              {result.status === "running" ? "Testing…" : btn}
            </SettingsButton>
          </SettingsRow>
          <ResultBlock result={result} />
        </div>
      ))}
    </div>
  );
}
