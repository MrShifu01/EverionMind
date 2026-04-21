import { useGraph } from "../hooks/useGraph";
import GraphCanvas from "../components/graph/GraphCanvas";
import type { Entry } from "../types";

interface GraphViewProps {
  openEntry?: (e: Entry) => void;
}

function formatDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function GraphView({ openEntry }: GraphViewProps) {
  const { nodes, edges, selected, setSelected, moveNode, entriesLoaded } = useGraph();

  const selectedNode = nodes.find((n) => n.id === selected);
  const selectedEntry = selectedNode?.entry ?? null;

  return (
    <div
      className="graph-root"
      style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "var(--bg)" }}
    >
      {/* Top bar */}
      <header
        className="graph-topbar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 32px",
          borderBottom: "1px solid var(--line-soft)",
          minHeight: 72,
          gap: 20,
          background: "var(--bg)",
        }}
      >
        <div>
          <h1
            className="f-serif"
            style={{
              fontSize: 28, fontWeight: 450, letterSpacing: "-0.015em",
              lineHeight: 1.1, margin: 0, color: "var(--ink)",
            }}
          >
            Graph
          </h1>
          <div
            className="f-serif"
            style={{ fontSize: 14, color: "var(--ink-faint)", fontStyle: "italic", marginTop: 4 }}
          >
            {entriesLoaded ? "your memory, mapped." : "mapping your memory…"}
          </div>
        </div>
      </header>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {!entriesLoaded ? (
          /* Loading state — don't flash empty sky while entries are in flight */
          <div
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--surface-dim)",
            }}
          >
            <div className="f-serif" style={{ fontSize: 15, fontStyle: "italic", color: "var(--ink-faint)" }}>
              mapping your memory…
            </div>
          </div>
        ) : nodes.length === 0 ? (
          <div
            style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              textAlign: "center", padding: 40, gap: 8,
              background: "var(--surface-dim)",
            }}
          >
            <h3
              className="f-serif"
              style={{ fontSize: 26, fontWeight: 450, color: "var(--ink)", letterSpacing: "-0.005em", margin: 0 }}
            >
              the night sky is empty.
            </h3>
            <p
              className="f-serif"
              style={{ fontSize: 15, fontStyle: "italic", color: "var(--ink-faint)", margin: 0, maxWidth: 360, lineHeight: 1.5 }}
            >
              remember a few things and they'll start to map themselves.
            </p>
          </div>
        ) : (
          <GraphCanvas
            nodes={nodes}
            edges={edges}
            selected={selected}
            onSelect={setSelected}
            onMoveNode={moveNode}
          />
        )}

        {/* Detail rail */}
        {selectedEntry && (
          <aside
            className="graph-rail"
            style={{
              width: 360,
              flexShrink: 0,
              borderLeft: "1px solid var(--line-soft)",
              background: "var(--surface)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Rail header */}
            <div
              style={{
                padding: "20px 24px 16px",
                borderBottom: "1px solid var(--line-soft)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="micro" style={{ marginBottom: 8 }}>
                  {selectedEntry.type}
                </div>
                <h2
                  className="f-serif"
                  style={{
                    fontSize: 22, fontWeight: 450, letterSpacing: "-0.01em",
                    margin: 0, color: "var(--ink)", lineHeight: 1.25,
                  }}
                >
                  {selectedEntry.title}
                </h2>
                {selectedEntry.created_at && (
                  <div
                    className="f-serif"
                    style={{ fontSize: 12, color: "var(--ink-faint)", fontStyle: "italic", marginTop: 6 }}
                  >
                    {formatDate(selectedEntry.created_at)}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="design-btn-ghost press"
                style={{ width: 32, height: 32, minHeight: 32, padding: 0, flexShrink: 0 }}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {/* Rail body — scrollable */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
              {selectedEntry.content && (
                <p
                  className="f-serif"
                  style={{
                    fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.65,
                    margin: 0, whiteSpace: "pre-wrap",
                  }}
                >
                  {selectedEntry.content as string}
                </p>
              )}

              {selectedEntry.tags && selectedEntry.tags.length > 0 && (
                <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {selectedEntry.tags.map((tag) => (
                    <span key={tag} className="design-chip f-sans">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Rail footer */}
            {openEntry && (
              <div style={{ padding: "16px 24px", borderTop: "1px solid var(--line-soft)" }}>
                <button
                  onClick={() => openEntry(selectedEntry)}
                  className="design-btn-secondary press"
                  style={{ width: "100%" }}
                >
                  Open entry
                </button>
              </div>
            )}
          </aside>
        )}
      </div>

      <style>{`
        @media (max-width: 1023px) {
          /* MobileHeader is ~60px — subtract it so canvas stays in viewport */
          .graph-root { height: calc(100dvh - 60px) !important; }
          .graph-topbar { padding: 10px 16px !important; min-height: 48px !important; }
          .graph-rail {
            position: fixed !important; inset: 0 !important;
            width: 100% !important; z-index: 60;
            border-left: none !important;
          }
        }
      `}</style>
    </div>
  );
}
