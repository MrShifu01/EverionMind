import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useBrain } from "../context/BrainContext";
import AccountTab from "../components/settings/AccountTab";
import ProvidersTab from "../components/settings/ProvidersTab";
import BrainTab from "../components/settings/BrainTab";
import NotificationsTab from "../components/settings/NotificationsTab";
import StorageTab from "../components/settings/StorageTab";
import DangerTab from "../components/settings/DangerTab";

type TabId = "account" | "intelligence" | "brain" | "notifications" | "storage" | "danger";

// Personal → Features → Advanced
const TAB_DEFS = [
  { id: "account" as TabId, label: "Account", icon: "👤" },
  { id: "brain" as TabId, label: "Brain", icon: "🎯" },
  { id: "intelligence" as TabId, label: "Intelligence", icon: "🧠" },
  { id: "notifications" as TabId, label: "Notifications", icon: "🔔" },
  { id: "storage" as TabId, label: "Storage", icon: "💾" },
  { id: "danger" as TabId, label: "Danger", icon: "⚠️" },
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
