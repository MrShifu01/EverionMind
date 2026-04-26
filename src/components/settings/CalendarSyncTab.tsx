import { useState, useEffect } from "react";
import { authFetch } from "../../lib/authFetch";
import { supabase } from "../../lib/supabase";
import { SettingsButton } from "./SettingsRow";
import { IntegrationRow, DisconnectButton } from "./GmailSyncTab";

interface Integration {
  id: string;
  provider: "google" | "microsoft";
  calendar_email: string | null;
  sync_enabled: boolean;
}

export default function CalendarSyncTab() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function fetchIntegrations() {
    return authFetch("/api/calendar?action=integrations")
      .then((r) => r?.json?.())
      .then((d) => {
        if (Array.isArray(d)) setIntegrations(d);
      })
      .catch(() => null);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("calendarConnected");
    const error = params.get("calendarError");
    if (connected) {
      setMsg("Google Calendar connected successfully.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (error) {
      setMsg(`Connection failed: ${error.replace(/_/g, " ")}.`);
      window.history.replaceState({}, "", window.location.pathname);
    }

    fetchIntegrations().finally(() => setLoading(false));
  }, []);

  async function disconnect(provider: string) {
    setDisconnecting(provider);
    await authFetch("/api/calendar", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    }).catch(() => null);
    setIntegrations((prev) => prev.filter((i) => i.provider !== provider));
    setDisconnecting(null);
  }

  async function connectGoogle() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    window.location.href = `/api/calendar-auth?provider=google&token=${encodeURIComponent(token)}`;
  }

  const googleInt = integrations.find((i) => i.provider === "google");

  if (loading) {
    return (
      <div style={{ padding: "24px 0", color: "var(--ink-faint)", fontSize: 13 }}>Loading…</div>
    );
  }

  return (
    <div>
      {msg && (
        <div
          className="mb-4 rounded-xl px-4 py-3 text-sm"
          style={{
            background: msg.includes("success") ? "var(--moss-wash)" : "var(--blood-wash)",
            color: msg.includes("success") ? "var(--moss)" : "var(--blood)",
            border: `1px solid ${msg.includes("success") ? "var(--moss)" : "var(--blood)"}`,
            opacity: 0.9,
          }}
        >
          {msg}
        </div>
      )}

      <IntegrationRow
        connected={!!googleInt}
        label={
          googleInt
            ? googleInt.calendar_email ?? "unknown"
            : "Sync your Google Calendar events into the Todo calendar view."
        }
      >
        {googleInt ? (
          <DisconnectButton
            onClick={() => disconnect("google")}
            disabled={disconnecting === "google"}
          />
        ) : (
          <SettingsButton onClick={connectGoogle}>Connect Google Calendar</SettingsButton>
        )}
      </IntegrationRow>
    </div>
  );
}
