import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useBrain } from "../context/BrainContext";
import AccountTab from "../components/settings/AccountTab";
import BrainTab from "../components/settings/BrainTab";
import DataTab from "../components/settings/DataTab";
import AITab from "../components/settings/AITab";
import DangerTab from "../components/settings/DangerTab";
import ClaudeCodeTab from "../components/settings/ClaudeCodeTab";
import CalendarSyncTab from "../components/settings/CalendarSyncTab";
import GmailSyncTab from "../components/settings/GmailSyncTab";
import NotificationSettings from "../components/NotificationSettings";
import AppearanceTab from "../components/settings/AppearanceTab";
import ProfileTab from "../components/settings/ProfileTab";
import BillingTab from "../components/settings/BillingTab";
import AdminTab from "../components/settings/AdminTab";
import SecurityTab from "../components/settings/SecurityTab";
import SettingsRow, {
  SettingsButton,
  SettingsExpand,
} from "../components/settings/SettingsRow";
import { authFetch } from "../lib/authFetch";
import { getDecisionCount } from "../lib/learningEngine";

type SectionId =
  | "appearance"
  | "account"
  | "profile"
  | "billing"
  | "brain"
  | "data"
  | "ai"
  | "notifications"
  | "integrations"
  | "security"
  | "danger"
  | "admin";

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;

const BASE_SECTIONS: { id: SectionId; label: string }[] = [
  { id: "appearance", label: "Appearance" },
  { id: "account", label: "Account" },
  { id: "profile", label: "About you" },
  { id: "brain", label: "Brain" },
  { id: "data", label: "Data" },
  { id: "ai", label: "AI" },
  { id: "notifications", label: "Notifications" },
  { id: "integrations", label: "Integrations" },
  { id: "security", label: "Security" },
  { id: "danger", label: "Danger zone" },
];

function SectionHeader({
  title,
  subtitle,
  danger,
}: {
  title: string;
  subtitle?: string;
  danger?: boolean;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2
        className="f-serif"
        style={{
          fontSize: 32,
          fontWeight: 450,
          letterSpacing: "-0.015em",
          lineHeight: 1.15,
          color: danger ? "var(--blood)" : "var(--ink)",
          margin: 0,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className="f-serif"
          style={{
            fontSize: 15,
            color: "var(--ink-faint)",
            fontStyle: "italic",
            marginTop: 14,
            marginBottom: 0,
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p
      className="f-serif"
      style={{
        fontSize: 14,
        fontStyle: "italic",
        color: "var(--ink-faint)",
        margin: "8px 0 0",
        lineHeight: 1.5,
      }}
    >
      {message}
    </p>
  );
}

function BrainAuditRow({ brainId }: { brainId: string }) {
  type AuditState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "done"; flagged: number; entries: Record<string, any[] | null> }
    | { status: "error"; message: string };

  const [state, setState] = useState<AuditState>({ status: "idle" });

  async function runAudit() {
    setState({ status: "loading" });
    try {
      const r = await authFetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brain_id: brainId }),
      });
      const raw = await r.text();
      if (!r.ok) {
        setState({ status: "error", message: `Audit endpoint returned ${r.status}.` });
        return;
      }
      let parsed: { flagged: number; entries: Record<string, any[] | null> };
      try {
        parsed = JSON.parse(raw);
      } catch {
        setState({ status: "error", message: "Audit response was malformed." });
        return;
      }
      setState({ status: "done", flagged: parsed.flagged, entries: parsed.entries });
    } catch (e: any) {
      setState({ status: "error", message: String(e?.message ?? e) });
    }
  }

  const showExpand = state.status === "done" || state.status === "error";

  return (
    <>
      <SettingsRow
        label="Quality audit"
        hint="ai analysis of your 25 newest entries."
      >
        <SettingsButton onClick={runAudit} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Running…" : "Run audit"}
        </SettingsButton>
      </SettingsRow>
      <SettingsExpand open={showExpand}>
        {state.status === "done" && (
          <>
            <p className="f-sans" style={{ fontSize: 13, color: "var(--ink)", margin: 0 }}>
              {state.flagged === 0
                ? "No issues found."
                : `${state.flagged} entr${state.flagged === 1 ? "y" : "ies"} flagged. Run again after fixing entries to verify.`}
            </p>
            {Object.entries(state.entries).map(([id, flags]) =>
              flags?.length ? (
                <div
                  key={id}
                  className="f-sans"
                  style={{
                    background: "var(--surface-low)",
                    border: "1px solid var(--line-soft)",
                    padding: 10,
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--ink-soft)",
                  }}
                >
                  <p style={{ margin: 0, fontFamily: "var(--f-mono)", opacity: 0.5, fontSize: 11 }}>
                    {id}
                  </p>
                  {flags.map((f, i) => (
                    <p key={i} style={{ margin: "2px 0 0" }}>
                      <span style={{ fontWeight: 600, color: "var(--ink)" }}>{f.type}</span>
                      {f.reason ? ` — ${f.reason}` : ""}
                    </p>
                  ))}
                </div>
              ) : null,
            )}
          </>
        )}
        {state.status === "error" && (
          <p className="f-sans" style={{ fontSize: 13, color: "var(--blood)", margin: 0 }}>
            {state.message}
          </p>
        )}
      </SettingsExpand>
    </>
  );
}

function BrainLearningRow({ brainId }: { brainId: string }) {
  const [count, setCount] = useState<number>(() => getDecisionCount(brainId));

  useEffect(() => {
    setCount(getDecisionCount(brainId));
    const refresh = () => setCount(getDecisionCount(brainId));
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [brainId]);

  const hint =
    count === 0
      ? "no decisions recorded yet. your edits to titles, types, and tags will teach the ai your preferences."
      : count < 10
        ? `${10 - count} more until summarisation kicks in.`
        : "chat and capture now adapt to your patterns.";

  return (
    <SettingsRow label="Brain learning" hint={hint} last>
      <span className="f-sans" style={{ fontSize: 14, color: "var(--ink)" }}>
        {count} {count === 1 ? "decision" : "decisions"}
      </span>
    </SettingsRow>
  );
}

interface SettingsViewProps {
  onNavigate?: (id: string) => void;
}

export default function SettingsView({ onNavigate }: SettingsViewProps = {}) {
  const { activeBrain, refresh } = useBrain();
  const [section, setSection] = useState<SectionId>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("calendarConnected") || params.has("calendarError")) return "integrations";
    if (params.has("gmailConnected") || params.has("gmailError")) return "integrations";
    return "appearance";
  });
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem("everion_email") || "";
    } catch {
      return "";
    }
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [gmailOpen, setGmailOpen] = useState(false);
  const [apiOpen, setApiOpen] = useState(false);
  const [visited, setVisited] = useState<Set<SectionId>>(() => new Set([section]));

  function visit(id: SectionId) {
    setVisited((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const e = user?.email || "";
      setEmail(e);
      try {
        if (e) localStorage.setItem("everion_email", e);
      } catch {
        /* ignore */
      }
    });
  }, []);

  const isAdmin = ADMIN_EMAIL ? Boolean(email && email === ADMIN_EMAIL) : Boolean(email);
  const SECTIONS = isAdmin
    ? [
        ...BASE_SECTIONS,
        { id: "billing" as SectionId, label: "Billing" },
        { id: "admin" as SectionId, label: "Admin" },
      ]
    : BASE_SECTIONS;

  function navButtonStyle(active: boolean, isDanger: boolean): React.CSSProperties {
    return {
      flexShrink: 0,
      width: "100%",
      textAlign: "left",
      padding: "0 14px",
      minHeight: 38,
      height: 38,
      borderRadius: 8,
      fontFamily: "var(--f-sans)",
      fontSize: 14,
      fontWeight: 500,
      color: active ? "var(--ink)" : "var(--ink-soft)",
      background: active ? "var(--surface-high)" : "transparent",
      border: "none",
      cursor: "pointer",
      transition: "background 180ms, color 180ms",
      whiteSpace: "nowrap",
      // a small italic accent on the danger entry hints at its nature without
      // shouting in red before the user has done anything destructive
      fontStyle: isDanger ? "italic" : "normal",
    };
  }

  return (
    <div
      className="settings-root"
      style={{
        // height (not min-height) is required so the flex-1 settings-body
        // resolves to a definite height — the desktop nav's surface-low
        // background needs that to extend to the bottom of the viewport.
        // settings-content scrolls internally (overflowY: auto) when its
        // content is taller than the viewport, so this doesn't clip.
        height: "100dvh",
        background: "var(--bg)",
        fontFamily: "var(--f-sans)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        className="settings-topbar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--line-soft)",
          background: "var(--bg)",
          gap: 20,
        }}
      >
        <h1
          className="f-serif"
          style={{
            fontSize: 28,
            fontWeight: 450,
            letterSpacing: "-0.015em",
            margin: 0,
            color: "var(--ink)",
          }}
        >
          Settings
        </h1>
      </header>

      <nav
        className="settings-mobile-tabs scrollbar-hide"
        aria-label="Settings sections"
        style={{
          overflowX: "auto",
          padding: "8px 12px",
          borderBottom: "1px solid var(--line-soft)",
          background: "var(--surface-low)",
          gap: 4,
        }}
      >
        {SECTIONS.map(({ id, label }) => {
          const active = section === id;
          const isDanger = id === "danger";
          return (
            <button
              key={id}
              onClick={() => {
                visit(id);
                setSection(id);
              }}
              aria-current={active ? "page" : undefined}
              className="press"
              style={{
                ...navButtonStyle(active, isDanger),
                width: "auto",
                padding: "0 14px",
                height: 36,
                minHeight: 36,
              }}
            >
              {label}
            </button>
          );
        })}
      </nav>

      <div className="settings-body" style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <nav
          className="settings-desktop-nav scrollbar-hide"
          style={{
            width: 220,
            flexShrink: 0,
            // height: 100% forces the background to fill the body's full
            // height. Without this, overflowY: auto on a flex item with no
            // explicit height collapsed the nav to its content size and
            // surface-low only painted a few rows tall.
            height: "100%",
            padding: "20px 16px",
            borderRight: "1px solid var(--line-soft)",
            background: "var(--surface-low)",
            overflowY: "auto",
            // display is set in the stylesheet (flex on desktop, none on
            // mobile via @media). Setting it inline would override the
            // @media rule and leak the desktop sidebar into mobile view.
            flexDirection: "column",
            gap: 2,
          }}
          aria-label="Settings sections"
        >
          {SECTIONS.map(({ id, label }) => {
            const active = section === id;
            const isDanger = id === "danger";
            return (
              <button
                key={id}
                onClick={() => {
                  visit(id);
                  setSection(id);
                }}
                onMouseEnter={() => visit(id)}
                aria-current={active ? "page" : undefined}
                className="press"
                style={navButtonStyle(active, isDanger)}
              >
                {label}
              </button>
            );
          })}
        </nav>

        <div className="settings-content scrollbar-hide" style={{ flex: 1, overflowY: "auto" }}>
          <div className="settings-content-inner" style={{ maxWidth: 720 }}>
            {visited.has("appearance") && (
              <div style={{ display: section === "appearance" ? "block" : "none" }}>
                <SectionHeader
                  title="Appearance"
                  subtitle="three rooms, two moods. pick the one you want to live in."
                />
                <AppearanceTab />
              </div>
            )}

            {visited.has("account") && (
              <div style={{ display: section === "account" ? "block" : "none" }}>
                <SectionHeader title="Account" />
                <AccountTab email={email} isAdmin={isAdmin} />
              </div>
            )}

            {visited.has("profile") && (
              <div style={{ display: section === "profile" ? "block" : "none" }}>
                <SectionHeader
                  title="About you"
                  subtitle="who the assistant is talking to. injected into every chat — never includes IDs, passport, banking, or anything that belongs in the vault."
                />
                <ProfileTab />
              </div>
            )}

            {visited.has("billing") && (
              <div style={{ display: section === "billing" ? "block" : "none" }}>
                <SectionHeader
                  title="Billing"
                  subtitle="manage your plan, usage, and subscription."
                />
                <BillingTab />
              </div>
            )}

            {visited.has("brain") && (
              <div style={{ display: section === "brain" ? "block" : "none" }}>
                <SectionHeader title="Brain" />
                {activeBrain ? (
                  <>
                    <BrainTab activeBrain={activeBrain} onRefreshBrains={refresh} />
                    <BrainAuditRow brainId={activeBrain.id} />
                    <BrainLearningRow brainId={activeBrain.id} />
                  </>
                ) : (
                  <EmptyState message="no brain selected. create or pick one to manage its settings." />
                )}
              </div>
            )}

            {visited.has("data") && (
              <div style={{ display: section === "data" ? "block" : "none" }}>
                <SectionHeader title="Data" subtitle="imports, exports, and your entry archive." />
                <DataTab brainId={activeBrain?.id} activeBrain={activeBrain ?? undefined} />
              </div>
            )}

            {visited.has("ai") && (
              <div style={{ display: section === "ai" ? "block" : "none" }}>
                <SectionHeader title="AI" subtitle="model providers and enrichment pipeline." />
                <AITab activeBrain={activeBrain ?? undefined} isAdmin={isAdmin} />
              </div>
            )}

            {visited.has("notifications") && (
              <div style={{ display: section === "notifications" ? "block" : "none" }}>
                <SectionHeader title="Notifications" />
                <NotificationSettings />
              </div>
            )}

            {visited.has("integrations") && (
              <div style={{ display: section === "integrations" ? "block" : "none" }}>
                <SectionHeader
                  title="Integrations"
                  subtitle="external connections and developer access."
                />
                <SettingsRow
                  label="Calendar"
                  hint="sync google calendar events into your brain."
                >
                  <SettingsButton onClick={() => setCalendarOpen((o) => !o)}>
                    {calendarOpen ? "Done" : "Manage"}
                  </SettingsButton>
                </SettingsRow>
                <SettingsExpand open={calendarOpen}>
                  <CalendarSyncTab />
                </SettingsExpand>

                <SettingsRow
                  label="Gmail"
                  hint="scan your inbox for invoices, deadlines, and action items."
                >
                  <SettingsButton onClick={() => setGmailOpen((o) => !o)}>
                    {gmailOpen ? "Done" : "Manage"}
                  </SettingsButton>
                </SettingsRow>
                <SettingsExpand open={gmailOpen}>
                  <GmailSyncTab isAdmin={isAdmin} />
                </SettingsExpand>

                <SettingsRow
                  label="API & developer"
                  hint="generate api tokens for claude code and other clients."
                  last={!apiOpen}
                >
                  <SettingsButton onClick={() => setApiOpen((o) => !o)}>
                    {apiOpen ? "Done" : "Manage"}
                  </SettingsButton>
                </SettingsRow>
                <SettingsExpand open={apiOpen} last>
                  <ClaudeCodeTab />
                </SettingsExpand>
              </div>
            )}

            {visited.has("security") && (
              <div style={{ display: section === "security" ? "block" : "none" }}>
                <SectionHeader
                  title="Security"
                  subtitle="manage the pin that protects your vault secrets."
                />
                <SecurityTab />
                {onNavigate && (
                  <SettingsRow label="Vault" hint="end-to-end encrypted secrets." last>
                    <SettingsButton onClick={() => onNavigate("vault")}>
                      Open vault
                    </SettingsButton>
                  </SettingsRow>
                )}
              </div>
            )}

            {section === "admin" && isAdmin && (
              <>
                <SectionHeader
                  title="Admin"
                  subtitle="connection tests and diagnostics. only visible to you."
                />
                <AdminTab />
              </>
            )}

            {visited.has("danger") && (
              <div style={{ display: section === "danger" ? "block" : "none" }}>
                <SectionHeader
                  title="Danger zone"
                  subtitle="all of these are irreversible. we've made them clear, not hidden."
                  danger
                />
                {activeBrain ? (
                  <DangerTab
                    activeBrain={activeBrain}
                    deleteBrain={async (_id: string) => {
                      /* single brain — no-op */
                    }}
                    isOwner={true}
                    deleteAccount={async () => {
                      const session = await supabase.auth.getSession();
                      const token = session.data.session?.access_token;
                      const r = await fetch("/api/user-data?resource=account", {
                        method: "DELETE",
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      if (!r.ok) {
                        const data = await r.json().catch(() => ({}));
                        throw new Error(data.error || "Failed to delete account");
                      }
                      await supabase.auth.signOut();
                    }}
                  />
                ) : (
                  <EmptyState message="no brain selected. create or pick one to access destructive actions." />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .settings-topbar { padding: 18px 32px; min-height: 72px; }
        .settings-content { padding: 32px 40px; }
        .settings-mobile-tabs { display: none; }
        .settings-desktop-nav { display: flex; }
        @media (max-width: 1024px) {
          .settings-topbar { display: none; }
          .settings-mobile-tabs { display: flex; }
          .settings-desktop-nav { display: none; }
          .settings-content { padding: 20px 16px calc(96px + env(safe-area-inset-bottom)); }
          .settings-body { flex-direction: column; }
          .settings-content-inner { max-width: 100%; }
        }
      `}</style>
    </div>
  );
}
