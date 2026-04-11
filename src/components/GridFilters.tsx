import { useState, useRef, useEffect } from "react";
import { TC } from "../data/constants";
import type { DateFilter, SortOrder, EntryFilterState } from "../lib/entryFilters";
import { Chip } from "./ui/chip";
import { ActivePill } from "./ui/active-pill";

const DATE_OPTIONS: { id: DateFilter; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
];

const SORT_OPTIONS: { id: SortOrder; label: string; icon: string }[] = [
  { id: "newest", label: "Newest", icon: "↓" },
  { id: "oldest", label: "Oldest", icon: "↑" },
  { id: "pinned", label: "Pinned first", icon: "◆" },
];

interface GridFiltersProps {
  filters: EntryFilterState;
  availableTypes: string[];
  typeIcons?: Record<string, string>;
  onChange: (filters: EntryFilterState) => void;
  activeCount: number;
  selectMode?: boolean;
  onSelectModeToggle?: () => void;
  viewMode?: "grid" | "list";
  onViewModeChange?: (mode: "grid" | "list") => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-on-surface-variant flex-shrink-0 text-xs font-semibold tracking-[0.08em] uppercase opacity-50 select-none">
      {children}
    </span>
  );
}

export default function GridFilters({
  filters,
  availableTypes,
  typeIcons: _typeIcons = {},
  onChange,
  activeCount,
  selectMode = false,
  onSelectModeToggle,
  viewMode = "grid",
  onViewModeChange,
}: GridFiltersProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Animate height with grid-template-rows
  const hasActive = activeCount > 0;

  function set(patch: Partial<EntryFilterState>) {
    onChange({ ...filters, ...patch });
  }

  // Close panel when clicking outside
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const typeList =
    availableTypes.length > 0 ? availableTypes : Object.keys(TC).filter((t) => t !== "secret");

  return (
    <div ref={panelRef} className="w-full">
      {/* Toggle row */}
      <div className="flex items-center justify-between gap-2">
        {onSelectModeToggle && (
          <Chip active={selectMode} onClick={onSelectModeToggle}>
            {selectMode ? "Done" : "Select"}
          </Chip>
        )}
        <Chip
          active={open || hasActive}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Toggle filters"
          className={open || hasActive ? "bg-primary-container text-primary border-primary/20" : ""}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M2 4h12M4 8h8M6 12h4"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
          <span>Filters</span>
          {hasActive && (
            <span className="bg-primary text-primary-foreground inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums">
              {activeCount}
            </span>
          )}
        </Chip>

        {/* Active filter pills — always visible for quick-clear */}
        <div
          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto"
          style={{ scrollbarWidth: "none" }}
        >
          {filters.type !== "all" && (
            <ActivePill
              label={filters.type.charAt(0).toUpperCase() + filters.type.slice(1)}
              onClear={() => set({ type: "all" })}
            />
          )}
          {filters.date !== "all" && (
            <ActivePill
              label={DATE_OPTIONS.find((d) => d.id === filters.date)?.label ?? filters.date}
              onClear={() => set({ date: "all" })}
            />
          )}
          {filters.sort !== "newest" && (
            <ActivePill
              label={SORT_OPTIONS.find((s) => s.id === filters.sort)?.label ?? filters.sort}
              onClear={() => set({ sort: "newest" })}
            />
          )}
          {hasActive && (
            <button
              type="button"
              onClick={() => onChange({ type: "all", date: "all", sort: "newest" })}
              className="press-scale text-on-surface-variant flex-shrink-0 text-xs opacity-60 transition-opacity hover:opacity-100"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Grid / List toggle */}
        {onViewModeChange && (
          <div className="border-outline-variant flex flex-shrink-0 items-center overflow-hidden rounded-full border">
            <button
              type="button"
              onClick={() => onViewModeChange("grid")}
              aria-label="Grid view"
              className={`press-scale flex items-center justify-center px-2.5 py-1.5 transition-colors duration-150 ${viewMode === "grid" ? "bg-primary-container text-primary" : "text-on-surface-variant bg-transparent"}`}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                <rect
                  x="1"
                  y="1"
                  width="6"
                  height="6"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                />
                <rect
                  x="9"
                  y="1"
                  width="6"
                  height="6"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                />
                <rect
                  x="1"
                  y="9"
                  width="6"
                  height="6"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                />
                <rect
                  x="9"
                  y="9"
                  width="6"
                  height="6"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("list")}
              aria-label="List view"
              className={`press-scale flex items-center justify-center px-2.5 py-1.5 transition-colors duration-150 ${viewMode === "list" ? "bg-primary-container text-primary" : "text-on-surface-variant bg-transparent"}`}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M1 3h14M1 8h14M1 13h14"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Collapsible panel */}
      <div
        className="grid transition-[grid-template-rows] duration-200"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div className="overflow-hidden">
          <div className="border-outline-variant bg-surface-container-low mt-3 flex flex-col gap-4 rounded-2xl border p-3">
            {/* Type */}
            <div className="flex flex-col gap-2">
              <SectionLabel>Type</SectionLabel>
              <div className="scrollbar-hide flex gap-1.5 overflow-x-auto pb-0.5">
                <Chip active={filters.type === "all"} onClick={() => set({ type: "all" })}>
                  All types
                </Chip>
                {typeList.map((t) => {
                  const label = t.charAt(0).toUpperCase() + t.slice(1);
                  return (
                    <Chip key={t} active={filters.type === t} onClick={() => set({ type: t })}>
                      {label}
                    </Chip>
                  );
                })}
              </div>
            </div>

            {/* Separator */}
            <div className="bg-outline-variant h-px opacity-50" />

            {/* Date */}
            <div className="flex flex-wrap items-center gap-3">
              <SectionLabel>Date</SectionLabel>
              <div className="scrollbar-hide flex gap-1.5 overflow-x-auto">
                {DATE_OPTIONS.map((d) => (
                  <Chip
                    key={d.id}
                    active={filters.date === d.id}
                    onClick={() => set({ date: d.id })}
                  >
                    {d.label}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Separator */}
            <div className="bg-outline-variant h-px opacity-50" />

            {/* Sort */}
            <div className="flex flex-wrap items-center gap-3">
              <SectionLabel>Sort</SectionLabel>
              <div className="flex gap-1.5">
                {SORT_OPTIONS.map((s) => (
                  <Chip
                    key={s.id}
                    active={filters.sort === s.id}
                    onClick={() => set({ sort: s.id })}
                  >
                    <span aria-hidden className="font-mono text-[11px]">
                      {s.icon}
                    </span>
                    {s.label}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
