import { useState, useEffect, lazy, Suspense } from "react";
import { supabase } from "../lib/supabase";
import { getCachedEmail, setCachedEmail } from "../lib/userEmailCache";
import { useBrain } from "../context/BrainContext";
// Tab modules are lazy-loaded so opening Settings doesn't parse all 14 tabs
// (~6000 lines + their fetch waterfalls) up front. Each tab now downloads
// only when its containing section is first revealed via `visited`. AdminTab
// alone is 1861 lines + 3 mount-time API probes; lazy-loading it cuts the
// admin-user Settings open from "wait for sentry_issues" to "instant".
const AccountTab = lazy(() => import("../components/settings/AccountTab"));
const BrainTab = lazy(() => import("../components/settings/BrainTab"));
const DataTab = lazy(() => import("../components/settings/DataTab"));
const AITab = lazy(() => import("../components/settings/AITab"));
const DangerTab = lazy(() => import("../components/settings/DangerTab"));
const ClaudeCodeTab = lazy(() => import("../components/settings/ClaudeCodeTab"));
const NotificationSettings = lazy(() => import("../components/NotificationSettings"));
const AppearanceTab = lazy(() => import("../components/settings/AppearanceTab"));
const ProfileTab = lazy(() => import("../components/settings/ProfileTab"));
const BillingTab = lazy(() => import("../components/settings/BillingTab"));
const AdminTab = lazy(() => import("../components/settings/AdminTab"));
const SecurityTab = lazy(() => import("../components/settings/SecurityTab"));
import SettingsRow, { SettingsButton, SettingsExpand } from "../components/settings/SettingsRow";

// Skeleton shown while a tab chunk is fetching. Sized roughly to a typical
// settings tab so the layout doesn't jump when content arrives.
function TabLoading() {
  return (
    <div
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

type SectionId = "personal" | "account" | "brain" | "connections" | "privacy" | "admin";

const BASE_SECTIONS: { id: SectionId; label: string }[] = [
  { id: "personal", label: "Personal" },
  { id: "account", label: "Account" },
  { id: "brain", label: "Brain" },
  { id: "connections", label: "Connections" },
  { id: "privacy", label: "Privacy & danger" },
];

// Legacy URL ids → consolidated section. Keeps deep-links from /api/capture,
// /api/llm, OAuth redirects, and any docs that still reference the old taxonomy
// from sending users into a 404-looking Appearance fallback.
const URL_ALIASES: Record<string, SectionId> = {
  appearance: "personal",
  profile: "personal",
  account: "account",
  billing: "account",
  brain: "brain",
  data: "brain",
  ai: "brain",
  notifications: "connections",
  integrations: "connections",
  security: "privacy",
  danger: "privacy",
  admin: "admin",
};

function deriveInitialSection(): SectionId {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  if (tab && URL_ALIASES[tab]) return URL_ALIASES[tab];
  return "personal";
}

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

function SubSection({
  title,
  subtitle,
  danger,
}: {
  title: string;
  subtitle?: string;
  danger?: boolean;
}) {
  return (
    <div
      style={{
        marginTop: 36,
        paddingTop: 24,
        borderTop: "1px solid var(--line-soft)",
        marginBottom: 12,
      }}
    >
      <h3
        className="f-serif"
        style={{
          fontSize: 22,
          fontWeight: 450,
          letterSpacing: "-0.01em",
          color: danger ? "var(--blood)" : "var(--ink)",
          margin: 0,
        }}
      >
        {title}
      </h3>
      {subtitle && (
        <p
          className="f-serif"
          style={{
            fontSize: 14,
            color: "var(--ink-faint)",
            fontStyle: "italic",
            marginTop: 8,
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

interface SettingsViewProps {
  onNavigate?: (id: string) => void;
}

export default function SettingsView({ onNavigate }: SettingsViewProps = {}) {
  const { activeBrain, refresh } = useBrain();
  const [section, setSection] = useState<SectionId>(deriveInitialSection);
  const [email, setEmail] = useState(() => getCachedEmail());
  const [notificationsOpen, setNotificationsOpen] = useState(false);
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

  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    // Force a token refresh before reading app_metadata. JWTs issued before
    // is_admin (or any future role flag) was set on auth.users.app_metadata
    // carry stale claims until the next scheduled refresh — this makes the
    // Settings entry-point always reflect the current server-side role
    // without requiring a manual log-out / log-in.
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

  const SECTIONS = isAdmin
    ? [...BASE_SECTIONS, { id: "admin" as SectionId, label: "Admin" }]
    : BASE_SECTIONS;

  function navButtonStyle(active: boolean): React.CSSProperties {
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
    };
  }

  return (
    <div
      className="settings-root"
      style={{
        // height/overflow are set in the stylesheet so the mobile media
        // query can flatten them without !important. Desktop fixes the
        // viewport height (so the sidebar can have its own scroll); mobile
        // lets the page itself scroll, which avoids the iOS nested-scroll
        // rubber-band that delays touch routing into an inner container.
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
          // Sticky on mobile so users deep in a section can always reach
          // another section without scrolling back. top: 0 because the
          // scroll container is now <main id="main-content"> (post layout
          // refactor a14d914) which already starts below the global app
          // header — sticky 0 pins this tab strip at the top of main-
          // content's visible area, flush under the header bars. Previous
          // var(--app-header-h) double-counted the header height and
          // pushed the strip off-screen.
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
                ...navButtonStyle(active),
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

      <div className="settings-body" style={{ flex: 1, display: "flex", minHeight: 0 }}>
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
                style={navButtonStyle(active)}
              >
                {label}
              </button>
            );
          })}
        </nav>

        <div className="settings-content scrollbar-hide" style={{ flex: 1 }}>
          <div className="settings-content-inner" style={{ maxWidth: 720 }}>
            {visited.has("personal") && (
              <div style={{ display: section === "personal" ? "block" : "none" }}>
                <SectionHeader
                  title="Personal"
                  subtitle="how the app looks and what the assistant knows about you."
                />
                <Suspense fallback={<TabLoading />}>
                  <AppearanceTab />
                  <SubSection
                    title="About you"
                    subtitle="injected into every chat — never includes IDs, passport, banking, or anything that belongs in the vault."
                  />
                  <ProfileTab />
                </Suspense>
              </div>
            )}

            {visited.has("account") && (
              <div style={{ display: section === "account" ? "block" : "none" }}>
                <SectionHeader title="Account" />
                <Suspense fallback={<TabLoading />}>
                  <AccountTab email={email} isAdmin={isAdmin} />
                  <SubSection
                    title="Billing"
                    subtitle="manage your plan, usage, and subscription."
                  />
                  <BillingTab />
                </Suspense>
              </div>
            )}

            {visited.has("brain") && (
              <div style={{ display: section === "brain" ? "block" : "none" }}>
                <SectionHeader
                  title="Brain"
                  subtitle="the brain you're capturing into, your archive, and the ai layer."
                />
                {activeBrain ? (
                  <Suspense fallback={<TabLoading />}>
                    <BrainTab activeBrain={activeBrain} onRefreshBrains={refresh} />
                    <SubSection title="Data" subtitle="imports, exports, and your entry archive." />
                    <DataTab brainId={activeBrain.id} activeBrain={activeBrain} />
                    <SubSection title="AI" subtitle="model providers and enrichment pipeline." />
                    <AITab activeBrain={activeBrain} isAdmin={isAdmin} />
                  </Suspense>
                ) : (
                  <EmptyState message="no brain selected. create or pick one to manage its settings." />
                )}
              </div>
            )}

            {visited.has("connections") && (
              <div style={{ display: section === "connections" ? "block" : "none" }}>
                <SectionHeader
                  title="Connections"
                  subtitle="notifications, external services, and developer access."
                />
                <SettingsRow
                  label="Notifications"
                  hint="daily capture prompts, weekly nudges, and push delivery."
                >
                  <SettingsButton onClick={() => setNotificationsOpen((o) => !o)}>
                    {notificationsOpen ? "Done" : "Manage"}
                  </SettingsButton>
                </SettingsRow>
                <SettingsExpand open={notificationsOpen} keepMounted>
                  <Suspense fallback={<TabLoading />}>
                    <NotificationSettings />
                  </Suspense>
                </SettingsExpand>
                <SubSection title="Integrations" subtitle="developer access." />
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
                  <Suspense fallback={<TabLoading />}>
                    <ClaudeCodeTab />
                  </Suspense>
                </SettingsExpand>
              </div>
            )}

            {visited.has("privacy") && (
              <div style={{ display: section === "privacy" ? "block" : "none" }}>
                <SectionHeader
                  title="Privacy & danger"
                  subtitle="vault pin, encrypted secrets, and irreversible actions."
                />
                <Suspense fallback={<TabLoading />}>
                  <SecurityTab />
                  {onNavigate && (
                    <SettingsRow label="Vault" hint="end-to-end encrypted secrets.">
                      <SettingsButton onClick={() => onNavigate("vault")}>
                        Open vault
                      </SettingsButton>
                    </SettingsRow>
                  )}
                  <SubSection
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
                </Suspense>
              </div>
            )}

            {section === "admin" && isAdmin && (
              <>
                <SectionHeader
                  title="Admin"
                  subtitle="connection tests and diagnostics. only visible to you."
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
        /* Desktop: viewport-locked layout. The root pins to 100dvh so the
           sidebar can have its own scroll independent of the content
           panel — both use overflow-y: auto. */
        .settings-root { height: 100dvh; }
        .settings-body { overflow: hidden; }
        .settings-content { overflow-y: auto; padding: 32px 40px; }
        .settings-topbar { padding: 18px 32px; min-height: 72px; }
        .settings-mobile-tabs { display: none; }
        .settings-desktop-nav { display: flex; }

        /* Mobile: flatten to a single page-level scroll. Nesting an inner
           overflow-y: auto inside an overflow: hidden parent causes iOS to
           rubber-band the outer page on the first touch and only re-route
           into the inner container after a few hundred ms — the "screen
           feels static, then suddenly scrolls" symptom. Dropping the inner
           scroll lets every device scroll the page natively with no touch
           routing delay. */
        @media (max-width: 1024px) {
          .settings-root { height: auto; min-height: 100vh; min-height: 100dvh; }
          .settings-body { overflow: visible; flex-direction: column; }
          .settings-content { overflow: visible; padding: 20px 16px calc(96px + env(safe-area-inset-bottom)); }
          .settings-content-inner { max-width: 100%; }
          .settings-topbar { display: none; }
          .settings-mobile-tabs { display: flex; }
          .settings-desktop-nav { display: none; }
        }
      `}</style>
    </div>
  );
}
