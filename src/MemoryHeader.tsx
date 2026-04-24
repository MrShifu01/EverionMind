import type { AppShellState } from "./hooks/useAppShell";

interface Props {
  appShell: AppShellState;
  entries: { length: number };
  entriesLoaded: boolean;
  activeBrainId: string | undefined;
}

export default function MemoryHeader({ appShell, entries, entriesLoaded, activeBrainId }: Props) {
  return (
    <>
      {/* Memory top bar — title + Remember */}
      <header
        className="memory-topbar hidden lg:flex"
        style={{
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 32px",
          borderBottom: "1px solid var(--line-soft)",
          minHeight: 80,
          background: "var(--bg)",
          gap: 20,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1
            className="f-serif"
            style={{
              fontSize: 28,
              fontWeight: 450,
              letterSpacing: "-0.015em",
              lineHeight: 1.1,
              margin: 0,
              color: "var(--ink)",
            }}
          >
            Memory
          </h1>
          <div
            className="f-serif"
            style={{
              fontSize: 14,
              color: "var(--ink-faint)",
              fontStyle: "italic",
              marginTop: 4,
            }}
          >
            {entriesLoaded && entries.length > 0
              ? `${entries.length} entries`
              : "everything you've written down."}
          </div>
        </div>
        <button
          className="design-btn-primary press"
          onClick={() => appShell.setShowCapture(true)}
          style={{ borderRadius: 6 }}
        >
          <svg
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Capture
        </button>
      </header>

      {/* Filter row — Grid/Timeline + type pills + sort */}
      <div
        className="memory-filter-row"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 32px",
          borderBottom: "1px solid var(--line-soft)",
          background: "var(--bg)",
          flexWrap: "wrap",
        }}
      >
        {/* Grid / List / Timeline segmented */}
        <div
          style={{
            display: "inline-flex",
            padding: 3,
            background: "var(--surface-low)",
            border: "1px solid var(--line-soft)",
            borderRadius: 8,
            gap: 2,
            flexShrink: 0,
          }}
        >
          {[
            { id: "memory-grid", label: "Grid" },
            { id: "memory-list", label: "List" },
            { id: "timeline", label: "Timeline" },
          ].map((v) => {
            const active =
              v.id === "timeline"
                ? appShell.view === "timeline"
                : v.id === "memory-grid"
                  ? appShell.view === "memory" && appShell.gridViewMode === "grid"
                  : appShell.view === "memory" && appShell.gridViewMode === "list";
            return (
              <button
                key={v.id}
                onClick={() => {
                  appShell.setSelected(null);
                  if (v.id === "timeline") {
                    appShell.setView("timeline");
                  } else if (v.id === "memory-grid") {
                    appShell.setView("memory");
                    appShell.setGridViewMode("grid");
                  } else {
                    appShell.setView("memory");
                    appShell.setGridViewMode("list");
                  }
                }}
                className="press"
                aria-pressed={active}
                style={{
                  padding: "6px 14px",
                  minHeight: 28,
                  borderRadius: 6,
                  fontFamily: "var(--f-sans)",
                  fontSize: 13,
                  fontWeight: 500,
                  background: active ? "var(--surface-high)" : "transparent",
                  color: active ? "var(--ink)" : "var(--ink-faint)",
                  border: active ? "1px solid var(--line-soft)" : "1px solid transparent",
                  cursor: "pointer",
                  transition: "all 180ms",
                }}
              >
                {v.label}
              </button>
            );
          })}
        </div>

        {/* vertical rule */}
        <span
          aria-hidden="true"
          style={{ width: 1, height: 22, background: "var(--line-soft)", flexShrink: 0 }}
        />

        {/* Type pills */}
        <div
          className="scrollbar-hide"
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            overflowX: "auto",
            minWidth: 0,
          }}
        >
          {["all", "note", "link", "reminder", "idea", "contact", "file"].map((t) => {
            const active = appShell.gridFilters.type === t;
            return (
              <button
                key={t}
                onClick={() =>
                  appShell.setGridFilters({
                    ...appShell.gridFilters,
                    type: t,
                    brainId: activeBrainId,
                  })
                }
                className="press f-sans"
                style={{
                  flexShrink: 0,
                  padding: "0 14px",
                  height: 32,
                  minHeight: 32,
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  background: active ? "var(--ember-wash)" : "var(--surface)",
                  color: active ? "var(--ember)" : "var(--ink-soft)",
                  border: `1px solid ${active ? "var(--ember)" : "var(--line-soft)"}`,
                  cursor: "pointer",
                  transition: "all 180ms",
                }}
              >
                {t}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* Sort cycle */}
        <button
          className="design-btn-ghost press"
          onClick={() => {
            const order: Array<"newest" | "oldest" | "pinned"> = ["newest", "oldest", "pinned"];
            const idx = order.indexOf(appShell.gridFilters.sort as any);
            const next = order[(idx + 1) % order.length];
            appShell.setGridFilters({
              ...appShell.gridFilters,
              sort: next,
              brainId: activeBrainId,
            });
          }}
          style={{ fontSize: 13, height: 32, minHeight: 32, padding: "0 10px" }}
        >
          <svg
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M7 4v16M4 7l3-3 3 3M17 20V4M14 17l3 3 3-3" />
          </svg>
          {appShell.gridFilters.sort === "oldest"
            ? "Oldest first"
            : appShell.gridFilters.sort === "pinned"
              ? "Pinned first"
              : "Recent first"}
        </button>
      </div>
    </>
  );
}
