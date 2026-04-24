import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { authFetch } from "../../lib/authFetch";
import { SettingsButton } from "./SettingsRow";
import GmailSetupModal from "./GmailSetupModal";
import GmailScanReviewModal, { type ScanResultItem } from "./GmailScanReviewModal";
import { useEntries } from "../../context/EntriesContext";
import { useBrain } from "../../context/BrainContext";

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

interface ScanDebug {
  sinceDate: string;
  totalGmailCount: number;
  emailsFetched: number;
  classified: number;
  created: number;
  skippedDuplicates: number;
  skippedSubjects: string[];
  insertErrors: number;
  tokenRefreshFailed: boolean;
  hasAnthropicKey: boolean;
  hasGeminiKey: boolean;
  repairedBrainId: number;
  attachmentsExtracted: number;
  subjects: string[];
  classifierUsed?: string;
  classifierError?: string;
  classifierModel?: string;
}

export default function GmailSyncTab({ isAdmin }: { isAdmin?: boolean }) {
  const { refreshEntries } = useEntries();
  const { activeBrain } = useBrain();
  const [integration, setIntegration] = useState<GmailIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [modalMode, setModalMode] = useState<"connect" | "edit" | null>(null);
  const [scanning, setScanning] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [lastDebug, setLastDebug] = useState<ScanDebug | null>(null);
  const [reviewItems, setReviewItems] = useState<ScanResultItem[]>([]);

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
      setMsg({
        text: `Connection failed: ${params.get("gmailError")!.replace(/_/g, " ")}.`,
        ok: false,
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
    fetchIntegration().finally(() => setLoading(false));
  }, []);

  async function handleConnect(preferences: { categories: string[]; custom: string }) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
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
    setIntegration((prev) => (prev ? { ...prev, preferences } : null));
    setMsg({ text: "Preferences saved.", ok: true });
  }

  async function handleScanNow() {
    setScanning(true);
    setMsg(null);
    setLastDebug(null);
    try {
      const r = await authFetch("/api/gmail?action=scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brain_id: activeBrain?.id ?? null }),
      });
      let data: any;
      try {
        data = await r?.json();
      } catch {
        /* non-JSON error body */
      }
      if (data?.debug) setLastDebug(data.debug);
      if (!r?.ok) {
        setMsg({ text: data?.error ?? "Scan failed. Please try again.", ok: false });
      } else {
        const created: number = data?.created ?? 0;
        if (created > 0 && Array.isArray(data?.entries) && data.entries.length > 0) {
          setReviewItems(data.entries);
          setMsg({
            text: `Scan complete — ${created} new item${created !== 1 ? "s" : ""} ready for review.`,
            ok: true,
          });
        } else {
          setMsg({
            text: created === 0 ? "Scan complete — no new items found." : `${created} new item${created !== 1 ? "s" : ""} flagged.`,
            ok: created > 0,
          });
        }
        await fetchIntegration();
        if (created > 0) await refreshEntries();
      }
    } catch (e: any) {
      setMsg({ text: `Scan failed: ${e?.message ?? "network error"}`, ok: false });
      await fetchIntegration();
      await refreshEntries();
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
    return (
      <div style={{ padding: "24px 0", color: "var(--ink-faint)", fontSize: 13 }}>Loading…</div>
    );
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
          padding: "18px 0",
          borderBottom: integration ? "1px solid var(--line-soft)" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusDot on={!!integration} />
          <div
            className="f-serif"
            style={{ fontSize: 13, color: "var(--ink-faint)", fontStyle: "italic" }}
          >
            {integration
              ? `Connected as ${integration.gmail_email ?? "unknown"} · last scan ${formatLastScan(integration.last_scanned_at)}`
              : "Scan your inbox for invoices, deadlines, and action items."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {integration ? (
            <>
              <SettingsButton onClick={handleScanNow} disabled={scanning}>
                {scanning ? "Scanning…" : "Scan now"}
              </SettingsButton>
              <SettingsButton onClick={() => setModalMode("edit")}>Preferences</SettingsButton>
              <SettingsButton onClick={handleDisconnect} disabled={disconnecting} danger>
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </SettingsButton>
            </>
          ) : (
            <SettingsButton onClick={() => setModalMode("connect")}>Connect</SettingsButton>
          )}
        </div>
        {scanning && (
          <div
            className="f-sans"
            style={{ marginTop: 8, fontSize: 12, color: "var(--ink-faint)", fontStyle: "italic" }}
          >
            Scanning Gmail — we'll notify you when it's done.
          </div>
        )}
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
          <div
            className="f-sans"
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--ink-faint)",
              marginBottom: 8,
            }}
          >
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

      {isAdmin && lastDebug && (
        <div
          className="f-sans"
          style={{
            marginTop: 16,
            padding: "14px 16px",
            borderRadius: 10,
            fontSize: 12,
            lineHeight: 1.7,
            background: "var(--surface)",
            border: "1px solid var(--line-soft)",
          }}
        >
          <div
            style={{
              fontWeight: 600,
              color: "var(--ink-soft)",
              marginBottom: 8,
              fontSize: 11,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Last scan diagnostics
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "2px 16px",
              color: "var(--ink-faint)",
            }}
          >
            <span style={{ color: "var(--ink-soft)" }}>Since</span>
            <span>{lastDebug.sinceDate}</span>
            <span style={{ color: "var(--ink-soft)" }}>Matched subject filter</span>
            <span>{lastDebug.totalGmailCount}</span>
            <span style={{ color: "var(--ink-soft)" }}>Emails fetched</span>
            <span style={{ color: lastDebug.emailsFetched === 0 ? "var(--blood)" : "var(--ink)" }}>
              {lastDebug.emailsFetched}
            </span>
            <span style={{ color: "var(--ink-soft)" }}>Flagged as important</span>
            <span>{lastDebug.classified}</span>
            <span style={{ color: "var(--ink-soft)" }}>Classified & ready for review</span>
            <span style={{ color: lastDebug.created > 0 ? "var(--moss)" : "var(--ink-faint)" }}>
              {lastDebug.created}
            </span>
            <span style={{ color: "var(--ink-soft)" }}>Skipped (duplicates)</span>
            <span>{lastDebug.skippedDuplicates}</span>
            {lastDebug.repairedBrainId > 0 && (
              <>
                <span style={{ color: "var(--moss)", fontWeight: 600 }}>Repaired</span>
                <span style={{ color: "var(--moss)" }}>
                  {lastDebug.repairedBrainId} orphaned gmail entr
                  {lastDebug.repairedBrainId === 1 ? "y" : "ies"} assigned to brain
                </span>
              </>
            )}
            <span style={{ color: "var(--ink-soft)" }}>Insert errors</span>
            <span
              style={{ color: lastDebug.insertErrors > 0 ? "var(--blood)" : "var(--ink-faint)" }}
            >
              {lastDebug.insertErrors}
            </span>
            <span style={{ color: "var(--ink-soft)" }}>Attachments extracted</span>
            <span>{lastDebug.attachmentsExtracted}</span>
            <span style={{ color: "var(--ink-soft)" }}>Anthropic key</span>
            <span style={{ color: lastDebug.hasAnthropicKey ? "var(--moss)" : "var(--blood)" }}>
              {lastDebug.hasAnthropicKey ? "present" : "MISSING"}
            </span>
            <span style={{ color: "var(--ink-soft)" }}>Gemini key</span>
            <span style={{ color: lastDebug.hasGeminiKey ? "var(--moss)" : "var(--blood)" }}>
              {lastDebug.hasGeminiKey ? "present" : "MISSING"}
            </span>
            {lastDebug.classifierUsed && (
              <>
                <span style={{ color: "var(--ink-soft)" }}>Classifier used</span>
                <span
                  style={{
                    color: lastDebug.classifierUsed === "none" ? "var(--blood)" : "var(--moss)",
                  }}
                >
                  {lastDebug.classifierUsed}
                  {lastDebug.classifierModel ? ` (${lastDebug.classifierModel})` : ""}
                </span>
              </>
            )}
            {lastDebug.classifierError && (
              <>
                <span style={{ color: "var(--blood)", fontWeight: 600 }}>Classifier error</span>
                <span style={{ color: "var(--blood)", wordBreak: "break-all" }}>
                  {lastDebug.classifierError}
                </span>
              </>
            )}
            {lastDebug.tokenRefreshFailed && (
              <>
                <span style={{ color: "var(--blood)", fontWeight: 600 }}>Token</span>
                <span style={{ color: "var(--blood)" }}>OAuth token refresh failed</span>
              </>
            )}
          </div>
          {lastDebug.skippedSubjects.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ color: "var(--ink-soft)", marginBottom: 4 }}>
                Already in Everion (skipped):
              </div>
              <ul style={{ margin: 0, padding: "0 0 0 16px", color: "var(--ink-faint)" }}>
                {lastDebug.skippedSubjects.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}


      {modalMode && (
        <GmailSetupModal
          mode={modalMode}
          initialPreferences={integration?.preferences}
          onClose={() => setModalMode(null)}
          onConnect={handleConnect}
          onSave={handleSavePreferences}
        />
      )}

      {reviewItems.length > 0 && (
        <GmailScanReviewModal
          items={reviewItems}
          onClose={() => setReviewItems([])}
        />
      )}
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  invoices: "Invoices & bills",
  "action-required": "Action required",
  "subscription-renewal": "Subscription renewals",
  appointment: "Bookings & appointments",
  deadline: "Deadlines",
  delivery: "Deliveries",
  "signing-requests": "Signing requests",
};
