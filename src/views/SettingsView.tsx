import { useState, useEffect, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { useBrain } from "../context/BrainContext";
import AccountTab from "../components/settings/AccountTab";
import ProvidersTab from "../components/settings/ProvidersTab";
import BrainTab from "../components/settings/BrainTab";
import NotificationsTab from "../components/settings/NotificationsTab";
import StorageTab from "../components/settings/StorageTab";
import DangerTab from "../components/settings/DangerTab";

type TabId = "account" | "intelligence" | "brain" | "notifications" | "storage" | "danger";

function IconUser() {
  return (
    <svg className="inline h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}
function IconBrain() {
  return (
    <svg className="inline h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423L16.5 15.75l.394 1.183a2.25 2.25 0 001.423 1.423L19.5 18.75l-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}
function IconTarget() {
  return (
    <svg className="inline h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg className="inline h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}
function IconArchive() {
  return (
    <svg className="inline h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}
function IconWarning() {
  return (
    <svg className="inline h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

// Personal → Features → Advanced
const TAB_DEFS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: "account", label: "Account", icon: <IconUser /> },
  { id: "brain", label: "Brain", icon: <IconTarget /> },
  { id: "intelligence", label: "Intelligence", icon: <IconBrain /> },
  { id: "notifications", label: "Notifications", icon: <IconBell /> },
  { id: "storage", label: "Storage", icon: <IconArchive /> },
  { id: "danger", label: "Danger", icon: <IconWarning /> },
];

interface SettingsViewProps {
  onNavigate?: (id: string) => void;
}

export default function SettingsView({ onNavigate }: SettingsViewProps = {}) {
  const { activeBrain, canInvite, canManageMembers, refresh, deleteBrain } = useBrain();
  const [activeTab, setActiveTab] = useState<TabId>("account");
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setEmail(user?.email || ""));
  }, []);

  const tabs = TAB_DEFS;

  return (
    <div
      className="min-h-screen"
      style={{
        background: "var(--color-background)",
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <div
        className="border-b px-4 pt-4 pb-2"
        style={{ borderColor: "var(--color-outline-variant)" }}
      >
        <h2 className="text-on-surface mb-1 text-2xl font-bold">Settings</h2>
        <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
          Manage your account and preferences
        </p>
      </div>

      <div
        className="scrollbar-hide overflow-x-auto px-4 pt-2 pb-0"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="flex min-w-max gap-2 pb-0 md:min-w-full md:flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-3 text-sm font-medium whitespace-nowrap transition-all"
              style={{
                color:
                  activeTab === tab.id ? "var(--color-primary)" : "var(--color-on-surface-variant)",
                borderBottom:
                  activeTab === tab.id ? "2px solid var(--color-primary)" : "2px solid transparent",
              }}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        {activeTab === "account" && <AccountTab email={email} />}
        {activeTab === "intelligence" && <ProvidersTab activeBrain={activeBrain ?? undefined} />}
        {activeTab === "brain" && activeBrain && (
          <BrainTab
            activeBrain={activeBrain}
            canInvite={canInvite}
            canManageMembers={canManageMembers}
            onRefreshBrains={refresh}
          />
        )}
        {activeTab === "notifications" && <NotificationsTab />}
        {activeTab === "storage" && (
          <>
            <StorageTab activeBrain={activeBrain ?? undefined} />
            {onNavigate && (
              <div
                className="mt-4 flex items-center justify-between rounded-2xl border px-4 py-3"
                style={{
                  background: "var(--color-surface-container-low)",
                  borderColor: "var(--color-outline-variant)",
                }}
              >
                <div>
                  <p className="text-on-surface text-sm font-semibold">Vault</p>
                  <p className="text-on-surface-variant text-xs">End-to-end encrypted secrets</p>
                </div>
                <button
                  onClick={() => onNavigate("vault")}
                  className="press-scale rounded-xl px-4 py-2 text-xs font-semibold transition-all"
                  style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
                >
                  Open Vault
                </button>
              </div>
            )}
          </>
        )}
        {activeTab === "danger" && activeBrain && (
          <DangerTab
            activeBrain={activeBrain}
            deleteBrain={deleteBrain}
            isOwner={activeBrain.myRole === "owner"}
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
        )}
      </div>
    </div>
  );
}
