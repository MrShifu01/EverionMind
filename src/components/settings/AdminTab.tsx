import { useState, useEffect, useCallback, useRef } from "react";
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
import AdminCRMSection from "./AdminCRMSection";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";

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
type TierOption = (typeof TIER_OPTIONS)[number];

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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }
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
    <div
      style={{ marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid var(--line-soft)" }}
    >
      <div style={{ marginBottom: 14 }}>
        <div className="f-sans" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
          Your tier
        </div>
        <div className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}>
          Change your own account tier for testing. Current: <strong>{current}</strong>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Select value={selected} onValueChange={(v) => setSelected(v as TierOption)}>
          <SelectTrigger
            className="f-sans"
            style={{
              height: 34,
              borderRadius: 6,
              border: "1px solid var(--line-soft)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontSize: 13,
            }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIER_OPTIONS.map((t) => (
              <SelectItem key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SettingsButton onClick={save} disabled={saving || selected === current}>
          {saving ? "Saving…" : "Apply"}
        </SettingsButton>
      </div>
      {msg && (
        <div
          className="f-sans"
          style={{
            fontSize: 12,
            marginTop: 8,
            color: msg.startsWith("Error") ? "var(--blood)" : "var(--moss)",
          }}
        >
          {msg}
        </div>
      )}
    </div>
  );
}

function DeveloperPreviewSection() {
  function openLandingPreview(heroVariant?: 1 | 2 | 3) {
    const url = new URL(window.location.href);
    url.search = heroVariant ? `?preview=landing&hero=${heroVariant}` : "?preview=landing";
    url.hash = "";
    window.open(url.toString(), "_blank", "noopener");
  }

  // Each variant points at a webp the user drops into /public.
  // Fallback gradient renders if the file is missing.
  const VARIANTS: { id: 1 | 2 | 3; label: string; hint: string; path: string }[] = [
    {
      id: 1,
      label: "Hero variant 1",
      hint: "Man at desk · orbital memory cosmos.",
      path: "/landing-hero-1.webp",
    },
    {
      id: 2,
      label: "Hero variant 2",
      hint: "Laptop · floating UI cards extending out of screen.",
      path: "/landing-hero-2.webp",
    },
    {
      id: 3,
      label: "Hero variant 3",
      hint: "Woman touching a web of memory cards.",
      path: "/landing-hero-3.webp",
    },
  ];

  return (
    <div
      style={{ marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid var(--line-soft)" }}
    >
      <div style={{ marginBottom: 14 }}>
        <div className="f-sans" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
          Developer previews
        </div>
        <div className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}>
          Open the marketing surface in a new tab to compare hero variants. Each row points at a
          different /public/landing-hero-N.webp file — drop the images at those paths to see them.
          Sign-in clicks close the preview tab.
        </div>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <div
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
            <div className="f-sans" style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
              Default landing
            </div>
            <div
              className="f-sans"
              style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}
            >
              /landing-hero.webp · gradient fallback if absent.
            </div>
          </div>
          <Button
            onClick={() => openLandingPreview()}
            variant="outline"
            size="xs"
            className="rounded-full"
          >
            Open ↗
          </Button>
        </div>

        {VARIANTS.map((v) => (
          <div
            key={v.id}
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
                {v.label}
              </div>
              <div
                className="f-sans"
                style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}
              >
                {v.hint}{" "}
                <span style={{ fontFamily: "var(--f-mono)", color: "var(--ink-ghost)" }}>
                  {v.path}
                </span>
              </div>
            </div>
            <Button
              onClick={() => openLandingPreview(v.id)}
              variant="outline"
              size="xs"
              className="rounded-full"
            >
              Open ↗
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Minimal cross-system debug dashboard. Three live tiles — CI run, recent
// commits, backend health — all using existing endpoints + GitHub's public
// API (no new tokens needed). Sentry/Vercel-log tiles are deferred until
// the corresponding env vars are wired.
const GH_REPO = "MrShifu01/EverionMind";
const REFRESH_MS = 30_000;

interface CIRun {
  status: string;
  conclusion: string | null;
  name: string;
  createdAt: string;
  url: string;
  msg: string;
}
interface RecentCommit {
  sha: string;
  msg: string;
  author: string;
  date: string;
  url: string;
}
interface HealthSnapshot {
  ok: boolean;
  latencyMs: number;
  db: boolean;
  gemini: boolean;
  groq: boolean;
  error: string | null;
}
interface SentryIssue {
  id: string;
  title: string;
  count: string;
  userCount: number;
  lastSeen: string;
  permalink: string;
}
interface SentrySnapshot {
  configured: boolean;
  issues: SentryIssue[];
  missing?: string[];
  error?: string;
}

function relTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const ms = Date.now() - d.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function StatusDot({ ok }: { ok: boolean | null }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: ok === null ? "var(--ink-ghost)" : ok ? "var(--moss)" : "var(--blood)",
        marginRight: 8,
        flexShrink: 0,
      }}
    />
  );
}

function DebugDashboardSection() {
  const [ci, setCi] = useState<CIRun | null>(null);
  const [commits, setCommits] = useState<RecentCommit[]>([]);
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [sentry, setSentry] = useState<SentrySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [errors, setErrors] = useState<{
    ci?: string;
    commits?: string;
    health?: string;
    sentry?: string;
  }>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setErrors({});
    const ciP = fetch(
      `https://api.github.com/repos/${GH_REPO}/actions/runs?branch=main&per_page=1`,
      { headers: { Accept: "application/vnd.github+json" } },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        const run = d?.workflow_runs?.[0];
        if (!run) return null;
        return {
          status: run.status as string,
          conclusion: (run.conclusion ?? null) as string | null,
          name: (run.name ?? "workflow") as string,
          createdAt: run.created_at as string,
          url: run.html_url as string,
          msg: (run.head_commit?.message ?? "").split("\n")[0] as string,
        } satisfies CIRun;
      })
      .catch((e: Error) => {
        setErrors((prev) => ({ ...prev, ci: e.message }));
        return null;
      });

    const commitsP = fetch(`https://api.github.com/repos/${GH_REPO}/commits?sha=main&per_page=3`, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const arr = (await r.json()) as Array<{
          sha: string;
          html_url: string;
          commit: { message: string; author: { name: string; date: string } };
        }>;
        return arr.map((c) => ({
          sha: c.sha.slice(0, 7),
          msg: (c.commit.message ?? "").split("\n")[0],
          author: c.commit.author?.name ?? "unknown",
          date: c.commit.author?.date ?? "",
          url: c.html_url,
        }));
      })
      .catch((e: Error) => {
        setErrors((prev) => ({ ...prev, commits: e.message }));
        return [] as RecentCommit[];
      });

    const t0 = Date.now();
    const healthP = authFetch("/api/user-data?resource=health")
      .then(async (r) => {
        const latencyMs = Date.now() - t0;
        if (!r?.ok) throw new Error(`HTTP ${r?.status ?? "?"}`);
        const d = await r.json();
        return {
          ok: Boolean(d?.db && d?.gemini),
          latencyMs,
          db: Boolean(d?.db),
          gemini: Boolean(d?.gemini),
          groq: Boolean(d?.groq),
          error: null,
        } satisfies HealthSnapshot;
      })
      .catch((e: Error) => {
        setErrors((prev) => ({ ...prev, health: e.message }));
        return {
          ok: false,
          latencyMs: Date.now() - t0,
          db: false,
          gemini: false,
          groq: false,
          error: e.message,
        } satisfies HealthSnapshot;
      });

    const sentryP = authFetch("/api/user-data?resource=sentry_issues")
      .then(async (r) => {
        if (!r?.ok) throw new Error(`HTTP ${r?.status ?? "?"}`);
        return (await r.json()) as SentrySnapshot;
      })
      .catch((e: Error) => {
        setErrors((prev) => ({ ...prev, sentry: e.message }));
        return { configured: false, issues: [] } as SentrySnapshot;
      });

    const [ciResult, commitsResult, healthResult, sentryResult] = await Promise.all([
      ciP,
      commitsP,
      healthP,
      sentryP,
    ]);
    setCi(ciResult);
    setCommits(commitsResult);
    setHealth(healthResult);
    setSentry(sentryResult);
    setLastRefresh(Date.now());
    setLoading(false);
  }, []);

  // Ref-tracked lastRefresh so the polling effect doesn't tear down on
  // every state update.
  const lastRefreshRef = useRef<number | null>(null);
  useEffect(() => {
    lastRefreshRef.current = lastRefresh;
  }, [lastRefresh]);

  useEffect(() => {
    // Defer the initial probe off the critical path. The probe fans out to
    // /api/user-data?resource=health (multi-provider ping), sentry_issues
    // (Sentry REST scrape, 1-3s server-side), GitHub CI + commits, and
    // sometimes a slow-cold Vercel function. Firing them on mount made the
    // Admin tab feel locked while the dashboard filled in. Idle callback
    // (or a 1s setTimeout fallback for Safari < 17) yields the UI a window
    // to paint and become interactive before the network burst kicks off.
    type Idle = (cb: () => void, opts?: { timeout?: number }) => number;
    const ric: Idle | undefined = (window as unknown as { requestIdleCallback?: Idle })
      .requestIdleCallback;
    let initialTimer: ReturnType<typeof setTimeout> | null = null;
    if (ric) ric(() => void refresh(), { timeout: 3000 });
    else initialTimer = setTimeout(() => void refresh(), 1000);

    // Visibility-gated polling. The previous unconditional 30s setInterval
    // fired forever — with the admin tab open in any background window it
    // was hammering /api/user-data?resource=health + Sentry + GitHub on
    // every tick. Major contributor to the 2026-05 Supabase unhealthy
    // alerts. Now we only poll while the document is visible, and run a
    // single catch-up refresh on visibility regain.
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const last = lastRefreshRef.current;
      if (last === null || Date.now() - last > REFRESH_MS) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      if (initialTimer) clearTimeout(initialTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const ciOk = ci === null ? null : ci.status === "completed" ? ci.conclusion === "success" : null;

  return (
    <div
      style={{ marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid var(--line-soft)" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="f-sans" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
            Debug dashboard
          </div>
          <div className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}>
            Live cross-system status — refreshes every 30s.{" "}
            {lastRefresh && (
              <span style={{ color: "var(--ink-ghost)" }}>
                Last: {relTime(new Date(lastRefresh).toISOString())}
              </span>
            )}
          </div>
        </div>
        <Button
          onClick={() => void refresh()}
          disabled={loading}
          variant="outline"
          size="xs"
          className="rounded-full"
        >
          {loading ? "…" : "Refresh"}
        </Button>
      </div>

      <div
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        }}
      >
        <a
          href={ci?.url ?? `https://github.com/${GH_REPO}/actions`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "12px 14px",
            background: "var(--surface-low)",
            border: "1px solid var(--line-soft)",
            borderRadius: 10,
            textDecoration: "none",
            display: "block",
          }}
        >
          <div
            className="f-sans"
            style={{
              fontSize: 11,
              color: "var(--ink-faint)",
              letterSpacing: 0.5,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Latest CI
          </div>
          {errors.ci ? (
            <div className="f-sans" style={{ fontSize: 12, color: "var(--blood)" }}>
              {errors.ci}
            </div>
          ) : ci ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                <StatusDot ok={ciOk} />
                <span
                  className="f-sans"
                  style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}
                >
                  {ci.status === "completed" ? ci.conclusion : ci.status}
                </span>
              </div>
              <div
                className="f-sans"
                style={{
                  fontSize: 12,
                  color: "var(--ink-soft)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {ci.msg || ci.name}
              </div>
              <div
                className="f-sans"
                style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 2 }}
              >
                {relTime(ci.createdAt)}
              </div>
            </div>
          ) : (
            <div className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)" }}>
              {loading ? "loading…" : "no runs"}
            </div>
          )}
        </a>

        <div
          style={{
            padding: "12px 14px",
            background: "var(--surface-low)",
            border: "1px solid var(--line-soft)",
            borderRadius: 10,
          }}
        >
          <div
            className="f-sans"
            style={{
              fontSize: 11,
              color: "var(--ink-faint)",
              letterSpacing: 0.5,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Backend health
          </div>
          {health ? (
            <>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                <StatusDot ok={health.ok} />
                <span
                  className="f-sans"
                  style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}
                >
                  {health.ok ? "healthy" : "degraded"}{" "}
                  <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>
                    · {health.latencyMs}ms
                  </span>
                </span>
              </div>
              <div
                className="f-sans"
                style={{
                  fontSize: 12,
                  color: "var(--ink-soft)",
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span>
                  <StatusDot ok={health.db} />
                  DB
                </span>
                <span>
                  <StatusDot ok={health.gemini} />
                  Gemini
                </span>
                <span>
                  <StatusDot ok={health.groq} />
                  Groq
                </span>
              </div>
              {health.error && (
                <div
                  className="f-sans"
                  style={{ fontSize: 11, color: "var(--blood)", marginTop: 4 }}
                >
                  {health.error}
                </div>
              )}
            </>
          ) : (
            <div className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)" }}>
              {loading ? "probing…" : errors.health || "no data"}
            </div>
          )}
        </div>

        <div
          style={{
            padding: "12px 14px",
            background: "var(--surface-low)",
            border: "1px solid var(--line-soft)",
            borderRadius: 10,
          }}
        >
          <div
            className="f-sans"
            style={{
              fontSize: 11,
              color: "var(--ink-faint)",
              letterSpacing: 0.5,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Recent commits
          </div>
          {errors.commits ? (
            <div className="f-sans" style={{ fontSize: 12, color: "var(--blood)" }}>
              {errors.commits}
            </div>
          ) : commits.length > 0 ? (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {commits.map((c) => (
                <li key={c.sha}>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="f-sans"
                    style={{ display: "block", textDecoration: "none", color: "var(--ink)" }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--f-mono)",
                          color: "var(--ink-faint)",
                          marginRight: 6,
                          fontSize: 11,
                        }}
                      >
                        {c.sha}
                      </span>
                      {c.msg}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 1 }}>
                      {c.author} · {relTime(c.date)}
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)" }}>
              {loading ? "loading…" : "no commits"}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          marginTop: 8,
        }}
      >
        <div
          style={{
            padding: "12px 14px",
            background: "var(--surface-low)",
            border: "1px solid var(--line-soft)",
            borderRadius: 10,
          }}
        >
          <div
            className="f-sans"
            style={{
              fontSize: 11,
              color: "var(--ink-faint)",
              letterSpacing: 0.5,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Sentry · top issues 24h
          </div>
          {!sentry ? (
            <div className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)" }}>
              {loading ? "loading…" : errors.sentry || "no data"}
            </div>
          ) : !sentry.configured ? (
            <div
              className="f-sans"
              style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.45 }}
            >
              Configure {sentry.missing?.join(", ")} in Vercel env to enable.{" "}
              <a
                href="https://sentry.io/settings/account/api/auth-tokens/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--ember)" }}
              >
                Get token ↗
              </a>
            </div>
          ) : sentry.error ? (
            <div className="f-sans" style={{ fontSize: 12, color: "var(--blood)" }}>
              {sentry.error}
            </div>
          ) : sentry.issues.length === 0 ? (
            <div
              className="f-sans"
              style={{
                fontSize: 12,
                color: "var(--ink-soft)",
                display: "flex",
                alignItems: "center",
              }}
            >
              <StatusDot ok={true} />
              no unresolved issues
            </div>
          ) : (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {sentry.issues.map((i) => (
                <li key={i.id}>
                  <a
                    href={i.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="f-sans"
                    style={{ display: "block", textDecoration: "none", color: "var(--ink)" }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <StatusDot ok={false} />
                      {i.title}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--ink-faint)",
                        marginTop: 1,
                        marginLeft: 16,
                      }}
                    >
                      {i.count} events · {i.userCount} users · {relTime(i.lastSeen)}
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div
        className="f-sans"
        style={{ fontSize: 11, color: "var(--ink-ghost)", marginTop: 8, fontStyle: "italic" }}
      >
        Vercel-token tile (function 5xx logs) deferred — needs VERCEL_TOKEN + project ID.
      </div>
    </div>
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
          Toggle the admin-only debug overlays scattered through the app. Off = hidden for you (and
          only you), On = back where they were.
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
              <Button
                onClick={() => toggle(def.key, !on)}
                aria-pressed={on}
                variant="outline"
                size="xs"
                className="rounded-full"
                style={{
                  background: on ? "var(--ember-wash)" : "transparent",
                  color: on ? "var(--ember)" : "var(--ink-faint)",
                  borderColor: on ? "var(--ember)" : "var(--line-soft)",
                }}
              >
                {on ? "On" : "Off"}
              </Button>
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
                <Button
                  onClick={() => toggle(key, !adminOn)}
                  variant="outline"
                  size="xs"
                  style={{
                    background: visibleToYou
                      ? "color-mix(in oklch, var(--ember) 12%, transparent)"
                      : "var(--surface)",
                    color: visibleToYou ? "var(--ember)" : "var(--ink-faint)",
                    borderColor: visibleToYou
                      ? "color-mix(in oklch, var(--ember) 30%, transparent)"
                      : "var(--line-soft)",
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
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Admin-only push diagnostic. Triggers the test-push GitHub Actions
// workflow (NOT the Vercel cron path) — keeps the test isolated so we can
// tell whether VAPID + the saved subscription are healthy without Vercel
// being part of the loop. Stays on Hobby plan: no new serverless function,
// just another action handler in the existing user-data.ts.
function PushTestSection() {
  const [enabled, setEnabled] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TestResult>({ status: "idle" });
  const [title, setTitle] = useState("Everion · test push");
  const [body, setBody] = useState(
    "Sent from GitHub Actions. If you see this, push is wired correctly.",
  );

  async function send() {
    setSending(true);
    setResult({ status: "running" });
    const t0 = Date.now();
    try {
      const res = await authFetch("/api/user-data?resource=trigger-test-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const ms = Date.now() - t0;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({
          status: "fail",
          latencyMs: ms,
          detail: data?.error || `HTTP ${res.status}`,
        });
        return;
      }
      setResult({
        status: "pass",
        latencyMs: ms,
        detail: [
          "Workflow dispatched. Push delivery happens on the GH Actions runner.",
          data.run_url ? `Run: ${data.run_url}` : "",
          "Notification arrives in ~10–30s if VAPID + your subscription are healthy.",
        ]
          .filter(Boolean)
          .join("\n"),
      });
    } catch (e) {
      setResult({
        status: "fail",
        latencyMs: Date.now() - t0,
        detail: String(e instanceof Error ? e.message : String(e)),
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      style={{ marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid var(--line-soft)" }}
    >
      <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div className="f-sans" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
            Push diagnostics
          </div>
          <div className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}>
            Toggle on, then send a test push to your own device via the GitHub Actions workflow
            (bypasses Vercel cron entirely).
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-label="Push diagnostics toggle"
        />
      </div>

      {enabled && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="Title"
              className="f-sans"
              style={{
                padding: "8px 10px",
                background: "var(--surface-low)",
                border: "1px solid var(--line)",
                borderRadius: 6,
                color: "var(--ink)",
                fontSize: 13,
                outline: "none",
              }}
            />
            <input
              type="text"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={200}
              placeholder="Body"
              className="f-sans"
              style={{
                padding: "8px 10px",
                background: "var(--surface-low)",
                border: "1px solid var(--line)",
                borderRadius: 6,
                color: "var(--ink)",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>
          <SettingsButton onClick={send} disabled={sending}>
            {sending ? "Dispatching…" : "Send test push (via GH Actions)"}
          </SettingsButton>
          <ResultBlock result={result} />
        </>
      )}
    </div>
  );
}

// Toggles the admin-only "daily roundup" push that fires at the end of the
// GitHub Actions cron-daily run with counts (push sent, gmail created,
// brains enriched, persona decay). Stored in user_metadata.notification_prefs
// so it rides the existing /api/user-data?resource=prefs endpoint — no new
// serverless function.
function DailySummarySection() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await authFetch("/api/user-data?resource=prefs", { method: "GET" });
        const data = await r.json().catch(() => null);
        setEnabled(data?.admin_summary_enabled === true);
      } catch {
        setEnabled(false);
      }
    })();
  }, []);

  async function toggle(next: boolean) {
    setSaving(true);
    setMsg(null);
    const prev = enabled;
    setEnabled(next);
    try {
      const r = await authFetch("/api/user-data?resource=prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_summary_enabled: next }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setMsg(next ? "On — fires after each cron run." : "Off — no roundup notification.");
    } catch (e) {
      setEnabled(prev);
      setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const on = enabled === true;
  return (
    <div
      style={{ marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid var(--line-soft)" }}
    >
      <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div className="f-sans" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
            Daily roundup notification
          </div>
          <div className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}>
            Push notification at the end of the daily cron with counts (push sent, emails staged,
            brains enriched, persona decay).
          </div>
        </div>
        <Switch
          checked={on}
          disabled={enabled === null || saving}
          onCheckedChange={(next) => !saving && enabled !== null && toggle(next)}
          aria-label="Daily roundup toggle"
        />
      </div>
      {msg && (
        <div
          className="f-sans"
          style={{
            fontSize: 12,
            color: msg.startsWith("Error") ? "var(--blood)" : "var(--ink-faint)",
          }}
        >
          {msg}
        </div>
      )}
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
    } catch (e) {
      setAuthResult({
        status: "fail",
        latencyMs: Date.now() - t0,
        detail: String(e instanceof Error ? e.message : String(e)),
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
      let parsed: Record<string, unknown> | null = null;
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
        ((parsed as { content?: Array<{ text?: string }> })?.content?.[0]?.text ??
          (parsed as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message
            ?.content) ||
        "(no text field)";
      setLlmResult({
        status: "pass",
        latencyMs: ms,
        detail: `HTTP ${res.status}\n\nAI replied: "${aiText}"\n\nFull response:\n${JSON.stringify(parsed, null, 2)}`,
      });
      return true;
    } catch (e) {
      setLlmResult({
        status: "fail",
        latencyMs: Date.now() - t0,
        detail: String(e instanceof Error ? e.message : String(e)),
      });
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
    } catch (e) {
      setCaptureResult({
        status: "fail",
        latencyMs: Date.now() - t0,
        detail: String(e instanceof Error ? e.message : String(e)),
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
      let parsed: Record<string, unknown> | null = null;
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

      const aiText =
        ((parsed as { content?: Array<{ text?: string }> })?.content?.[0]?.text ??
          (parsed as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message
            ?.content) ||
        "";

      // Attempt to parse the AI JSON response (same logic as useCaptureSheetParse)
      let entries: Array<{ title?: string; metadata?: { phone?: string } }> = [];
      let parseError = "";
      try {
        const stripped = aiText.replace(/```json|```/g, "").trim();
        const jsonMatch = stripped.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        const jsonResult = JSON.parse(jsonMatch ? jsonMatch[1] : stripped);
        entries = Array.isArray(jsonResult) ? jsonResult : [jsonResult];
      } catch (e) {
        parseError = `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`;
      }

      const tokensUsed =
        (parsed as { usage?: { total_tokens?: number } })?.usage?.total_tokens ?? "unknown";

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
        (e) => `• ${e.title ?? "(no title)"} — phone: ${e.metadata?.phone ?? "(missing)"}`,
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
    } catch (e) {
      setSplitResult({
        status: "fail",
        latencyMs: Date.now() - t0,
        detail: String(e instanceof Error ? e.message : String(e)),
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
      <DebugDashboardSection />
      <AdminCRMSection />
      <TierChanger />
      <DeveloperPreviewSection />
      <PushTestSection />
      <DailySummarySection />
      <AdminDisplaySection />
      <FeatureFlagsSection />

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
        <Button onClick={runAll} disabled={running} size="sm">
          {running ? "Running…" : "Run all tests"}
        </Button>
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
