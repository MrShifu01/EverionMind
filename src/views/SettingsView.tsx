import { useState, useEffect, lazy, Suspense, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { getCachedEmail, setCachedEmail } from "../lib/userEmailCache";
import { useBrain } from "../context/BrainContext";
// Tab modules are lazy-loaded so opening Settings doesn't parse all sections
// (~6000 lines + their fetch waterfalls) up front. Each section downloads
// only when first revealed via `visited`. AdminTab + ProfileTab + AITab are
// the heaviest — lazy keeps the initial Settings open at "instant".
const ProfileTab = lazy(() => import("../components/settings/ProfileTab"));
const AITab = lazy(() => import("../components/settings/AITab"));
const VoiceTab = lazy(() => import("../components/settings/VoiceTab"));
const BrainTab = lazy(() => import("../components/settings/BrainTab"));
const DataTab = lazy(() => import("../components/settings/DataTab"));
const NotificationSettings = lazy(() => import("../components/NotificationSettings"));
const AccountTab = lazy(() => import("../components/settings/AccountTab"));
const BillingTab = lazy(() => import("../components/settings/BillingTab"));
const SecurityTab = lazy(() => import("../components/settings/SecurityTab"));
const DangerTab = lazy(() => import("../components/settings/DangerTab"));
const ClaudeCodeTab = lazy(() => import("../components/settings/ClaudeCodeTab"));
const AdminTab = lazy(() => import("../components/settings/AdminTab"));
import SettingsRow, {
  SettingsButton,
  SettingsSectionLabel,
} from "../components/settings/SettingsRow";

// Skeleton shown while a tab chunk is fetching. Sized roughly to a typical
// settings tab so the layout doesn't jump when content arrives.
function TabLoading() {
  return (
    <div
      className="f-sans"
      style={{
        padding: "20px 0",
        opacity: 0.5,
        fontSize: 13,
        color: "var(--ink-soft)",
      }}
      aria-live="polite"
    >
      Loading…
    </div>
  );
}

type SectionId =
  | "persona"
  | "ai"
  | "brain"
  | "notifications"
  | "account"
  | "billing"
  | "privacy"
  | "developer"
  | "admin";

interface SectionDef {
  id: SectionId;
  label: string;
}

const BASE_SECTIONS: SectionDef[] = [
  { id: "persona", label: "Persona" },
  { id: "ai", label: "AI" },
  { id: "brain", label: "Brain" },
  { id: "notifications", label: "Notifications" },
  { id: "account", label: "Account" },
  { id: "billing", label: "Billing" },
  { id: "privacy", label: "Privacy" },
];

// Legacy URL ids → consolidated section. Keeps deep-links from /api/capture,
// /api/llm, OAuth redirects, and any docs that still reference the old taxonomy
// from sending users into a 404-looking fallback.
const URL_ALIASES: Record<string, SectionId> = {
  appearance: "persona",
  profile: "persona",
  voice: "ai",
  ai: "ai",
  brain: "brain",
  data: "brain",
  connections: "notifications",
  integrations: "developer",
  notifications: "notifications",
  account: "account",
  billing: "billing",
  security: "privacy",
  danger: "privacy",
  developer: "developer",
  api: "developer",
  admin: "admin",
};

function deriveInitialSection(): SectionId {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  if (tab && URL_ALIASES[tab]) return URL_ALIASES[tab];
  return "persona";
}

function isDeveloperEnabled(): boolean {
  // Gated by ?dev=1 (sticky via localStorage) so the surface is invisible to
  // most users but always one URL hop away for the operator.
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("dev") === "1") {
      localStorage.setItem("everion:dev-mode", "1");
      return true;
    }
    if (params.get("dev") === "0") {
      localStorage.removeItem("everion:dev-mode");
      return false;
    }
    return localStorage.getItem("everion:dev-mode") === "1";
  } catch {
    return false;
  }
}

function EmptyState({ message }: { message: string }) {
  return (
    <p
      className="f-sans"
      style={{
        fontSize: 13,
        color: "var(--ink-faint)",
        margin: "8px 0 0",
        lineHeight: 1.5,
      }}
    >
      {message}
    </p>
  );
}

interface SettingsViewProps {
  onNavigate?: (id: string) => void;
}

export default function SettingsView({ onNavigate }: SettingsViewProps = {}) {
  const { activeBrain, refresh } = useBrain();
  const [section, setSection] = useState<SectionId>(deriveInitialSection);
  const [email, setEmail] = useState(() => getCachedEmail());
  const [visited, setVisited] = useState<Set<SectionId>>(() => new Set([section]));
  const [devEnabled] = useState(() => isDeveloperEnabled());

  function visit(id: SectionId) {
    setVisited((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    void supabase.auth
      .refreshSession()
      .catch(() => null)
      .then(() => supabase.auth.getUser())
      .then(({ data: { user } }) => {
        const e = user?.email || "";
        setEmail(e);
        setCachedEmail(e);
        const meta = user?.app_metadata as { is_admin?: boolean } | undefined;
        setIsAdmin(meta?.is_admin === true);
      });
  }, []);

  const SECTIONS: SectionDef[] = [
    ...BASE_SECTIONS,
    ...(devEnabled ? [{ id: "developer" as SectionId, label: "Developer" }] : []),
    ...(isAdmin ? [{ id: "admin" as SectionId, label: "Admin" }] : []),
  ];

  function navButtonStyle(active: boolean): React.CSSProperties {
    return {
      flexShrink: 0,
      width: "100%",
      textAlign: "left",
      padding: "0 12px",
      minHeight: 32,
      height: 32,
      borderRadius: 6,
      fontFamily: "var(--f-sans)",
      fontSize: 13,
      fontWeight: 500,
      color: active ? "var(--ink)" : "var(--ink-soft)",
      background: active ? "var(--surface-high)" : "transparent",
      border: "none",
      cursor: "pointer",
      transition: "background 140ms, color 140ms",
      whiteSpace: "nowrap",
    };
  }

  const avatarInitial = (email || "?").trim().charAt(0).toUpperCase();
  const nameGuess = (email || "").split("@")[0] || "you";

  return (
    <div
      className="settings-root"
      style={{
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
          className="f-sans"
          style={{
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            margin: 0,
            color: "var(--ink)",
          }}
        >
          Settings
        </h1>
      </header>

      <div className="settings-mobile-hero">
        <div
          className="f-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            color: "var(--ink-faint)",
            textTransform: "uppercase",
          }}
        >
          configure
        </div>
        <div
          className="f-serif"
          style={{
            fontSize: 30,
            color: "var(--ink)",
            letterSpacing: "-0.025em",
            lineHeight: 1.05,
            marginTop: 4,
          }}
        >
          <span style={{ fontStyle: "italic", color: "var(--ember)" }}>Settings</span>
        </div>

        <div
          style={{
            marginTop: 14,
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "12px 14px",
            background:
              "linear-gradient(135deg, color-mix(in oklch, var(--ember) 12%, var(--surface-high)), var(--surface-high))",
            border: "1px solid color-mix(in oklch, var(--ember) 24%, var(--line-soft))",
            borderRadius: 16,
          }}
        >
          <div
            aria-hidden
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background:
                "linear-gradient(135deg, color-mix(in oklch, var(--ember) 60%, var(--ember-deep)), var(--ember-deep))",
              border: "1px solid color-mix(in oklch, var(--ember) 70%, transparent)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--ember-ink)",
              fontFamily: "var(--f-serif)",
              fontSize: 22,
              fontWeight: 500,
              boxShadow: "0 0 18px color-mix(in oklch, var(--ember) 32%, transparent)",
              flexShrink: 0,
            }}
          >
            {avatarInitial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="f-serif"
              style={{
                fontSize: 17,
                color: "var(--ink)",
                letterSpacing: "-0.01em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {nameGuess}
            </div>
            <div
              className="f-mono"
              style={{
                fontSize: 9.5,
                letterSpacing: "0.16em",
                color: "var(--ink-faint)",
                textTransform: "uppercase",
                marginTop: 3,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {email || "signed in"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              visit("account");
              setSection("account");
            }}
            className="press"
            style={{
              padding: "6px 10px",
              background: "var(--ember-wash)",
              border: "1px solid color-mix(in oklch, var(--ember) 38%, transparent)",
              borderRadius: 999,
              color: "var(--ember)",
              cursor: "pointer",
              fontFamily: "var(--f-mono)",
              fontSize: 9,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            edit
          </button>
        </div>
      </div>

      <nav
        className="settings-mobile-tabs scrollbar-hide"
        aria-label="Settings sections"
        style={{
          overflowX: "auto",
          padding: "10px 12px",
          borderBottom: "1px solid var(--line-soft)",
          background: "var(--bg)",
          gap: 6,
          position: "sticky",
          top: 0,
          zIndex: "var(--z-sticky)",
        }}
      >
        {SECTIONS.map(({ id, label }) => {
          const active = section === id;
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
                flexShrink: 0,
                padding: "6px 12px",
                height: 30,
                background: active ? "var(--ember-wash)" : "var(--surface-low)",
                border: `1px solid ${
                  active ? "color-mix(in oklch, var(--ember) 40%, transparent)" : "var(--line-soft)"
                }`,
                borderRadius: 999,
                color: active ? "var(--ember)" : "var(--ink-soft)",
                fontFamily: "var(--f-mono)",
                fontSize: 9.5,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
      </nav>

      <div className="settings-body" style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <nav
          className="settings-desktop-nav scrollbar-hide"
          style={{
            width: 200,
            flexShrink: 0,
            height: "100%",
            padding: "20px 12px",
            borderRight: "1px solid var(--line-soft)",
            background: "var(--surface-low)",
            overflowY: "auto",
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
                onClick={() => {
                  visit(id);
                  setSection(id);
                }}
                aria-current={active ? "page" : undefined}
                className="press"
                style={navButtonStyle(active)}
              >
                {label}
              </button>
            );
          })}
        </nav>

        <div className="settings-content scrollbar-hide" style={{ flex: 1 }}>
          <div className="settings-content-inner" style={{ maxWidth: 680 }}>
            <SettingsPanel show={section === "persona"} visited={visited.has("persona")}>
              <SettingsSectionLabel
                label="Persona"
                hint="how Everion addresses you and tailors its replies."
              />
              <Suspense fallback={<TabLoading />}>
                <ProfileTab onNavigate={onNavigate} />
              </Suspense>
            </SettingsPanel>

            <SettingsPanel show={section === "ai"} visited={visited.has("ai")}>
              <SettingsSectionLabel label="AI" hint="provider, enrichment, and voice." />
              <Suspense fallback={<TabLoading />}>
                {activeBrain ? (
                  <AITab activeBrain={activeBrain} isAdmin={isAdmin} />
                ) : (
                  <EmptyState message="no brain selected." />
                )}
                <SettingsSectionLabel label="Voice" topMargin />
                <VoiceTab />
              </Suspense>
            </SettingsPanel>

            <SettingsPanel show={section === "brain"} visited={visited.has("brain")}>
              <SettingsSectionLabel
                label="Brain"
                hint="the brain you're capturing into, your archive, and imports."
              />
              {activeBrain ? (
                <Suspense fallback={<TabLoading />}>
                  <BrainTab activeBrain={activeBrain} onRefreshBrains={refresh} />
                  <SettingsSectionLabel label="Data" topMargin />
                  <DataTab brainId={activeBrain.id} activeBrain={activeBrain} />
                </Suspense>
              ) : (
                <EmptyState message="no brain selected. create or pick one to manage its settings." />
              )}
            </SettingsPanel>

            <SettingsPanel
              show={section === "notifications"}
              visited={visited.has("notifications")}
            >
              <SettingsSectionLabel
                label="Notifications"
                hint="daily prompts, weekly nudges, and push delivery."
              />
              <Suspense fallback={<TabLoading />}>
                <NotificationSettings />
              </Suspense>
            </SettingsPanel>

            <SettingsPanel show={section === "account"} visited={visited.has("account")}>
              <SettingsSectionLabel label="Account" hint="sign-in identity and password." />
              <Suspense fallback={<TabLoading />}>
                <AccountTab email={email} isAdmin={isAdmin} />
              </Suspense>
            </SettingsPanel>

            <SettingsPanel show={section === "billing"} visited={visited.has("billing")}>
              <SettingsSectionLabel
                label="Billing"
                hint="manage your plan, usage, and subscription."
              />
              <Suspense fallback={<TabLoading />}>
                <BillingTab />
              </Suspense>
            </SettingsPanel>

            <SettingsPanel show={section === "privacy"} visited={visited.has("privacy")}>
              <SettingsSectionLabel
                label="Privacy"
                hint="vault PIN, encrypted secrets, and irreversible actions."
              />
              <Suspense fallback={<TabLoading />}>
                <SecurityTab />
                {onNavigate && (
                  <SettingsRow label="Vault" hint="end-to-end encrypted secrets.">
                    <SettingsButton onClick={() => onNavigate("vault")}>Open vault</SettingsButton>
                  </SettingsRow>
                )}
                <SettingsSectionLabel
                  label="Danger zone"
                  hint="all of these are irreversible. we've made them clear, not hidden."
                  topMargin
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
              </Suspense>
            </SettingsPanel>

            {devEnabled && (
              <SettingsPanel show={section === "developer"} visited={visited.has("developer")}>
                <SettingsSectionLabel
                  label="Developer"
                  hint="API tokens for Claude Code and other clients. Hidden by default; toggle with ?dev=1 in the URL."
                />
                <Suspense fallback={<TabLoading />}>
                  <ClaudeCodeTab />
                </Suspense>
              </SettingsPanel>
            )}

            {isAdmin && section === "admin" && (
              <>
                <SettingsSectionLabel
                  label="Admin"
                  hint="connection tests and diagnostics. only visible to you."
                />
                <Suspense fallback={<TabLoading />}>
                  <AdminTab />
                </Suspense>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .settings-root { height: 100dvh; }
        .settings-body { overflow: hidden; }
        .settings-content { overflow-y: auto; padding: 28px 36px; }
        .settings-topbar { padding: 16px 28px; min-height: 56px; }
        .settings-mobile-tabs { display: none; }
        .settings-mobile-hero { display: none; }
        .settings-desktop-nav { display: flex; }

        @media (max-width: 1024px) {
          .settings-root { height: auto; min-height: 100vh; min-height: 100dvh; }
          .settings-body { overflow: visible; flex-direction: column; }
          .settings-content { overflow: visible; padding: 14px 16px calc(96px + env(safe-area-inset-bottom)); }
          .settings-content-inner {
            max-width: 100%;
            background: var(--surface);
            border: 1px solid var(--line-soft);
            border-radius: 16px;
            padding: 14px 14px 18px;
          }
          .settings-topbar { display: none; }
          .settings-mobile-hero { display: block; padding: 10px 16px 14px; background: var(--bg); }
          .settings-mobile-tabs { display: flex; }
          .settings-desktop-nav { display: none; }
        }
      `}</style>
    </div>
  );
}

function SettingsPanel({
  show,
  visited,
  children,
}: {
  show: boolean;
  visited: boolean;
  children: ReactNode;
}) {
  if (!visited) return null;
  return <div style={{ display: show ? "block" : "none" }}>{children}</div>;
}
