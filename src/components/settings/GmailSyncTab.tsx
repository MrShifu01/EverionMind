import { useState, useEffect, useRef } from "react";
import { authFetch } from "../../lib/authFetch";
import { SettingsButton } from "./SettingsRow";
import GmailSetupModal from "./GmailSetupModal";
import GmailScanReviewModal, { type ScanResultItem } from "./GmailScanReviewModal";
import GmailPatternRules from "./GmailPatternRules";
import { useEntries } from "../../context/EntriesContext";
import { useBrain } from "../../context/BrainContext";
import { useBackgroundOps } from "../../hooks/useBackgroundOps";
import { useAdminPrefs } from "../../lib/adminPrefs";
import { Button } from "../ui/button";
import { useCachedQuery, invalidateCachedQuery } from "../../lib/useCachedQuery";

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
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [modalMode, setModalMode] = useState<"connect" | "edit" | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [lastDebug, setLastDebug] = useState<ScanDebug | null>(null);
  const [reviewItems, setReviewItems] = useState<ScanResultItem[]>([]);

  const {
    data: integrationData,
    isLoading,
    mutate: mutateIntegration,
  } = useCachedQuery<GmailIntegration | null>("gmail:integration", async () => {
    const r = await authFetch("/api/gmail?action=integration");
    const d = await r?.json?.();
    return (d as GmailIntegration | null) ?? null;
  });
  const integration = integrationData ?? null;
  const loading = isLoading && integrationData === null;

  const { data: stagedData, refetch: refetchStaged } = useCachedQuery<number>(
    "gmail:staged-count",
    async () => {
      const r = await authFetch("/api/entries?staged=true");
      const d = await r?.json?.();
      const gmail = (d?.entries ?? []).filter(
        (e: { metadata?: { source?: string } }) => e.metadata?.source === "gmail",
      );
      return gmail.length;
    },
    { ttlMs: 60_000 },
  );
  const stagedCount = stagedData ?? 0;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmailConnected")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot URL-param surfacing on mount; the URL is then cleaned via replaceState.
      setMsg({ text: "Gmail connected successfully.", ok: true });
      window.history.replaceState({}, "", window.location.pathname);
      // Just back from OAuth — drop the cached integration so the post-connect
      // payload (gmail_email, prefs) shows up immediately.
      invalidateCachedQuery("gmail:integration");
    }
    if (params.get("gmailError")) {
      setMsg({
        text: `Connection failed: ${params.get("gmailError")!.replace(/_/g, " ")}.`,
        ok: false,
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // staged-changed events can fire many times during a Gmail scan (one per
  // batch of inserts). Coalesce them with a 1.5s trailing debounce so we
  // make at most one /api/entries?staged=true call per burst. The modal
  // open path now lives at the app root (Everion.tsx) — see
  // everion:open-gmail-inbox listener there.
  const stagedDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    function handleStagedChanged() {
      if (stagedDebounceRef.current) clearTimeout(stagedDebounceRef.current);
      stagedDebounceRef.current = setTimeout(() => {
        void refetchStaged();
        stagedDebounceRef.current = null;
      }, 1500);
    }
    window.addEventListener("everion:staged-changed", handleStagedChanged);
    return () => {
      window.removeEventListener("everion:staged-changed", handleStagedChanged);
      if (stagedDebounceRef.current) clearTimeout(stagedDebounceRef.current);
    };
  }, [refetchStaged]);

  async function handleConnect(preferences: { categories: string[]; custom: string }) {
    // POST with Authorization header so the Supabase bearer never lands in
    // the URL. Server validates auth, signs the OAuth state with the user
    // id baked in, and returns the Google authorise URL.
    const r = await authFetch("/api/gmail-auth?provider=google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences }),
    });
    if (!r.ok) {
      setMsg({ text: `Connection failed: HTTP ${r.status}`, ok: false });
      return;
    }
    const { redirect_url } = (await r.json()) as { redirect_url?: string };
    if (!redirect_url) {
      setMsg({ text: "Connection failed: missing redirect_url", ok: false });
      return;
    }
    window.location.href = redirect_url;
  }

  async function handleSavePreferences(preferences: { categories: string[]; custom: string }) {
    await authFetch("/api/gmail?action=preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences }),
    });
    mutateIntegration(integration ? { ...integration, preferences } : null);
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
    setTimeout(() => {
      invalidateCachedQuery("gmail:integration");
      refreshEntries();
    }, 8000);
    setTimeout(() => {
      invalidateCachedQuery("gmail:integration");
      refreshEntries();
    }, 30000);
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    await authFetch("/api/gmail", { method: "DELETE" }).catch(() => null);
    mutateIntegration(null);
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
            ? (integration.gmail_email ?? "unknown")
            : "Scan your inbox for invoices, deadlines, and action items."
        }
        detail={
          integration ? `Last scan ${formatLastScan(integration.last_scanned_at)}` : undefined
        }
      >
        {integration ? (
          <>
            <SettingsButton onClick={handleScanNow} disabled={scanning}>
              {scanning ? "Scanning…" : "Scan now"}
            </SettingsButton>
            <SettingsButton
              onClick={() => window.dispatchEvent(new CustomEvent("everion:open-gmail-inbox"))}
            >
              Inbox{stagedCount > 0 ? ` (${stagedCount})` : ""}
            </SettingsButton>
            <SettingsButton onClick={() => setModalMode("edit")}>Preferences</SettingsButton>
            <DisconnectButton onClick={handleDisconnect} disabled={disconnecting} />
          </>
        ) : (
          <SettingsButton onClick={() => setModalMode("connect")}>Connect Gmail</SettingsButton>
        )}
      </IntegrationRow>

      {integration && <GmailPatternRules />}

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
            void refetchStaged();
            refreshEntries();
            authFetch("/api/notifications?type=gmail_review", { method: "DELETE" }).catch(() => {});
          }}
        />
      )}

      {/* Staging inbox modal hoisted to Everion.tsx root — opened via the
          everion:open-gmail-inbox event from anywhere in the app. */}

      {/* Admin-only: live Gmail classifier prompt + KEEP/SKIP rule learnings.
          Behind a separate adminPref so it stays out of the way unless
          turned on in the Admin tab. */}
      {isAdmin && adminPrefs.showGmailPromptDebug && integration && (
        <GmailPromptDebug staged={stagedCount} />
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
          <span
            className="f-sans"
            style={{ fontSize: 12, color: "var(--ink-faint)", marginLeft: 2 }}
          >
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
    <Button
      type="button"
      onClick={onClick}
      disabled={!!disabled}
      variant="ghost"
      size="sm"
      className="ml-auto"
      style={{ color: "var(--blood)" }}
    >
      {disabled ? "Disconnecting…" : "Disconnect"}
    </Button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GmailPromptDebug — live KEEP / SKIP rule learnings panel.
//
// Mirrors PersonaPromptDebug. Calls GET /api/entries?action=gmail-prompt
// (admin-only on the server) and shows the user's distilled accept/reject
// summaries plus the most recent specific decisions. Manual "Distill now"
// button regenerates both summaries on demand. Auto-refreshes whenever the
// staging count changes (proxy for "decisions just happened").
// ─────────────────────────────────────────────────────────────────────────────

interface GmailPromptPayload {
  connected: boolean;
  acceptedSummary: string | null;
  rejectedSummary: string | null;
  summaryUpdatedAt: string | null;
  recentAccepts: Array<{ subject: string; from: string; reason: string | null }>;
  recentRejects: Array<{ subject: string; from: string; reason: string | null }>;
  counts: { accepts: number; rejects: number };
  prompt: string | null;
  // Server fired a catch-up distill because counts >= threshold but a
  // summary is missing. UI shows "Distilling…" and auto-reloads.
  pending_distill?: boolean;
}

function GmailPromptDebug({ staged }: { staged: number }): React.ReactElement {
  const [data, setData] = useState<GmailPromptPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Plain useState toggle. Replaced shadcn Accordion (which clipped async
  // content via Radix's `--radix-accordion-content-height` variable + the
  // wrapper's `overflow-hidden`). Symptom: panel rendered at the size it had
  // when first opened, never expanded as data loaded — close + reopen would
  // re-measure and reveal a bit more each cycle. This pattern doesn't animate,
  // doesn't clip, and renders content at its natural height every time.
  const [expanded, setExpanded] = useState(false);
  const [distilling, setDistilling] = useState(false);
  const [distillMsg, setDistillMsg] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await authFetch("/api/entries?action=gmail-prompt");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as GmailPromptPayload;
      setData(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (expanded) load();
  }, [expanded, staged]);

  // If the panel is open and the server told us it kicked off a catch-up
  // distill, poll once after ~12s so the summary appears without a manual
  // refresh. Distill runs Gemini Flash → typically 4-8s end-to-end.
  const pendingDistill = data?.pending_distill;
  useEffect(() => {
    if (!expanded || !pendingDistill) return;
    const t = setTimeout(() => {
      load();
    }, 12_000);
    return () => clearTimeout(t);
  }, [expanded, pendingDistill]);

  async function distill() {
    setDistilling(true);
    setDistillMsg(null);
    try {
      const r = await authFetch("/api/entries?action=distill-gmail", { method: "POST" });
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.ok) {
        setDistillMsg(`Failed: ${json?.reason ?? `HTTP ${r.status}`}`);
        return;
      }
      const accepts = json.accept_count ?? 0;
      const rejects = json.reject_count ?? 0;
      setDistillMsg(`Distilled ${accepts} accepts + ${rejects} rejects.`);
      await load();
    } catch (e) {
      setDistillMsg(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDistilling(false);
    }
  }

  return (
    <div style={{ marginTop: 32, paddingTop: 18, borderTop: "1px dashed var(--line)" }}>
      <button
        type="button"
        className="press"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "8px 4px",
          background: "transparent",
          border: 0,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            width: 14,
            height: 14,
            color: "var(--ember)",
            transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 200ms cubic-bezier(.16,1,.3,1)",
            flexShrink: 0,
          }}
        >
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path
              d="M1 1L5 5L9 1"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span
          className="f-mono"
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ember)",
          }}
        >
          Admin · live gmail prompt
        </span>
        <span
          className="f-sans"
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "var(--ink-faint)",
            fontStyle: "italic",
          }}
        >
          watch the classifier learn
        </span>
      </button>
      {expanded && (
        <div className="pb-0">
          <div
            style={{
              marginTop: 12,
              padding: 16,
              background: "var(--surface-low)",
              border: "1px solid var(--line-soft)",
              borderRadius: 12,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {loading && !data && (
              <p className="f-mono" style={{ margin: 0, fontSize: 12, color: "var(--ink-faint)" }}>
                loading…
              </p>
            )}
            {err && (
              <p className="f-mono" style={{ margin: 0, fontSize: 12, color: "var(--blood)" }}>
                error: {err}
              </p>
            )}
            {data && (
              <>
                <div
                  className="f-sans"
                  style={{
                    fontSize: 11,
                    color: "var(--ink-faint)",
                    display: "flex",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <span>
                    <strong style={{ color: "var(--moss)" }}>{data.counts.accepts}</strong> accepts
                  </span>
                  <span>
                    <strong style={{ color: "var(--blood)" }}>{data.counts.rejects}</strong> rejects
                  </span>
                  {data.summaryUpdatedAt && (
                    <span>
                      updated{" "}
                      {new Date(data.summaryUpdatedAt).toLocaleString(undefined, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>

                <SummaryBlock
                  label={`KEEP rules (${data.counts.accepts})`}
                  color="var(--moss)"
                  value={data.acceptedSummary}
                  pending={!!data.pending_distill && data.counts.accepts >= 3}
                  emptyText={
                    data.counts.accepts >= 3
                      ? "Summary missing — distill should have run. Click Distill now."
                      : `Need ${3 - data.counts.accepts} more accept${
                          data.counts.accepts === 2 ? "" : "s"
                        } to auto-summarize. Accept a few emails the user-style way.`
                  }
                />

                <SummaryBlock
                  label={`SKIP rules (${data.counts.rejects})`}
                  color="var(--blood)"
                  value={data.rejectedSummary}
                  pending={!!data.pending_distill && data.counts.rejects >= 3}
                  emptyText={
                    data.counts.rejects >= 3
                      ? "Summary missing — distill should have run. Click Distill now."
                      : `Need ${3 - data.counts.rejects} more reject${
                          data.counts.rejects === 2 ? "" : "s"
                        } to auto-summarize. Swipe-left a few noisy emails.`
                  }
                />

                <RecentList
                  label={`Recent kept (${data.recentAccepts.length})`}
                  items={data.recentAccepts}
                  emptyText="No recent accepts."
                />
                <RecentList
                  label={`Recent skipped (${data.recentRejects.length})`}
                  items={data.recentRejects}
                  emptyText="No recent rejects."
                />

                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <Button
                    type="button"
                    onClick={distill}
                    disabled={distilling}
                    variant="outline"
                    size="sm"
                    style={{
                      background: "var(--ember-wash)",
                      color: "var(--ember)",
                      borderColor: "color-mix(in oklch, var(--ember) 30%, transparent)",
                    }}
                  >
                    {distilling ? "Distilling…" : "Distill now"}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => load()}
                    disabled={loading}
                    variant="outline"
                    size="sm"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {loading ? "Refreshing…" : "Refresh"}
                  </Button>
                  {data.prompt && (
                    <Button
                      type="button"
                      onClick={() => setShowRaw((v) => !v)}
                      variant="outline"
                      size="sm"
                      style={{
                        color: showRaw ? "var(--ember)" : "var(--ink-soft)",
                        borderColor: showRaw ? "var(--ember)" : "var(--line-soft)",
                      }}
                    >
                      {showRaw ? "Hide raw prompt" : "Show raw prompt"}
                    </Button>
                  )}
                  {data.prompt && (
                    <span
                      className="f-sans"
                      style={{ fontSize: 11, color: "var(--ink-faint)", marginLeft: "auto" }}
                    >
                      {data.prompt.length.toLocaleString()} chars
                    </span>
                  )}
                  {distillMsg && (
                    <span
                      className="f-sans"
                      style={{
                        fontSize: 11,
                        fontStyle: "italic",
                        color: distillMsg.startsWith("Failed")
                          ? "var(--blood)"
                          : "var(--ink-faint)",
                        width: "100%",
                      }}
                    >
                      {distillMsg}
                    </span>
                  )}
                </div>

                {showRaw && data.prompt && (
                  <pre
                    className="f-mono"
                    style={{
                      margin: 0,
                      padding: 12,
                      background: "var(--surface)",
                      border: "1px solid var(--line-soft)",
                      borderRadius: 8,
                      fontSize: 11,
                      color: "var(--ink-soft)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      maxHeight: 480,
                      overflowY: "auto",
                      lineHeight: 1.55,
                    }}
                  >
                    {data.prompt}
                  </pre>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryBlock({
  label,
  color,
  value,
  emptyText,
  pending,
}: {
  label: string;
  color: string;
  value: string | null;
  emptyText: string;
  pending?: boolean;
}): React.ReactElement {
  return (
    <div>
      <div
        className="f-sans"
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {value ? (
        <pre
          className="f-mono"
          style={{
            margin: 0,
            padding: 10,
            background: "var(--surface)",
            border: "1px solid var(--line-soft)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--ink-soft)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            lineHeight: 1.55,
          }}
        >
          {value}
        </pre>
      ) : pending ? (
        <div
          className="f-sans"
          style={{
            margin: 0,
            padding: 10,
            background: "var(--surface)",
            border: "1px dashed var(--ember)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--ember)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              border: "2px solid currentColor",
              borderTopColor: "transparent",
              animation: "spin 0.8s linear infinite",
              display: "inline-block",
            }}
          />
          Distilling now — refreshing in a moment…
        </div>
      ) : (
        <div
          className="f-sans"
          style={{
            margin: 0,
            padding: 10,
            background: "var(--surface)",
            border: "1px solid var(--line-soft)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--ink-soft)",
            lineHeight: 1.55,
          }}
        >
          {emptyText}
        </div>
      )}
    </div>
  );
}

function RecentList({
  label,
  items,
  emptyText,
}: {
  label: string;
  items: Array<{ subject: string; from: string; reason: string | null }>;
  emptyText: string;
}): React.ReactElement {
  return (
    <div>
      <div
        className="f-sans"
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink-faint)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {items.length === 0 ? (
        <div
          className="f-serif"
          style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-faint)" }}
        >
          {emptyText}
        </div>
      ) : (
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {items.map((it, i) => (
            <li
              key={i}
              className="f-mono"
              style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.5 }}
            >
              <span style={{ color: "var(--ink-faint)" }}>{it.from}</span> — {it.subject}
              {it.reason && (
                <span style={{ color: "var(--ink-faint)", fontStyle: "italic" }}>
                  {" — "}
                  {it.reason}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
