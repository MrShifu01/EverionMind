import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { authFetch } from "../../lib/authFetch";
import { SettingsButton } from "./SettingsRow";
import GmailSetupModal from "./GmailSetupModal";
import GmailScanReviewModal, { type ScanResultItem } from "./GmailScanReviewModal";
import GmailStagingInbox from "./GmailStagingInbox";
import { useEntries } from "../../context/EntriesContext";
import { useBrain } from "../../context/BrainContext";
import { useBackgroundOps } from "../../hooks/useBackgroundOps";
import { useAdminPrefs } from "../../lib/adminPrefs";

interface GmailIntegration {
  id: string;
  gmail_email: string | null;
  scan_enabled: boolean;
  last_scanned_at: string | null;
  preferences: { categories: string[]; custom: string };
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
  const ops = useBackgroundOps();
  const adminPrefs = useAdminPrefs();
  // Gmail scan is global: brain-agnostic at the kind level so we don't double-fire
  // if the user changes brains mid-scan.
  const scanning = ops.isRunning("gmail-scan");
  const [integration, setIntegration] = useState<GmailIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [modalMode, setModalMode] = useState<"connect" | "edit" | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [lastDebug, setLastDebug] = useState<ScanDebug | null>(null);
  const [reviewItems, setReviewItems] = useState<ScanResultItem[]>([]);
  const [stagedCount, setStagedCount] = useState(0);
  const [showStagingInbox, setShowStagingInbox] = useState(false);

  function fetchStagedCount() {
    authFetch("/api/entries?staged=true")
      .then((r) => r?.json?.())
      .then((d) => {
        const gmail = (d?.entries ?? []).filter((e: any) => e.metadata?.source === "gmail");
        setStagedCount(gmail.length);
      })
      .catch(() => {});
  }

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
    fetchStagedCount();
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

  function handleScanNow() {
    if (scanning) return;
    setMsg(null);
    setLastDebug(null);
    ops.startTask({
      kind: "gmail-scan",
      label: "Scanning Gmail for new items",
      resumeKey: activeBrain?.id ?? "",
    });
    // Refresh integration + entries shortly after the task likely completes,
    // and again later as a safety net for slower scans. The runner reports
    // success/failure in the toast; new staged items show in the inbox below.
    setTimeout(() => { fetchIntegration(); refreshEntries(); }, 8000);
    setTimeout(() => { fetchIntegration(); refreshEntries(); }, 30000);
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
            marginBottom: 12,
            padding: "9px 12px",
            borderRadius: 8,
            fontSize: 12,
            background: msg.ok ? "var(--moss-wash)" : "var(--blood-wash)",
            color: msg.ok ? "var(--moss)" : "var(--blood)",
            border: `1px solid ${msg.ok ? "var(--moss)" : "var(--blood)"}`,
          }}
        >
          {msg.text}
        </div>
      )}

      <IntegrationRow
        connected={!!integration}
        label={
          integration
            ? integration.gmail_email ?? "unknown"
            : "Scan your inbox for invoices, deadlines, and action items."
        }
        detail={integration ? `Last scan ${formatLastScan(integration.last_scanned_at)}` : undefined}
      >
        {integration ? (
          <>
            <SettingsButton onClick={handleScanNow} disabled={scanning}>
              {scanning ? "Scanning…" : "Scan now"}
            </SettingsButton>
            <SettingsButton onClick={() => setShowStagingInbox(true)}>
              Inbox{stagedCount > 0 ? ` (${stagedCount})` : ""}
            </SettingsButton>
            <SettingsButton onClick={() => setModalMode("edit")}>Preferences</SettingsButton>
            <DisconnectButton onClick={handleDisconnect} disabled={disconnecting} />
          </>
        ) : (
          <SettingsButton onClick={() => setModalMode("connect")}>Connect Gmail</SettingsButton>
        )}
      </IntegrationRow>

      {isAdmin && adminPrefs.showGmailScanDebug && lastDebug && (
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
          onClose={() => {
            setReviewItems([]);
            fetchStagedCount();
            refreshEntries();
            authFetch("/api/notifications?type=gmail_review", { method: "DELETE" }).catch(() => {});
          }}
        />
      )}

      {showStagingInbox && (
        <GmailStagingInbox
          onClose={() => { setShowStagingInbox(false); refreshEntries(); }}
          onCountChange={setStagedCount}
        />
      )}
    </div>
  );
}

export function IntegrationRow({
  connected,
  label,
  detail,
  children,
}: {
  connected: boolean;
  label: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ paddingBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: connected ? "var(--moss)" : "var(--ink-ghost)",
            flexShrink: 0,
          }}
        />
        <span className="f-sans" style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>
          {label}
        </span>
        {detail && (
          <span className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)", marginLeft: 2 }}>
            · {detail}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {children}
      </div>
    </div>
  );
}

export function DisconnectButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!!disabled}
      className="press f-sans"
      style={{
        marginLeft: "auto",
        height: 32,
        padding: "0 10px",
        fontSize: 12,
        fontWeight: 500,
        borderRadius: 8,
        background: "transparent",
        color: "var(--blood)",
        border: "1px solid transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {disabled ? "Disconnecting…" : "Disconnect"}
    </button>
  );
}
