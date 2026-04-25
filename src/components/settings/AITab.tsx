import { useState, useEffect, useCallback } from "react";
import ProvidersTab from "./ProvidersTab";
import SettingsRow, { SettingsButton, SettingsExpand } from "./SettingsRow";
import { authFetch } from "../../lib/authFetch";
import type { Brain } from "../../types";

interface Props {
  activeBrain?: Brain;
  isAdmin?: boolean;
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

interface DebugPayload {
  providers: { gemini: boolean; anthropic: boolean; gemini_model: string };
  brain_id: string;
  counts: {
    total: number;
    secrets: number;
    missing_parsed: number;
    missing_insight: number;
    missing_concepts: number;
    fully_pending: number;
    backfilled: number;
  };
  recent: Array<{
    id: string;
    title: string;
    type: string;
    created_at: string;
    flags: { parsed: boolean; has_insight: boolean; concepts_extracted: boolean; backfilled: boolean };
  }>;
  server_time: string;
}

export default function AITab({ activeBrain, isAdmin }: Props) {
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<{ processed: number; remaining: number } | null>(null);
  const [byokOpen, setByokOpen] = useState(false);

  // Admin-only diagnostic state
  const [diagOpen, setDiagOpen] = useState(false);
  const [debug, setDebug] = useState<DebugPayload | null>(null);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<{ cleared: number; scanned: number } | null>(null);

  const refreshDebug = useCallback(async () => {
    if (!activeBrain?.id || !isAdmin) return;
    setDebugLoading(true);
    setDebugError(null);
    try {
      const r = await authFetch(
        `/api/entries?action=enrich-debug&brain_id=${encodeURIComponent(activeBrain.id)}`,
      );
      if (!r.ok) {
        setDebugError(`HTTP ${r.status}`);
        return;
      }
      setDebug(await r.json());
    } catch (e: any) {
      setDebugError(String(e?.message ?? e));
    } finally {
      setDebugLoading(false);
    }
  }, [activeBrain?.id, isAdmin]);

  useEffect(() => {
    if (diagOpen) refreshDebug();
  }, [diagOpen, refreshDebug]);

  async function runEnrichNow() {
    if (!activeBrain?.id || enriching) return;
    setEnriching(true);
    setEnrichResult(null);
    try {
      const r = await authFetch(`/api/entries?action=enrich-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brain_id: activeBrain.id, batch_size: 10 }),
      });
      if (r.ok) setEnrichResult(await r.json());
    } finally {
      setEnriching(false);
      if (diagOpen) refreshDebug();
    }
  }

  async function clearBackfill() {
    if (!activeBrain?.id || clearing) return;
    setClearing(true);
    setClearResult(null);
    try {
      const r = await authFetch(`/api/entries?action=enrich-clear-backfill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brain_id: activeBrain.id }),
      });
      if (r.ok) setClearResult(await r.json());
    } finally {
      setClearing(false);
      refreshDebug();
    }
  }

  return (
    <div>
      <SettingsRow
        label="Provider"
        hint="powers enrichment, chat, and parsing — managed by Everion."
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StatusDot on />
          <span className="f-sans" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            Google Gemini
          </span>
        </div>
      </SettingsRow>

      <SettingsRow
        label="Auto-enrichment"
        hint="entries are enriched automatically after capture. cards show a pulsing dot while processing."
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StatusDot on />
          <SettingsButton onClick={runEnrichNow} disabled={enriching || !activeBrain?.id}>
            {enriching ? "Running…" : "Run now"}
          </SettingsButton>
        </div>
      </SettingsRow>
      {enrichResult && (
        <SettingsExpand open>
          <p
            className="f-sans"
            style={{ fontSize: 13, color: "var(--ink-soft)", margin: 0, lineHeight: 1.5 }}
          >
            Processed {enrichResult.processed}
            {enrichResult.remaining > 0
              ? ` · ${enrichResult.remaining} remaining`
              : " · all up to date"}
          </p>
        </SettingsExpand>
      )}

      {isAdmin && (
        <>
          <SettingsRow
            label="Diagnostics"
            hint="server-side enrichment state. only visible to you."
          >
            <SettingsButton onClick={() => setDiagOpen((v) => !v)}>
              {diagOpen ? "Hide" : "Show"}
            </SettingsButton>
          </SettingsRow>
          <SettingsExpand open={diagOpen}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <SettingsButton onClick={refreshDebug} disabled={debugLoading}>
                {debugLoading ? "Refreshing…" : "Refresh"}
              </SettingsButton>
              <SettingsButton onClick={clearBackfill} disabled={clearing || !activeBrain?.id}>
                {clearing ? "Clearing…" : "Clear backfill flags"}
              </SettingsButton>
            </div>
            {clearResult && (
              <p className="f-sans" style={{ fontSize: 12, color: "var(--moss)", margin: 0 }}>
                Cleared {clearResult.cleared} of {clearResult.scanned} backfilled entries — Run now will pick these up.
              </p>
            )}
            {debugError && (
              <p className="f-sans" style={{ fontSize: 12, color: "var(--blood)", margin: 0 }}>
                {debugError}
              </p>
            )}
            {debug && <DebugView debug={debug} />}
          </SettingsExpand>
        </>
      )}

      <SettingsRow
        label="Bring your own keys"
        hint="optional — connect anthropic, openai, gemini, or groq with your own api key."
        last={!byokOpen}
      >
        <SettingsButton onClick={() => setByokOpen((v) => !v)}>
          {byokOpen ? "Done" : "Manage"}
        </SettingsButton>
      </SettingsRow>
      <SettingsExpand open={byokOpen} last>
        <ProvidersTab activeBrain={activeBrain} />
      </SettingsExpand>
    </div>
  );
}

function DebugView({ debug }: { debug: DebugPayload }) {
  // Defensive: if the endpoint returns an unexpected shape (e.g. an upstream
  // route shadow returning the regular entries listing instead of the debug
  // payload), don't blow up the whole settings tab.
  if (!debug || !debug.providers || !debug.counts) {
    return (
      <p className="f-sans" style={{ fontSize: 12, color: "var(--blood)", margin: 0 }}>
        Diagnostics endpoint returned an unexpected shape. Check that the deploy
        is fresh and ADMIN_EMAIL is set in Vercel env. Raw payload:
        <code style={{ display: "block", marginTop: 6, fontSize: 11, color: "var(--ink-faint)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {JSON.stringify(debug).slice(0, 400)}
        </code>
      </p>
    );
  }

  const providers = debug.providers;
  const counts = debug.counts;
  const recent = debug.recent ?? [];

  const stat = (label: string, value: number, accent?: "warn" | "ok") => (
    <div
      className="f-sans"
      style={{
        background: "var(--surface-low)",
        border: "1px solid var(--line-soft)",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        color: "var(--ink-soft)",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink-faint)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 18,
          fontWeight: 500,
          color:
            accent === "warn"
              ? "var(--blood)"
              : accent === "ok"
                ? "var(--moss)"
                : "var(--ink)",
        }}
      >
        {value}
      </span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        className="f-sans"
        style={{
          fontSize: 12,
          color: "var(--ink-soft)",
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <span>
          Gemini key{" "}
          <strong style={{ color: providers.gemini ? "var(--moss)" : "var(--blood)" }}>
            {providers.gemini ? "present" : "MISSING"}
          </strong>
        </span>
        <span>
          Anthropic key{" "}
          <strong style={{ color: providers.anthropic ? "var(--moss)" : "var(--ink-faint)" }}>
            {providers.anthropic ? "present" : "absent"}
          </strong>
        </span>
        <span style={{ color: "var(--ink-faint)" }}>model · {providers.gemini_model}</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
          gap: 8,
        }}
      >
        {stat("Total", counts.total)}
        {stat("Pending", counts.fully_pending, counts.fully_pending > 0 ? "warn" : "ok")}
        {stat("Backfilled", counts.backfilled)}
        {stat("Missing parsed", counts.missing_parsed)}
        {stat("Missing insight", counts.missing_insight)}
        {stat("Missing concepts", counts.missing_concepts)}
      </div>

      <div className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)" }}>
        Latest {recent.length} entries · server time {debug.server_time ? new Date(debug.server_time).toLocaleTimeString() : "—"}
      </div>
      <div
        style={{
          border: "1px solid var(--line-soft)",
          borderRadius: 8,
          overflow: "hidden",
          background: "var(--surface-low)",
        }}
      >
        {recent.map((e, i) => (
          <div
            key={e.id}
            className="f-sans"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px 12px",
              borderTop: i === 0 ? "none" : "1px solid var(--line-soft)",
              fontSize: 12,
              color: "var(--ink-soft)",
            }}
          >
            <FlagPills flags={e.flags} />
            <span
              style={{
                flex: 1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                color: "var(--ink)",
              }}
            >
              {e.title || <em style={{ color: "var(--ink-faint)" }}>untitled</em>}
            </span>
            <span style={{ color: "var(--ink-faint)", fontSize: 11 }}>{e.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FlagPills({
  flags,
}: {
  flags: { parsed: boolean; has_insight: boolean; concepts_extracted: boolean; backfilled?: boolean };
}) {
  const pill = (label: string, on: boolean, title: string) => (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 16,
        height: 16,
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        fontFamily: "var(--f-mono)",
        background: on ? "color-mix(in oklch, var(--moss) 18%, transparent)" : "color-mix(in oklch, var(--blood) 14%, transparent)",
        color: on ? "var(--moss)" : "var(--blood)",
        letterSpacing: 0,
      }}
    >
      {label}
    </span>
  );
  return (
    <span style={{ display: "inline-flex", gap: 3, flexShrink: 0 }}>
      {pill("P", flags.parsed, "parsed")}
      {pill("I", flags.has_insight, "insight")}
      {pill("C", flags.concepts_extracted, "concepts")}
      {flags.backfilled && pill("B", true, "backfilled — not really enriched")}
    </span>
  );
}
