import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { authFetch } from "../../lib/authFetch";
import SettingsRow, { SettingsButton } from "./SettingsRow";
import { FEATURE_FLAGS, getAdminFlags, setAdminFlag } from "../../lib/featureFlags";
import {
  ADMIN_PREF_DEFS,
  getAdminPrefs,
  setAdminPref,
  type AdminPrefs,
} from "../../lib/adminPrefs";
import GmailScanReviewModal, { type ScanResultItem } from "./GmailScanReviewModal";

const MOCK_REVIEW_ITEMS: ScanResultItem[] = [
  {
    entryId: "mock-1",
    groupIds: ["mock-1"],
    groupCount: 1,
    threadMessageCount: 3,
    title: "March 2026 Statement from Delta Distributors – Amount Due: R1,027.83",
    summary: "Your March statement from Delta Distributors (Account #8932) shows a current balance of R1,027.83 due. Transactions from 01/03/2026 to 26/03/2026. Please remit to Nedbank Account 1102416576 or contact sally@deltabs.co.za.",
    from: "Delta Distributors <debtors@deltabs.co.za>",
    subject: "Your statement from Delta Distributors – March 2026",
    emailType: "invoices",
    urgency: "high",
    amount: "R1,027.83",
    dueDate: "2026-04-30",
    relevanceScore: 0.91,
  },
  {
    entryId: "mock-2",
    groupIds: ["mock-2"],
    groupCount: 1,
    threadMessageCount: 1,
    title: "Delivery Confirmation – Chicken Portion Order #44821",
    summary: "Your chicken portion order #44821 from Farmers Fresh is confirmed for delivery on 25 Apr 2026 between 08:00–12:00. Total: R3,450.00. Contact driver on 082 555 1234 for rescheduling.",
    from: "Farmers Fresh <orders@farmersfresh.co.za>",
    subject: "Delivery Confirmation – Order #44821",
    emailType: "delivery",
    urgency: "medium",
    amount: "R3,450.00",
    dueDate: "2026-04-25",
    relevanceScore: 0.78,
  },
  {
    entryId: "mock-3",
    groupIds: ["mock-3", "mock-3b"],
    groupCount: 2,
    threadMessageCount: 1,
    title: "Subscription Renewal – Yoco POS System – R299/month",
    summary: "Your Yoco subscription renews on 1 May 2026 at R299/month. No action needed unless you'd like to change your plan. Card on file: Visa ending 4242.",
    from: "Yoco <billing@yoco.com>",
    subject: "Your Yoco subscription renews soon",
    emailType: "subscription-renewal",
    urgency: "low",
    amount: "R299.00",
    dueDate: "2026-05-01",
    relevanceScore: 0.62,
  },
  {
    entryId: "mock-4",
    groupIds: ["mock-4"],
    groupCount: 1,
    threadMessageCount: 2,
    title: "Action Required – Sign Employment Contract for Sipho Dlamini",
    summary: "Please sign the employment contract for Sipho Dlamini (Kitchen Assistant) by 28 April 2026. DocuSign link expires in 5 days. Contact HR at hr@smashsocialclub.co.za with questions.",
    from: "DocuSign <dse_NA4@docusign.net>",
    subject: "Action Required: Sign Employment Contract",
    emailType: "signing-requests",
    urgency: "high",
    amount: null,
    dueDate: "2026-04-28",
    relevanceScore: 0.88,
  },
  {
    entryId: "mock-5",
    groupIds: ["mock-5"],
    groupCount: 1,
    threadMessageCount: 1,
    title: "Health Inspection Appointment – 3 May 2026, 10:00",
    summary: "City Health has scheduled a routine inspection of Smash Social Club for 3 May 2026 at 10:00. Ensure all food handling certificates are on display and cold storage logs are available.",
    from: "City of Cape Town Health <health@capetown.gov.za>",
    subject: "Scheduled Health Inspection – Smash Social Club",
    emailType: "appointment",
    urgency: "medium",
    amount: null,
    dueDate: "2026-05-03",
    relevanceScore: 0.85,
  },
];

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
      <div
        style={{
          marginTop: 10,
          fontFamily: "var(--f-mono)",
          fontSize: 12,
          color: "var(--ink-faint)",
        }}
      >
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
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: result.detail ? 6 : 0,
        }}
      >
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

const SPLIT_TEST_INPUT = `{"contacts":[{"id":"armand_loots","type":"person","category":"plumbing","name":"Armand Loots","phone":"+27836887174"},{"id":"dave_schoeman","type":"person","category":"irrigation","name":"Dave Schoeman","phone":"+27829643397"},{"id":"evert_venter","type":"person","category":"electrician","name":"Evert Venter","phone":"+27828027452","notes":"COC completed"},{"id":"conrad_van_rensburg","type":"person","category":"security","name":"Conrad van Rensburg","phone":"+27824636417","services":["alarm","cameras","beams"]},{"id":"tracking_alarm_services","type":"company","category":"security","name":"Tracking Alarm Services","phone":"+27824636417"},{"id":"hein_oasis_pools","type":"person","category":"pool_maintenance","name":"Hein (Oasis Pools)","phone":"+27843532439"},{"id":"euan_vosloo","type":"person","category":"pool_construction","name":"Euan Vosloo","phone":"+27825565474"},{"id":"lapas_garnett","type":"person","category":"lawn_service","name":"Lapas Garnett","phone":"+27824518077"},{"id":"thys_buhrmann","type":"person","category":"general_maintenance","name":"Thys Buhrmann","phone":"+27827722083"},{"id":"kobus_visser","type":"person","category":"garage","name":"Kobus Visser","phone":"+27827006827"}]}`;

const CAPTURE_SYSTEM = `You classify and structure a raw text capture into one or more OpenBrain entries. Return ONLY valid JSON.
SPLIT RULES: If the input contains 2 or more clearly distinct real-world entities (e.g. a person + their company, multiple ingredients, a vehicle + its insurance, a recipe + a supplier), return a JSON ARRAY of entries. A name alias for the same entity is NOT a split. Otherwise return a single JSON OBJECT.
Single: {"title":"...","content":"...","type":"...","icon":"SINGLE_EMOJI","metadata":{},"tags":[],"workspace":"business"|"personal"|"both","confidence":{"type":"extracted"|"inferred"|"ambiguous","tags":"...","title":"...","content":"..."}}
Multiple: [{"title":"...","content":"...","type":"...","icon":"SINGLE_EMOJI","metadata":{},"tags":[],"workspace":"...","confidence":{...}}, ...]
CRITICAL: Any phone number found ANYWHERE in the input MUST go into metadata.phone.`;

const TIER_OPTIONS = ["free", "starter", "pro", "max"] as const;
type TierOption = typeof TIER_OPTIONS[number];

function TierChanger() {
  const [current, setCurrent] = useState<TierOption>("free");
  const [selected, setSelected] = useState<TierOption>("free");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("user_profiles")
        .select("tier")
        .eq("id", user.id)
        .single();
      const t = (data?.tier ?? "free") as TierOption;
      setCurrent(t);
      setSelected(t);
    });
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error } = await supabase
      .from("user_profiles")
      .update({ tier: selected })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      setMsg(`Error: ${error.message}`);
    } else {
      setCurrent(selected);
      setMsg("Tier updated — reload to apply.");
    }
  }

  return (
    <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid var(--line-soft)" }}>
      <div style={{ marginBottom: 14 }}>
        <div className="f-sans" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
          Your tier
        </div>
        <div className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}>
          Change your own account tier for testing. Current: <strong>{current}</strong>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value as TierOption)}
          className="f-sans"
          style={{
            height: 34,
            padding: "0 10px",
            borderRadius: 6,
            border: "1px solid var(--line-soft)",
            background: "var(--surface)",
            color: "var(--ink)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {TIER_OPTIONS.map((t) => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
        <SettingsButton onClick={save} disabled={saving || selected === current}>
          {saving ? "Saving…" : "Apply"}
        </SettingsButton>
      </div>
      {msg && (
        <div className="f-sans" style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("Error") ? "var(--blood)" : "var(--moss)" }}>
          {msg}
        </div>
      )}
    </div>
  );
}

function MockGmailReviewSection() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div style={{ borderBottom: "1px solid var(--line-soft)", paddingBottom: 20, marginBottom: 4 }}>
        <SettingsRow
          label="Gmail review UI"
          hint="Opens the swipe review modal with mock cards — no Gmail scan needed."
          last
        >
          <SettingsButton onClick={() => setOpen(true)}>Preview</SettingsButton>
        </SettingsRow>
      </div>
      {open && <GmailScanReviewModal items={MOCK_REVIEW_ITEMS} onClose={() => setOpen(false)} />}
    </>
  );
}

function AdminDisplaySection() {
  const [prefs, setPrefs] = useState<AdminPrefs>(getAdminPrefs);

  const toggle = (key: keyof AdminPrefs, val: boolean) => {
    setAdminPref(key, val);
    setPrefs(getAdminPrefs());
  };

  return (
    <div
      style={{ marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid var(--line-soft)" }}
    >
      <div style={{ marginBottom: 14 }}>
        <div className="f-sans" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
          Admin display
        </div>
        <div className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}>
          Toggle the admin-only debug overlays scattered through the app.
          Off = hidden for you (and only you), On = back where they were.
        </div>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        {ADMIN_PREF_DEFS.map((def) => {
          const on = prefs[def.key];
          return (
            <div
              key={def.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "var(--surface-low)",
                border: "1px solid var(--line-soft)",
                borderRadius: 8,
              }}
            >
              <div style={{ minWidth: 0, paddingRight: 12 }}>
                <div
                  className="f-sans"
                  style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}
                >
                  {def.label}
                </div>
                <div
                  className="f-sans"
                  style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}
                >
                  {def.hint}
                </div>
              </div>
              <button
                onClick={() => toggle(def.key, !on)}
                aria-pressed={on}
                className="press f-sans"
                style={{
                  height: 28,
                  minWidth: 56,
                  padding: "0 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 999,
                  border: `1px solid ${on ? "var(--ember)" : "var(--line-soft)"}`,
                  background: on ? "var(--ember-wash)" : "transparent",
                  color: on ? "var(--ember)" : "var(--ink-faint)",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                {on ? "On" : "Off"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FeatureFlagsSection() {
  const [flags, setFlags] = useState(getAdminFlags);

  const toggle = (key: string, val: boolean) => {
    setAdminFlag(key, val);
    setFlags(getAdminFlags());
    window.dispatchEvent(new StorageEvent("storage", { key: "openbrain_admin_flags" }));
  };

  return (
    <div
      style={{ marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid var(--line-soft)" }}
    >
      <div style={{ marginBottom: 14 }}>
        <div className="f-sans" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
          Feature Flags
        </div>
        <div className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}>
          Toggle individual features on for yourself before making them live in production.
        </div>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        {(
          Object.entries(FEATURE_FLAGS) as [
            string,
            { label: string; icon: string; prodEnabled: boolean },
          ][]
        ).map(([key, flag]) => {
          const adminOn = flags[key] ?? false;
          const visibleToYou = flag.prodEnabled || adminOn;
          return (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "var(--surface-low)",
                border: "1px solid var(--line-soft)",
                borderRadius: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 14, color: "var(--ink-faint)" }}>{flag.icon}</span>
                <div>
                  <span
                    className="f-sans"
                    style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}
                  >
                    {flag.label}
                  </span>
                  <span
                    className="f-sans"
                    style={{
                      marginLeft: 10,
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: flag.prodEnabled ? "var(--ember)" : "var(--ink-faint)",
                    }}
                  >
                    {flag.prodEnabled ? "Live" : "Dev only"}
                  </span>
                </div>
              </div>

              {!flag.prodEnabled && (
                <button
                  onClick={() => toggle(key, !adminOn)}
                  className="press f-sans"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "5px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    background: visibleToYou
                      ? "color-mix(in oklch, var(--ember) 12%, transparent)"
                      : "var(--surface)",
                    color: visibleToYou ? "var(--ember)" : "var(--ink-faint)",
                    border: `1px solid ${visibleToYou ? "color-mix(in oklch, var(--ember) 30%, transparent)" : "var(--line-soft)"}`,
                    cursor: "pointer",
                    transition: "all 180ms",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: visibleToYou ? "var(--ember)" : "var(--ink-faint)",
                      flexShrink: 0,
                    }}
                  />
                  {visibleToYou ? "Visible to you" : "Hidden"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      const ms = Date.now() - t0;
      if (error) {
        setAuthResult({ status: "fail", latencyMs: ms, detail: `Auth error: ${error.message}` });
        return false;
      }
      if (!session) {
        setAuthResult({
          status: "fail",
          latencyMs: ms,
          detail: "No session — user is not authenticated.",
        });
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
      setAuthResult({
        status: "fail",
        latencyMs: Date.now() - t0,
        detail: String(e?.message ?? e),
      });
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
          messages: [{ role: "user", content: "Reply with exactly the word: OK" }],
          system: "Reply with exactly the word: OK",
          max_tokens: 10,
        }),
      });
      const ms = Date.now() - t0;
      const text = await res.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* raw text */
      }

      if (!res.ok) {
        setLlmResult({
          status: "fail",
          latencyMs: ms,
          detail: `HTTP ${res.status}\n\n${text}`,
        });
        return false;
      }

      const aiText =
        parsed?.content?.[0]?.text ?? parsed?.choices?.[0]?.message?.content ?? "(no text field)";
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
        setCaptureResult({
          status: "fail",
          latencyMs: ms,
          detail: `HTTP ${res.status}\n\n${text}`,
        });
        return false;
      }
      setCaptureResult({
        status: "pass",
        latencyMs: ms,
        detail: `HTTP ${res.status}\n\nResponse:\n${text}`,
      });
      return true;
    } catch (e: any) {
      setCaptureResult({
        status: "fail",
        latencyMs: Date.now() - t0,
        detail: String(e?.message ?? e),
      });
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
          max_tokens: 4000,
        }),
      });
      const ms = Date.now() - t0;
      const text = await res.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* raw text */
      }

      if (!res.ok) {
        setSplitResult({
          status: "fail",
          latencyMs: ms,
          detail: `HTTP ${res.status}\n\n${text}`,
        });
        return false;
      }

      const aiText = parsed?.content?.[0]?.text ?? parsed?.choices?.[0]?.message?.content ?? "";

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
        (e: any) => `• ${e.title ?? "(no title)"} — phone: ${e.metadata?.phone ?? "(missing)"}`,
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
      setSplitResult({
        status: "fail",
        latencyMs: Date.now() - t0,
        detail: String(e?.message ?? e),
      });
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

  const sections: {
    label: string;
    hint: string;
    btn: string;
    result: TestResult;
    run: () => void;
  }[] = [
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
      hint: "sends a structured JSON of 10 contacts to /api/llm with the real CAPTURE prompt and max_tokens 4000, then parses the JSON.",
      btn: "Test split",
      result: splitResult,
      run: () => testSplitEntry(),
    },
  ];

  return (
    <div>
      <TierChanger />
      <MockGmailReviewSection />
      <AdminDisplaySection />
      <FeatureFlagsSection />

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
