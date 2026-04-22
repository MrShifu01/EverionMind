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
import NotificationSettings from "../components/NotificationSettings";
import AppearanceTab from "../components/settings/AppearanceTab";
import AdminTab from "../components/settings/AdminTab";
import SecurityTab from "../components/settings/SecurityTab";
import SettingsRow, { SettingsButton } from "../components/settings/SettingsRow";
import { authFetch } from "../lib/authFetch";

type SectionId =
  | "appearance"
  | "account"
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
  { id: "brain", label: "Brain" },
  { id: "data", label: "Data" },
  { id: "ai", label: "AI" },
  { id: "notifications", label: "Notifications" },
  { id: "integrations", label: "Integrations" },
  { id: "security", label: "Security" },
  { id: "danger", label: "Danger zone" },
];

function SectionHeader({ title, subtitle, danger }: { title: string; subtitle?: string; danger?: boolean }) {
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

function AuditCard({ brainId }: { brainId: string }) {
  type AuditState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "done"; flagged: number; entries: Record<string, any[] | null>; raw: string }
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
      if (!r.ok) { setState({ status: "error", message: `HTTP ${r.status}: ${raw}` }); return; }
      let parsed: { flagged: number; entries: Record<string, any[] | null> };
      try { parsed = JSON.parse(raw); }
      catch { setState({ status: "error", message: `Invalid JSON response:\n${raw}` }); return; }
      setState({ status: "done", flagged: parsed.flagged, entries: parsed.entries, raw });
    } catch (e: any) {
      setState({ status: "error", message: String(e?.message ?? e) });
    }
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line-soft)",
        borderRadius: 12,
        padding: 20,
        marginTop: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div>
          <div className="f-serif" style={{ fontSize: 16, fontWeight: 450, color: "var(--ink)" }}>
            Quality audit
          </div>
          <div className="f-serif" style={{ fontSize: 13, color: "var(--ink-faint)", fontStyle: "italic", marginTop: 3 }}>
            ai analysis of your 25 newest entries.
          </div>
        </div>
        <button
          onClick={runAudit}
          disabled={state.status === "loading"}
          aria-busy={state.status === "loading"}
          className="design-btn-secondary press"
          style={{ height: 32, minHeight: 32, fontSize: 13, padding: "0 14px" }}
        >
          {state.status === "loading" ? "Running…" : "Run audit"}
        </button>
      </div>

      {state.status === "done" && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
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
                <p style={{ margin: 0, fontFamily: "var(--f-mono)", opacity: 0.5, fontSize: 11 }}>{id}</p>
                {flags.map((f, i) => (
                  <p key={i} style={{ margin: "2px 0 0" }}>
                    <span style={{ fontWeight: 600, color: "var(--ink)" }}>{f.type}</span>
                    {f.reason ? ` — ${f.reason}` : ""}
                  </p>
                ))}
              </div>
            ) : null,
          )}
        </div>
      )}

      {state.status === "error" && (
        <div
          style={{
            marginTop: 14,
            background: "var(--blood-wash)",
            border: "1px solid var(--blood)",
            padding: 12,
            borderRadius: 8,
          }}
        >
          <p className="f-sans" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--blood)" }}>
            Audit failed
          </p>
          <pre
            style={{
              margin: "4px 0 0",
              fontFamily: "var(--f-mono)",
              fontSize: 11,
              color: "var(--ink-soft)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {state.message}
          </pre>
        </div>
      )}
    </div>
  );
}

function VaultRow({ onNavigate }: { onNavigate: (id: string) => void }) {
  return (
    <SettingsRow label="Vault" hint="end-to-end encrypted secrets.">
      <SettingsButton onClick={() => onNavigate("vault")}>Open vault</SettingsButton>
    </SettingsRow>
  );
}

interface GapDetail { id: string; title: string; gaps: string[] }

interface EnrichError { step: string; message: string }

interface SettingsViewProps {
  onNavigate?: (id: string) => void;
  unenrichedDetails?: GapDetail[];
  enriching?: boolean;
  enrichProgress?: { done: number; total: number } | null;
  enrichErrors?: { id: string; title: string; errors: EnrichError[] }[];
  runBulkEnrich?: () => Promise<void>;
}

export default function SettingsView({
  onNavigate,
  unenrichedDetails = [],
  enriching = false,
  enrichProgress = null,
  enrichErrors = [],
  runBulkEnrich = async () => {},
}: SettingsViewProps = {}) {
  const { activeBrain, refresh } = useBrain();
  const [section, setSection] = useState<SectionId>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("calendarConnected") || params.has("calendarError")) return "integrations";
    return "appearance";
  });
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem("everion_email") || ""; } catch { return ""; }
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const e = user?.email || "";
      setEmail(e);
      try { if (e) localStorage.setItem("everion_email", e); } catch { /* ignore */ }
    });
  }, []);

  const isAdmin = ADMIN_EMAIL ? (Boolean(email && email === ADMIN_EMAIL)) : Boolean(email);
  const SECTIONS = isAdmin
    ? [...BASE_SECTIONS, { id: "admin" as SectionId, label: "Admin" }]
    : BASE_SECTIONS;

  return (
    <div
      className="settings-root"
      style={{
        height: "100%",
        background: "var(--bg)",
        fontFamily: "var(--f-sans)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top bar */}
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

      {/* Mobile tab strip */}
      <nav
        className="settings-mobile-tabs scrollbar-hide"
        aria-label="Settings sections"
        style={{
          display: "none",
          overflowX: "auto",
          padding: "8px 12px",
          borderBottom: "1px solid var(--line-soft)",
          background: "var(--surface-low)",
          gap: 4,
        }}
      >
        {SECTIONS.map(({ id, label }) => {
          const active = section === id;
          return (
            <button
              key={id}
              onClick={() => setSection(id)}
              aria-current={active ? "page" : undefined}
              className="press"
              style={{
                flexShrink: 0,
                padding: "0 14px",
                height: 36,
                minHeight: 36,
                borderRadius: 999,
                fontFamily: "var(--f-sans)",
                fontSize: 13,
                fontWeight: 500,
                color: active ? "var(--ember)" : id === "danger" ? "var(--blood)" : "var(--ink-soft)",
                background: active ? "var(--ember-wash)" : "transparent",
                border: "1px solid",
                borderColor: active ? "var(--ember)" : "transparent",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </button>
          );
        })}
      </nav>

      {/* Body: left nav (desktop) + content */}
      <div className="settings-body" style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <nav
          className="settings-desktop-nav scrollbar-hide"
          style={{
            width: 220,
            flexShrink: 0,
            padding: "20px 16px",
            borderRight: "1px solid var(--line-soft)",
            background: "var(--surface-low)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
          aria-label="Settings sections"
        >
          {SECTIONS.map(({ id, label }) => {
            const active = section === id;
            return (
              <button
                key={id}
                onClick={() => setSection(id)}
                aria-current={active ? "page" : undefined}
                className="press"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "0 14px",
                  minHeight: 38,
                  height: 38,
                  borderRadius: 8,
                  fontFamily: "var(--f-sans)",
                  fontSize: 14,
                  fontWeight: 500,
                  color: active ? "var(--ink)" : id === "danger" ? "var(--blood)" : "var(--ink-soft)",
                  background: active ? "var(--surface-high)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  transition: "background 180ms, color 180ms",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "var(--ink)"; }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.color = id === "danger" ? "var(--blood)" : "var(--ink-soft)";
                  }
                }}
              >
                {label}
              </button>
            );
          })}
        </nav>

        <div className="settings-content scrollbar-hide" style={{ flex: 1, overflowY: "auto" }}>
          <div className="settings-content-inner" style={{ maxWidth: 720 }}>

            {section === "appearance" && (
              <>
                <SectionHeader
                  title="Appearance"
                  subtitle="three rooms, two moods. pick the one you want to live in."
                />
                <AppearanceTab />
              </>
            )}

            {section === "account" && (
              <>
                <SectionHeader title="Account" />
                <AccountTab email={email} />
              </>
            )}

            {section === "brain" && activeBrain && (
              <>
                <SectionHeader title="Brain" />
                <BrainTab activeBrain={activeBrain} onRefreshBrains={refresh} />
                <AuditCard brainId={activeBrain.id} />
              </>
            )}

            {section === "data" && (
              <>
                <SectionHeader
                  title="Data"
                  subtitle="imports, exports, and your entry archive."
                />
                <DataTab brainId={activeBrain?.id} activeBrain={activeBrain ?? undefined} />
              </>
            )}

            {section === "ai" && (
              <>
                <SectionHeader
                  title="AI"
                  subtitle="model providers and enrichment pipeline."
                />
                <AITab
                  activeBrain={activeBrain ?? undefined}
                  unenrichedDetails={unenrichedDetails}
                  enriching={enriching}
                  enrichProgress={enrichProgress}
                  enrichErrors={enrichErrors}
                  isAdmin={isAdmin}
                  runBulkEnrich={runBulkEnrich}
                />
              </>
            )}

            {section === "notifications" && (
              <>
                <SectionHeader title="Notifications" />
                <NotificationSettings />
              </>
            )}

            {section === "integrations" && (
              <>
                <SectionHeader
                  title="Integrations"
                  subtitle="external connections and developer access."
                />
                <CalendarSyncTab />
                <div style={{ margin: "32px 0 24px", borderTop: "1px solid var(--line-soft)" }} />
                <div className="micro" style={{ marginBottom: 16 }}>API & Developer</div>
                <ClaudeCodeTab />
              </>
            )}

            {section === "security" && (
              <>
                <SectionHeader
                  title="Security"
                  subtitle="manage the PIN that protects your vault secrets."
                />
                <SecurityTab />
                {onNavigate && (
                  <div style={{ marginTop: 16 }}>
                    <VaultRow onNavigate={onNavigate} />
                  </div>
                )}
              </>
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

            {section === "danger" && activeBrain && (
              <>
                <SectionHeader
                  title="Danger zone"
                  subtitle="all of these are irreversible. we've made them clear, not hidden."
                  danger
                />
                <DangerTab
                  activeBrain={activeBrain}
                  deleteBrain={async (_id: string) => { /* single brain — no-op */ }}
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
              </>
            )}

          </div>
        </div>
      </div>

      {/* Responsive CSS */}
      <style>{`
        .settings-topbar { padding: 18px 32px; min-height: 72px; }
        .settings-content { padding: 32px 40px; }
        .settings-mobile-tabs { display: none; }
        .settings-desktop-nav { display: flex; }
        @media (max-width: 1024px) {
          .settings-topbar { padding: 14px 20px; min-height: 56px; }
          .settings-mobile-tabs { display: flex !important; }
          .settings-desktop-nav { display: none !important; }
          .settings-content { padding: 20px 16px calc(96px + env(safe-area-inset-bottom)); }
          .settings-body { flex-direction: column; }
          .settings-content-inner { max-width: 100%; }
        }
      `}</style>
    </div>
  );
}
