interface GapDetail { id: string; title: string; gaps: string[] }
interface EnrichError { step: string; message: string }

interface EnrichmentTabProps {
  unenrichedDetails: GapDetail[];
  enriching: boolean;
  enrichProgress: { done: number; total: number } | null;
  enrichErrors?: { id: string; title: string; errors: EnrichError[] }[];
  isAdmin?: boolean;
  runBulkEnrich: () => Promise<void>;
}

const GAP_META: { key: string; label: string; description: string }[] = [
  { key: "embedding",  label: "Embedding",   description: "Vector embedding for semantic search" },
  { key: "concepts",   label: "Concepts",     description: "Knowledge graph connections" },
  { key: "parsed",     label: "AI Parsing",   description: "Structured metadata extracted by AI" },
  { key: "insight",    label: "Insight",      description: "AI-generated insight summary" },
];

export default function EnrichmentTab({
  unenrichedDetails,
  enriching,
  enrichProgress,
  enrichErrors = [],
  isAdmin = false,
  runBulkEnrich,
}: EnrichmentTabProps) {
  const total = unenrichedDetails.length;
  const allDone = total === 0 && !enriching;

  const gapCounts = Object.fromEntries(
    GAP_META.map(({ key }) => [
      key,
      unenrichedDetails.filter((d) => d.gaps.includes(key)).length,
    ]),
  );

  const progressPct = enrichProgress
    ? Math.round((enrichProgress.done / enrichProgress.total) * 100)
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Status card */}
      <div
        className="rounded-2xl border"
        style={{ background: "var(--surface)", borderColor: "var(--line-soft)", overflow: "hidden" }}
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
                width: 8, height: 8, borderRadius: "50%",
                background: allDone ? "var(--moss)" : "var(--ember)",
                flexShrink: 0,
              }}
            />
            <span
              className="f-sans"
              style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}
            >
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
              {unenrichedDetails.length} / {unenrichedDetails.length + (enrichProgress?.done ?? 0)} remaining
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
                      width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                      background: count > 0 ? "var(--ember)" : "var(--moss)",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className="f-sans" style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-soft)" }}>
                      {label}
                    </span>
                    <span className="f-sans" style={{ fontSize: 11, color: "var(--ink-ghost)", marginLeft: 6 }}>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span className="f-sans" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)" }}>
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
          New entries are enriched automatically in the background. Come back here if you ever see gaps.
        </p>
      )}

      {isAdmin && enrichErrors.length > 0 && (
        <div
          style={{
            marginTop: 8,
            borderRadius: 8,
            border: "1px solid var(--blood)",
            background: "var(--blood-wash)",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <span className="f-sans" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--blood)", opacity: 0.7 }}>
            Admin · Enrichment errors
          </span>
          {enrichErrors.map(({ id, title, errors }) => (
            <div key={id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="f-sans" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)" }}>
                {title}
              </span>
              {errors.map((e, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span
                    className="f-sans"
                    style={{
                      fontSize: 11, fontWeight: 600, color: "var(--blood)",
                      background: "var(--blood-wash)", borderRadius: 3,
                      padding: "1px 6px", flexShrink: 0,
                    }}
                  >
                    {e.step}
                  </span>
                  <span className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)", fontFamily: "var(--f-mono)", wordBreak: "break-all" }}>
                    {e.message}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
