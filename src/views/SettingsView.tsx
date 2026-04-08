import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useBrain } from "../context/BrainContext";
import AccountTab from "../components/settings/AccountTab";
import AITab from "../components/settings/AITab";
import ProvidersTab from "../components/settings/ProvidersTab";
import BrainTab from "../components/settings/BrainTab";
import NotificationsTab from "../components/settings/NotificationsTab";
import StorageTab from "../components/settings/StorageTab";
import DangerTab from "../components/settings/DangerTab";

type TabId = "account" | "ai" | "providers" | "brain" | "notifications" | "storage" | "danger";

const TAB_DEFS = [
  { id: "account" as TabId,       label: "Account",       icon: "👤" },
  { id: "ai" as TabId,            label: "AI Settings",   icon: "🧠" },
  { id: "providers" as TabId,     label: "Providers",     icon: "⚙️" },
  { id: "brain" as TabId,         label: "Brain",         icon: "🎯" },
  { id: "notifications" as TabId, label: "Notifications", icon: "🔔" },
  { id: "storage" as TabId,       label: "Storage",       icon: "💾" },
];

export default function SettingsView() {
  const { activeBrain, canInvite, canManageMembers, refresh, deleteBrain } = useBrain();
  const [activeTab, setActiveTab] = useState<TabId>("account");
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setEmail(user?.email || ""));
  }, []);

  const tabs = activeBrain?.myRole === "owner"
    ? [...TAB_DEFS, { id: "danger" as TabId, label: "Danger", icon: "⚠️" }]
    : TAB_DEFS;

  return (
    <div className="min-h-screen" style={{ background: "var(--color-background)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className="px-4 pt-4 pb-2 border-b" style={{ borderColor: "var(--color-outline-variant)" }}>
        <h2 className="text-2xl font-bold text-on-surface mb-1">Settings</h2>
        <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>Manage your account and preferences</p>
      </div>

      <div className="px-4 pt-2 pb-0 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="flex gap-2 pb-0 min-w-max md:min-w-full md:flex-wrap">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-3 text-sm font-medium whitespace-nowrap transition-all"
              style={{
                color: activeTab === tab.id ? "var(--color-primary)" : "var(--color-on-surface-variant)",
                borderBottom: activeTab === tab.id ? "2px solid var(--color-primary)" : "2px solid transparent",
              }}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {activeTab === "account" && <AccountTab email={email} />}
        {activeTab === "ai" && <AITab />}
        {activeTab === "providers" && <ProvidersTab activeBrain={activeBrain ?? undefined} />}
        {activeTab === "brain" && activeBrain && (
          <BrainTab
            activeBrain={activeBrain}
            canInvite={canInvite}
            canManageMembers={canManageMembers}
            onRefreshBrains={refresh}
          />
        )}
        {activeTab === "notifications" && <NotificationsTab />}
        {activeTab === "storage" && <StorageTab activeBrain={activeBrain ?? undefined} />}
        {activeTab === "danger" && activeBrain?.myRole === "owner" && (
          <DangerTab activeBrain={activeBrain} deleteBrain={deleteBrain} />
        )}
      </div>
    </div>
  );
}
