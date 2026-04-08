import { useState, useRef, useEffect } from "react";
import { TC } from "../data/constants";
import { resolveIcon } from "../lib/typeIcons";
import type { DateFilter, SortOrder, EntryFilterState } from "../lib/entryFilters";

const DATE_OPTIONS: { id: DateFilter; label: string }[] = [
  { id: "all",   label: "All time" },
  { id: "today", label: "Today" },
  { id: "week",  label: "This week" },
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
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-150 press-scale whitespace-nowrap"
      style={
        active
          ? {
              background: "var(--color-primary)",
              color: "var(--color-on-primary)",
            }
          : {
              background: "var(--color-surface-container)",
              color: "var(--color-on-surface-variant)",
              border: "1px solid var(--color-outline-variant)",
            }
      }
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="flex-shrink-0 text-xs font-semibold tracking-widest uppercase select-none"
      style={{ color: "var(--color-on-surface-variant)", opacity: 0.5, letterSpacing: "0.08em" }}
    >
      {children}
    </span>
  );
}

export default function GridFilters({
  filters,
  availableTypes,
  typeIcons = {},
  onChange,
  activeCount,
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

  const typeList = availableTypes.length > 0 ? availableTypes : Object.keys(TC).filter((t) => t !== "secret");

  return (
    <div ref={panelRef} className="w-full">
      {/* Toggle row */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-150 press-scale"
          style={{
            background: open || hasActive
              ? "var(--color-primary-container)"
              : "var(--color-surface-container)",
            color: open || hasActive
              ? "var(--color-primary)"
              : "var(--color-on-surface-variant)",
            border: "1px solid var(--color-outline-variant)",
          }}
          aria-expanded={open}
          aria-label="Toggle filters"
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
            <span
              className="inline-flex items-center justify-center rounded-full text-[10px] font-bold tabular-nums"
              style={{
                minWidth: "16px",
                height: "16px",
                padding: "0 4px",
                background: "var(--color-primary)",
                color: "var(--color-on-primary)",
              }}
            >
              {activeCount}
            </span>
          )}
        </button>

        {/* Active filter pills — always visible for quick-clear */}
        <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0" style={{ scrollbarWidth: "none" }}>
          {filters.type !== "all" && (
            <ActivePill
              label={`${resolveIcon(filters.type, typeIcons)} ${filters.type}`}
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
              onClick={() => onChange({ type: "all", date: "all", sort: "newest" })}
              className="flex-shrink-0 text-xs press-scale"
              style={{ color: "var(--color-on-surface-variant)", opacity: 0.6 }}
            >
              Clear all
            </button>
          )}
        </div>
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
          <div
            className="mt-3 p-3 rounded-2xl flex flex-col gap-4"
            style={{
              background: "var(--color-surface-container-low)",
              border: "1px solid var(--color-outline-variant)",
            }}
          >
            {/* Type */}
            <div className="flex flex-col gap-2">
              <SectionLabel>Type</SectionLabel>
              <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
                <Chip active={filters.type === "all"} onClick={() => set({ type: "all" })}>
                  All types
                </Chip>
                {typeList.map((t) => {
                  const icon = resolveIcon(t, typeIcons);
                  const label = t.charAt(0).toUpperCase() + t.slice(1);
                  return (
                    <Chip key={t} active={filters.type === t} onClick={() => set({ type: t })}>
                      <span aria-hidden>{icon}</span>
                      {label}
                    </Chip>
                  );
                })}
              </div>
            </div>

            {/* Separator */}
            <div style={{ height: "1px", background: "var(--color-outline-variant)", opacity: 0.5 }} />

            {/* Date */}
            <div className="flex items-center gap-3 flex-wrap">
              <SectionLabel>Date</SectionLabel>
              <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {DATE_OPTIONS.map((d) => (
                  <Chip key={d.id} active={filters.date === d.id} onClick={() => set({ date: d.id })}>
                    {d.label}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Separator */}
            <div style={{ height: "1px", background: "var(--color-outline-variant)", opacity: 0.5 }} />

            {/* Sort */}
            <div className="flex items-center gap-3 flex-wrap">
              <SectionLabel>Sort</SectionLabel>
              <div className="flex gap-1.5">
                {SORT_OPTIONS.map((s) => (
                  <Chip key={s.id} active={filters.sort === s.id} onClick={() => set({ sort: s.id })}>
                    <span aria-hidden className="font-mono text-[11px]">{s.icon}</span>
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

function ActivePill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span
      className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
      style={{
        background: "var(--color-primary-container)",
        color: "var(--color-primary)",
        border: "1px solid color-mix(in oklch, var(--color-primary) 25%, transparent)",
      }}
    >
      {label}
      <button
        onClick={onClear}
        className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity press-scale leading-none"
        aria-label={`Remove ${label} filter`}
      >
        ×
      </button>
    </span>
  );
}
