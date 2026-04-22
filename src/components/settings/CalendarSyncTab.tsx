import { useState, useEffect } from "react";
import { authFetch } from "../../lib/authFetch";
import { SettingsButton } from "./SettingsRow";

interface Integration {
  id: string;
  provider: "google" | "microsoft";
  calendar_email: string | null;
  sync_enabled: boolean;
}

function StatusDot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: on ? "var(--moss)" : "var(--ink-ghost)",
        flexShrink: 0,
      }}
    />
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
      <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
    </svg>
  );
}

export default function CalendarSyncTab() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    authFetch("/api/calendar/integrations")
      .then((r) => r?.json?.())
      .then((d) => { if (Array.isArray(d)) setIntegrations(d); })
      .catch(() => null)
      .finally(() => setLoading(false));

    /* Handle OAuth redirect back to settings */
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("calendarConnected");
    const error = params.get("calendarError");
    if (connected) {
      setMsg(`${connected === "google" ? "Google Calendar" : "Outlook"} connected successfully.`);
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (error) {
      setMsg(`Connection failed: ${error.replace(/_/g, " ")}.`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function disconnect(provider: string) {
    setDisconnecting(provider);
    await authFetch("/api/calendar/integrations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    }).catch(() => null);
    setIntegrations((prev) => prev.filter((i) => i.provider !== provider));
    setDisconnecting(null);
  }

  function connectGoogle() {
    window.location.href = "/api/auth/google-calendar";
  }

  function connectMicrosoft() {
    window.location.href = "/api/auth/microsoft-calendar";
  }

  const googleInt = integrations.find((i) => i.provider === "google");
  const msInt = integrations.find((i) => i.provider === "microsoft");

  if (loading) {
    return (
      <div style={{ padding: "24px", color: "var(--ink-faint)", fontSize: 13 }}>
        Loading…
      </div>
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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          padding: "18px 0",
          borderBottom: "1px solid var(--line-soft)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="f-serif flex items-center gap-2" style={{ fontSize: 16, fontWeight: 450, color: "var(--ink)" }}>
            <StatusDot on={!!googleInt} />
            <GoogleIcon />
            <span>Google Calendar</span>
          </div>
          <div className="f-serif" style={{ fontSize: 13, color: "var(--ink-faint)", fontStyle: "italic", marginTop: 3 }}>
            {googleInt
              ? `Connected as ${googleInt.calendar_email ?? "unknown"}`
              : "Sync your Google Calendar events into the Todo calendar view."}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          {googleInt ? (
            <SettingsButton onClick={() => disconnect("google")} disabled={disconnecting === "google"} danger>
              {disconnecting === "google" ? "Disconnecting…" : "Disconnect"}
            </SettingsButton>
          ) : (
            <SettingsButton onClick={connectGoogle}>Connect</SettingsButton>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          padding: "18px 0",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="f-serif flex items-center gap-2" style={{ fontSize: 16, fontWeight: 450, color: "var(--ink)" }}>
            <StatusDot on={!!msInt} />
            <MicrosoftIcon />
            <span>Outlook / Microsoft 365</span>
          </div>
          <div className="f-serif" style={{ fontSize: 13, color: "var(--ink-faint)", fontStyle: "italic", marginTop: 3 }}>
            {msInt
              ? `Connected as ${msInt.calendar_email ?? "unknown"}`
              : "Sync your Outlook or Microsoft 365 calendar events."}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          {msInt ? (
            <SettingsButton onClick={() => disconnect("microsoft")} disabled={disconnecting === "microsoft"} danger>
              {disconnecting === "microsoft" ? "Disconnecting…" : "Disconnect"}
            </SettingsButton>
          ) : (
            <SettingsButton onClick={connectMicrosoft}>Connect</SettingsButton>
          )}
        </div>
      </div>

      <div
        className="mt-6 rounded-xl border p-4 text-xs"
        style={{ borderColor: "var(--line-soft)", background: "var(--surface)", color: "var(--ink-faint)", lineHeight: 1.6 }}
      >
        <p className="mb-1 font-semibold" style={{ color: "var(--ink-soft)" }}>Setup required</p>
        <p>
          Calendar sync requires OAuth credentials to be configured by your administrator in the environment variables.
          Google needs <code style={{ fontFamily: "var(--f-mono)", background: "var(--surface-high)", padding: "1px 4px", borderRadius: 3 }}>GOOGLE_CLIENT_ID</code>,{" "}
          <code style={{ fontFamily: "var(--f-mono)", background: "var(--surface-high)", padding: "1px 4px", borderRadius: 3 }}>GOOGLE_CLIENT_SECRET</code>, and{" "}
          <code style={{ fontFamily: "var(--f-mono)", background: "var(--surface-high)", padding: "1px 4px", borderRadius: 3 }}>GOOGLE_REDIRECT_URI</code>.
          Microsoft needs <code style={{ fontFamily: "var(--f-mono)", background: "var(--surface-high)", padding: "1px 4px", borderRadius: 3 }}>MICROSOFT_CLIENT_ID</code>,{" "}
          <code style={{ fontFamily: "var(--f-mono)", background: "var(--surface-high)", padding: "1px 4px", borderRadius: 3 }}>MICROSOFT_CLIENT_SECRET</code>.
        </p>
      </div>
    </div>
  );
}
