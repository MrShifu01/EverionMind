import { useState, useEffect, useRef, useCallback } from "react";
import { searchIndex } from "../lib/searchIndex";
import type { Entry } from "../types";

interface OmniSearchProps {
  entries: Entry[];
  onSelect: (entry: Entry) => void;
  onNavigate: (view: string) => void;
}

export default function OmniSearch({ entries, onSelect, onNavigate }: OmniSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Entry[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setHighlighted(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const runSearch = useCallback(
    (q: string) => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      const ids = searchIndex(q);
      if (ids) {
        const matched = entries.filter((e) => ids.has(e.id)).slice(0, 12);
        setResults(matched);
      } else {
        // Fallback: simple title match
        const lower = q.toLowerCase();
        setResults(
          entries.filter((e) => e.title.toLowerCase().includes(lower)).slice(0, 12),
        );
      }
      setHighlighted(0);
    },
    [entries],
  );

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 120);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      const item = results[highlighted];
      if (item) {
        onSelect(item);
        setOpen(false);
      }
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Search (⌘K)"
        className="hidden items-center gap-2 rounded-xl border px-3 py-1.5 text-sm transition-colors lg:flex"
        style={{
          borderColor: "var(--color-outline-variant)",
          color: "var(--color-on-surface-variant)",
          background: "var(--color-surface-container-low)",
        }}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <span>Search</span>
        <kbd className="ml-2 rounded px-1.5 py-0.5 text-[10px]" style={{ background: "var(--color-surface-container-high)" }}>⌘K</kbd>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh]"
      style={{ background: "var(--color-scrim)" }}
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-outline-variant)" }}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-3 border-b px-4 py-5"
          style={{ borderColor: "var(--color-outline-variant)" }}
        >
          <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: "var(--color-primary)" }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search all memories…"
            className="flex-1 border-none bg-transparent text-sm outline-none"
            style={{ color: "var(--color-on-surface)" }}
          />
          <kbd
            className="rounded px-2 py-1 text-xs"
            style={{
              background: "var(--color-surface-container-high)",
              color: "var(--color-on-surface-variant)",
            }}
          >
            Esc
          </kbd>
        </div>

        {/* Results */}
        {results.length > 0 ? (
          <ul className="max-h-96 overflow-y-auto py-2">
            {results.map((entry, i) => (
              <li key={entry.id}>
                <button
                  className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors"
                  style={{
                    background: i === highlighted ? "var(--color-surface-container)" : "transparent",
                  }}
                  onClick={() => {
                    onSelect(entry);
                    setOpen(false);
                  }}
                  onMouseEnter={() => setHighlighted(i)}
                >
                  <span
                    className="mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
                    style={{
                      background: "var(--color-primary-container)",
                      color: "var(--color-primary)",
                      flexShrink: 0,
                    }}
                  >
                    {entry.type || "note"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-on-surface truncate text-sm font-medium">{entry.title}</p>
                    {entry.content && (
                      <p
                        className="mt-0.5 truncate text-xs"
                        style={{ color: "var(--color-on-surface-variant)" }}
                      >
                        {entry.content.slice(0, 80)}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : query.trim() ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
            No results for "{query}"
          </div>
        ) : (
          <div className="px-4 py-6">
            <p className="mb-3 text-xs font-semibold uppercase" style={{ color: "var(--color-on-surface-variant)" }}>
              Quick Nav
            </p>
            <div className="flex flex-wrap gap-2">
              {["grid", "todos", "refine", "chat", "suggest"].map((view) => (
                <button
                  key={view}
                  className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    borderColor: "var(--color-outline-variant)",
                    color: "var(--color-on-surface-variant)",
                  }}
                  onClick={() => {
                    onNavigate(view);
                    setOpen(false);
                  }}
                >
                  {view === "refine" ? "Improve Brain" :view === "suggest" ? "Fill Brain" : view.charAt(0).toUpperCase() + view.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          className="border-t px-4 py-2 text-xs"
          style={{
            borderColor: "var(--color-outline-variant)",
            color: "var(--color-on-surface-variant)",
          }}
        >
          ↑↓ navigate · Enter open · Esc close
        </div>
      </div>
    </div>
  );
}
