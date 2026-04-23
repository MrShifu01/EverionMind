import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { authFetch } from "../../lib/authFetch";
import { SettingsButton } from "./SettingsRow";
import GmailSetupModal from "./GmailSetupModal";

interface GmailIntegration {
  id: string;
  gmail_email: string | null;
  scan_enabled: boolean;
  last_scanned_at: string | null;
  preferences: { categories: string[]; custom: string };
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

function GmailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M2 6C2 4.9 2.9 4 4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6Z" fill="#EA4335" fillOpacity="0.15" stroke="#EA4335" strokeWidth="1.5"/>
      <path d="M2 6L12 13L22 6" stroke="#EA4335" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function formatLastScan(ts: string | null): string {
  if (!ts) return "Never scanned";
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function GmailSyncTab() {
  const [integration, setIntegration] = useState<GmailIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [modalMode, setModalMode] = useState<"connect" | "edit" | null>(null);
  const [scanning, setScanning] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  function fetchIntegration() {
    return authFetch("/api/gmail?action=integration")
      .then((r) => r?.json?.())
      .then((d) => setIntegration(d ?? null))
      .catch(() => null);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmailConnected")) {
      setMsg({ text: "Gmail connected successfully.", ok: true });
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("gmailError")) {
      setMsg({ text: `Connection failed: ${params.get("gmailError")!.replace(/_/g, " ")}.`, ok: false });
      window.history.replaceState({}, "", window.location.pathname);
    }
    fetchIntegration().finally(() => setLoading(false));
  }, []);

  async function handleConnect(preferences: { categories: string[]; custom: string }) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    const prefs = encodeURIComponent(JSON.stringify(preferences));
    window.location.href = `/api/gmail-auth?provider=google&token=${encodeURIComponent(token)}&prefs=${prefs}`;
  }

  async function handleSavePreferences(preferences: { categories: string[]; custom: string }) {
    await authFetch("/api/gmail?action=preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences }),
    });
    setIntegration((prev) => prev ? { ...prev, preferences } : null);
    setMsg({ text: "Preferences saved.", ok: true });
  }

  async function handleScanNow() {
    setScanning(true);
    setMsg(null);
    try {
      const r = await authFetch("/api/gmail?action=scan", { method: "POST" });
      const data = await r?.json?.();
      const created: number = data?.created ?? 0;
      setMsg({ text: created === 0 ? "No new items found." : `${created} new item${created !== 1 ? "s" : ""} flagged.`, ok: true });
      await fetchIntegration();
    } catch {
      setMsg({ text: "Scan failed. Please try again.", ok: false });
    } finally {
      setScanning(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    await authFetch("/api/gmail", { method: "DELETE" }).catch(() => null);
    setIntegration(null);
    setDisconnecting(false);
    setMsg({ text: "Gmail disconnected.", ok: false });
  }

  if (loading) {
    return <div style={{ padding: "24px 0", color: "var(--ink-faint)", fontSize: 13 }}>Loading…</div>;
  }

  return (
    <div>
      {msg && (
        <div
          className="f-sans"
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 13,
            background: msg.ok ? "var(--moss-wash)" : "var(--blood-wash)",
            color: msg.ok ? "var(--moss)" : "var(--blood)",
            border: `1px solid ${msg.ok ? "var(--moss)" : "var(--blood)"}`,
          }}
        >
          {msg.text}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          padding: "18px 0",
          borderBottom: integration ? "1px solid var(--line-soft)" : "none",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="f-serif" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 450, color: "var(--ink)" }}>
            <StatusDot on={!!integration} />
            <GmailIcon />
            <span>Gmail</span>
          </div>
          <div className="f-serif" style={{ fontSize: 13, color: "var(--ink-faint)", fontStyle: "italic", marginTop: 3 }}>
            {integration
              ? `Connected as ${integration.gmail_email ?? "unknown"} · last scan ${formatLastScan(integration.last_scanned_at)}`
              : "Scan your inbox for invoices, deadlines, and action items."}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {integration ? (
            <>
              <SettingsButton onClick={handleScanNow} disabled={scanning}>
                {scanning ? "Scanning…" : "Scan now"}
              </SettingsButton>
              <SettingsButton onClick={() => setModalMode("edit")}>
                Preferences
              </SettingsButton>
              <SettingsButton onClick={handleDisconnect} disabled={disconnecting} danger>
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </SettingsButton>
            </>
          ) : (
            <SettingsButton onClick={() => setModalMode("connect")}>Connect</SettingsButton>
          )}
        </div>
      </div>

      {/* Active categories summary */}
      {integration && integration.preferences.categories.length > 0 && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            background: "var(--surface)",
            border: "1px solid var(--line-soft)",
            marginTop: 12,
          }}
        >
          <div className="f-sans" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: 8 }}>
            Monitoring
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {integration.preferences.categories.map((cat) => (
              <span
                key={cat}
                className="f-sans"
                style={{
                  fontSize: 12,
                  padding: "3px 10px",
                  borderRadius: 999,
                  background: "var(--surface-high)",
                  color: "var(--ink-soft)",
                  border: "1px solid var(--line-soft)",
                }}
              >
                {CATEGORY_LABELS[cat] ?? cat}
              </span>
            ))}
            {integration.preferences.custom && (
              <span
                className="f-sans"
                style={{
                  fontSize: 12,
                  padding: "3px 10px",
                  borderRadius: 999,
                  background: "var(--surface-high)",
                  color: "var(--ink-soft)",
                  border: "1px dashed var(--line-soft)",
                  fontStyle: "italic",
                }}
              >
                + custom
              </span>
            )}
          </div>
        </div>
      )}

      <div
        className="f-sans"
        style={{
          marginTop: 16,
          padding: "12px 14px",
          borderRadius: 10,
          fontSize: 12,
          color: "var(--ink-faint)",
          lineHeight: 1.6,
          background: "var(--surface)",
          border: "1px solid var(--line-soft)",
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--ink-soft)" }}>Setup required — </span>
        Gmail scanning uses the same Google OAuth credentials as Calendar. Ensure{" "}
        <code style={{ fontFamily: "var(--f-mono)", background: "var(--surface-high)", padding: "1px 4px", borderRadius: 3 }}>GOOGLE_CLIENT_ID</code> and{" "}
        <code style={{ fontFamily: "var(--f-mono)", background: "var(--surface-high)", padding: "1px 4px", borderRadius: 3 }}>GOOGLE_CLIENT_SECRET</code> are set, and that the Gmail API is enabled in Google Cloud Console with the redirect URI{" "}
        <code style={{ fontFamily: "var(--f-mono)", background: "var(--surface-high)", padding: "1px 4px", borderRadius: 3 }}>GMAIL_REDIRECT_URI</code> registered.
        Scans run automatically once daily.
      </div>

      {modalMode && (
        <GmailSetupModal
          mode={modalMode}
          initialPreferences={integration?.preferences}
          onClose={() => setModalMode(null)}
          onConnect={handleConnect}
          onSave={handleSavePreferences}
        />
      )}
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  "invoices":             "Invoices & bills",
  "action-required":      "Action required",
  "subscription-renewal": "Subscription renewals",
  "appointment":          "Bookings & appointments",
  "deadline":             "Deadlines",
  "delivery":             "Deliveries",
  "signing-requests":     "Signing requests",
};
