import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useBrain } from "../context/BrainContext";
import AccountTab from "../components/settings/AccountTab";
import ProvidersTab from "../components/settings/ProvidersTab";
import BrainTab from "../components/settings/BrainTab";
import StorageTab from "../components/settings/StorageTab";
import DangerTab from "../components/settings/DangerTab";
import ClaudeCodeTab from "../components/settings/ClaudeCodeTab";
import NotificationSettings from "../components/NotificationSettings";
import AppearanceTab from "../components/settings/AppearanceTab";
import { authFetch } from "../lib/authFetch";

type SectionId =
  | "appearance"
  | "account"
  | "brain"
  | "providers"
  | "notifications"
  | "storage"
  | "integrations"
  | "danger";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "appearance", label: "Appearance" },
  { id: "account", label: "Account" },
  { id: "brain", label: "Brain" },
  { id: "providers", label: "AI providers" },
  { id: "notifications", label: "Notifications" },
  { id: "storage", label: "Storage" },
  { id: "integrations", label: "Integrations" },
  { id: "danger", label: "Danger zone" },
];

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2
        className="f-serif"
        style={{
          fontSize: 28, fontWeight: 450, letterSpacing: "-0.01em",
          color: "var(--ink)", margin: 0,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className="f-serif"
          style={{
            fontSize: 14, color: "var(--ink-faint)", fontStyle: "italic",
            marginTop: 6, marginBottom: 0, lineHeight: 1.5,
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
      if (!r.ok) {
        setState({ status: "error", message: `HTTP ${r.status}: ${raw}` });
        return;
      }
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
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div>
          <div className="f-serif" style={{ fontSize: 16, fontWeight: 450, color: "var(--ink)" }}>
            Quality audit
          </div>
          <div
            className="f-serif"
            style={{ fontSize: 13, color: "var(--ink-faint)", fontStyle: "italic", marginTop: 3 }}
          >
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
    <div
      style={{
        padding: "18px 0",
        borderBottom: "1px solid var(--line-soft)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 32,
      }}
    >
      <div style={{ flex: 1 }}>
        <div className="f-serif" style={{ fontSize: 16, fontWeight: 450, color: "var(--ink)" }}>
          Vault
        </div>
        <div
          className="f-serif"
          style={{ fontSize: 13, color: "var(--ink-faint)", fontStyle: "italic", marginTop: 3 }}
        >
          end-to-end encrypted secrets.
        </div>
      </div>
      <button
        onClick={() => onNavigate("vault")}
        className="design-btn-secondary press"
        style={{ height: 32, minHeight: 32, fontSize: 13, padding: "0 14px" }}
      >
        Open vault
      </button>
    </div>
  );
}

interface SettingsViewProps {
  onNavigate?: (id: string) => void;
}

export default function SettingsView({ onNavigate }: SettingsViewProps = {}) {
  const { activeBrain, refresh } = useBrain();
  const [section, setSection] = useState<SectionId>("appearance");
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

  return (
    <div
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
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 32px",
          borderBottom: "1px solid var(--line-soft)",
          minHeight: 68,
          background: "var(--bg)",
          gap: 20,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1
            className="f-serif"
            style={{
              fontSize: 22,
              fontWeight: 450,
              letterSpacing: "-0.01em",
              margin: 0,
              color: "var(--ink)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Settings
          </h1>
          <div
            className="f-serif"
            style={{ fontSize: 13, color: "var(--ink-faint)", fontStyle: "italic", marginTop: 2 }}
          >
            your room — how it looks, who runs the AI, what we keep.
          </div>
        </div>
      </header>

      {/* Body: left nav + content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <nav
          className="scrollbar-hide"
          style={{
            width: 220,
            flexShrink: 0,
            padding: "20px 12px",
            borderRight: "1px solid var(--line-soft)",
            background: "var(--surface-low)",
            overflowY: "auto",
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
                  minHeight: 36,
                  height: 36,
                  borderRadius: 6,
                  fontFamily: "var(--f-sans)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: active ? "var(--ink)" : id === "danger" ? "var(--blood)" : "var(--ink-soft)",
                  background: active ? "var(--surface)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </nav>

        <div
          className="scrollbar-hide"
          style={{
            flex: 1,
            padding: "32px 40px",
            overflowY: "auto",
          }}
        >
          <div style={{ maxWidth: 720 }}>
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
                <SectionHeader
                  title="Account"
                  subtitle="your email, your profile, your sign-out."
                />
                <AccountTab email={email} brainId={activeBrain?.id} />
              </>
            )}

            {section === "brain" && activeBrain && (
              <>
                <SectionHeader title="Brain" subtitle="what lives here, what extracts concepts." />
                <BrainTab activeBrain={activeBrain} onRefreshBrains={refresh} />
              </>
            )}

            {section === "providers" && (
              <>
                <SectionHeader
                  title="AI providers"
                  subtitle="bring your own key. routed on device. we never see the traffic."
                />
                <ProvidersTab activeBrain={activeBrain ?? undefined} />
              </>
            )}

            {section === "notifications" && (
              <>
                <SectionHeader
                  title="Notifications"
                  subtitle="when we tap you on the shoulder — never more than once a day."
                />
                <div
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--line-soft)",
                    borderRadius: 12,
                    padding: 20,
                  }}
                >
                  <NotificationSettings />
                </div>
              </>
            )}

            {section === "storage" && (
              <>
                <SectionHeader
                  title="Storage"
                  subtitle="entries, files, trash. export anywhere, anytime."
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <StorageTab activeBrain={activeBrain ?? undefined} />
                  {activeBrain && <AuditCard brainId={activeBrain.id} />}
                  {onNavigate && <VaultRow onNavigate={onNavigate} />}
                </div>
              </>
            )}

            {section === "integrations" && (
              <>
                <SectionHeader
                  title="Integrations"
                  subtitle="mcp and rest endpoints for the agents you already use."
                />
                <ClaudeCodeTab />
              </>
            )}

            {section === "danger" && activeBrain && (
              <>
                <SectionHeader
                  title="Danger zone"
                  subtitle="all of these are irreversible. we've made them clear, not hidden."
                />
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
