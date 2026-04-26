import { useAdminPrefs } from "../../lib/adminPrefs";

interface GapDetail {
  id: string;
  title: string;
  gaps: string[];
}
interface EnrichError {
  step: string;
  message: string;
}
interface EnrichLogEntry {
  ts: number;
  level: "info" | "error";
  message: string;
}
interface EnrichingEntry {
  idx: number;
  total: number;
  title: string;
  phase: string;
}

interface EnrichmentTabProps {
  unenrichedDetails: GapDetail[];
  enriching: boolean;
  enrichProgress: { done: number; total: number } | null;
  enrichErrors?: { id: string; title: string; errors: EnrichError[] }[];
  enrichCurrentEntry?: EnrichingEntry | null;
  enrichLog?: EnrichLogEntry[];
  isAdmin?: boolean;
  runBulkEnrich: () => Promise<void>;
}

const GAP_META: { key: string; label: string; description: string }[] = [
  { key: "embedding", label: "Embedding", description: "Vector embedding for semantic search" },
  { key: "concepts", label: "Concepts", description: "Knowledge graph connections" },
  { key: "parsed", label: "AI Parsing", description: "Structured metadata extracted by AI" },
  { key: "insight", label: "Insight", description: "AI-generated insight summary" },
];

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export default function EnrichmentTab({
  unenrichedDetails,
  enriching,
  enrichProgress,
  enrichErrors = [],
  enrichCurrentEntry = null,
  enrichLog = [],
  isAdmin = false,
  runBulkEnrich,
}: EnrichmentTabProps) {
  const adminPrefs = useAdminPrefs();
  const total = unenrichedDetails.length;
  const allDone = total === 0 && !enriching;

  const gapCounts = Object.fromEntries(
    GAP_META.map(({ key }) => [key, unenrichedDetails.filter((d) => d.gaps.includes(key)).length]),
  );

  const progressPct = enrichProgress
    ? Math.round((enrichProgress.done / enrichProgress.total) * 100)
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Status card */}
      <div
        className="rounded-2xl border"
        style={{
          background: "var(--surface)",
          borderColor: "var(--line-soft)",
          overflow: "hidden",
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: allDone ? "none" : "1px solid var(--line-soft)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: allDone ? "var(--moss)" : "var(--ember)",
                flexShrink: 0,
              }}
            />
            <span className="f-sans" style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
              {allDone
                ? "All entries fully enriched"
                : `${total} entr${total === 1 ? "y" : "ies"} need enrichment`}
            </span>
          </div>
          {!allDone && (
            <span
              className="f-sans"
              style={{
                fontSize: 11,
                color: "var(--ink-ghost)",
                background: "var(--surface-high)",
                borderRadius: 999,
                padding: "2px 10px",
              }}
            >
              {unenrichedDetails.length} / {unenrichedDetails.length + (enrichProgress?.done ?? 0)}{" "}
              remaining
            </span>
          )}
        </div>

        {/* Per-gap breakdown */}
        {!allDone && (
          <div style={{ padding: "4px 0 8px" }}>
            {GAP_META.map(({ key, label, description }) => {
              const count = gapCounts[key] ?? 0;
              return (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 20px",
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: count > 0 ? "var(--ember)" : "var(--moss)",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span
                      className="f-sans"
                      style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-soft)" }}
                    >
                      {label}
                    </span>
                    <span
                      className="f-sans"
                      style={{ fontSize: 11, color: "var(--ink-ghost)", marginLeft: 6 }}
                    >
                      {description}
                    </span>
                  </div>
                  <span
                    className="f-sans"
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: count > 0 ? "var(--ember)" : "var(--ink-ghost)",
                      minWidth: 28,
                      textAlign: "right",
                    }}
                  >
                    {count > 0 ? count : "✓"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Progress bar — shown while enriching, replaces the button */}
      {enriching && enrichProgress && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span
              className="f-sans"
              style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)" }}
            >
              Enriching…
            </span>
            <span className="f-sans" style={{ fontSize: 12, color: "var(--ink-ghost)" }}>
              {enrichProgress.done} / {enrichProgress.total}
            </span>
          </div>
          <div
            style={{
              height: 4,
              borderRadius: 999,
              background: "var(--line-soft)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressPct}%`,
                background: "var(--ember)",
                borderRadius: 999,
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>
      )}

      {/* Enrich Now button — hidden while enriching */}
      {!allDone && !enriching && (
        <button
          onClick={runBulkEnrich}
          disabled={total === 0}
          className="f-sans"
          style={{
            alignSelf: "flex-start",
            padding: "9px 20px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            background: "var(--ember)",
            color: "var(--ember-ink)",
            cursor: "pointer",
            border: "none",
          }}
        >
          {`Enrich ${total} entr${total === 1 ? "y" : "ies"} now`}
        </button>
      )}

      {allDone && (
        <p className="f-sans" style={{ fontSize: 13, color: "var(--ink-ghost)" }}>
          New entries are enriched automatically in the background. Come back here if you ever see
          gaps.
        </p>
      )}

      {/* ── Admin debug panel ───────────────────────────────────────────── */}
      {isAdmin && adminPrefs.showEnrichmentAdminExtras && (
        <div
          style={{
            borderRadius: 10,
            border: "1px solid var(--line-soft)",
            background: "var(--surface-high)",
            overflow: "hidden",
          }}
        >
          {/* Panel header */}
          <div
            style={{
              padding: "8px 14px",
              borderBottom: "1px solid var(--line-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span
              className="f-sans"
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--ink-ghost)",
              }}
            >
              Admin · Enrichment Debug
            </span>
            {enrichErrors.length > 0 && (
              <span
                className="f-sans"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--blood)",
                  background: "var(--blood-wash)",
                  borderRadius: 999,
                  padding: "2px 8px",
                }}
              >
                {enrichErrors.length} error{enrichErrors.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Live current entry (while enriching) */}
          {enriching && enrichCurrentEntry && (
            <div
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid var(--line-soft)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              {/* Pulsing dot */}
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "var(--ember)",
                  flexShrink: 0,
                  animation: "pulse 1.2s ease-in-out infinite",
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span
                  className="f-sans"
                  style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}
                >
                  {enrichCurrentEntry.title}
                </span>
                <span
                  className="f-sans"
                  style={{ fontSize: 11, color: "var(--ink-ghost)", marginLeft: 8 }}
                >
                  {enrichCurrentEntry.idx}/{enrichCurrentEntry.total} · {enrichCurrentEntry.phase}
                </span>
              </div>
            </div>
          )}

          {/* Error list */}
          {enrichErrors.length > 0 && (
            <div
              style={{
                padding: "10px 14px",
                borderBottom: enrichLog.length > 0 ? "1px solid var(--line-soft)" : "none",
              }}
            >
              {enrichErrors.map(({ id, title, errors }) => (
                <div
                  key={id}
                  style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 8 }}
                >
                  <span
                    className="f-sans"
                    style={{ fontSize: 12, fontWeight: 600, color: "var(--blood)" }}
                  >
                    {title}
                  </span>
                  {errors.map((e, i) => (
                    <div key={i} style={{ display: "flex", gap: 7, alignItems: "baseline" }}>
                      <span
                        className="f-sans"
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--blood)",
                          background: "var(--blood-wash)",
                          borderRadius: 3,
                          padding: "1px 5px",
                          flexShrink: 0,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {e.step}
                      </span>
                      <span
                        className="f-sans"
                        style={{
                          fontSize: 11,
                          color: "var(--ink-faint)",
                          fontFamily: "var(--f-mono)",
                          wordBreak: "break-all",
                        }}
                      >
                        {e.message}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Event log */}
          {enrichLog.length > 0 ? (
            <div
              style={{
                maxHeight: 200,
                overflowY: "auto",
                padding: "8px 0",
              }}
            >
              {enrichLog.map((entry, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 8,
                    padding: "2px 14px",
                    alignItems: "baseline",
                  }}
                >
                  <span
                    className="f-sans"
                    style={{
                      fontSize: 10,
                      color: "var(--ink-ghost)",
                      fontFamily: "var(--f-mono)",
                      flexShrink: 0,
                      userSelect: "none",
                    }}
                  >
                    {fmtTime(entry.ts)}
                  </span>
                  <span
                    className="f-sans"
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      flexShrink: 0,
                      userSelect: "none",
                      color: entry.level === "error" ? "var(--blood)" : "var(--ink-ghost)",
                    }}
                  >
                    {entry.level === "error" ? "ERR" : "   "}
                  </span>
                  <span
                    className="f-sans"
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--f-mono)",
                      color: entry.level === "error" ? "var(--blood)" : "var(--ink-soft)",
                      wordBreak: "break-all",
                    }}
                  >
                    {entry.message}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: "12px 14px" }}>
              <span
                className="f-sans"
                style={{ fontSize: 11, color: "var(--ink-ghost)", fontFamily: "var(--f-mono)" }}
              >
                {enriching ? "Running…" : "No log yet — run enrichment to see events here."}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
