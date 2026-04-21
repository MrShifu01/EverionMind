import { useState, useEffect, useRef, useCallback } from "react";
import type { Entry } from "../types";
import { scoreEntry } from "../lib/searchIndex";

interface OmniSearchProps {
  entries: Entry[];
  onSelect: (entry: Entry) => void;
  onNavigate: (view: string) => void;
}

const MOD = typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl";

const COMMANDS: { label: string; view: string; kbd: string[] }[] = [
  { label: "Remember something", view: "capture", kbd: ["N"] },
  { label: "Go to chat", view: "chat", kbd: ["J"] },
  { label: "Go to graph", view: "graph", kbd: ["G"] },
  { label: "Open todos", view: "todos", kbd: ["T"] },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="f-sans"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        background: "var(--surface-low)",
        border: "1px solid var(--line)",
        borderRadius: 4,
        fontSize: 11,
        color: "var(--ink-faint)",
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  );
}

function Micro({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="micro" style={style}>
      {children}
    </div>
  );
}

export default function OmniSearch({ entries, onSelect, onNavigate }: OmniSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Entry[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

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
      const trimmed = q.trim();
      if (!trimmed) {
        setResults([]);
        return;
      }
      const scored = entries
        .map((e) => ({ entry: e, score: scoreEntry(e, trimmed) }))
        .filter(({ score }) => score > 0);
      scored.sort((a, b) => b.score - a.score);
      setResults(scored.slice(0, 8).map(({ entry }) => entry));
      setHighlighted(0);
    },
    [entries],
  );

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 120);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const filteredCommands = COMMANDS.filter(
    (c) => !query.trim() || c.label.toLowerCase().includes(query.toLowerCase()),
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    const total = results.length + filteredCommands.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, total - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (highlighted < results.length) {
        onSelect(results[highlighted]);
        setOpen(false);
      } else {
        const cmd = filteredCommands[highlighted - results.length];
        if (cmd) {
          onNavigate(cmd.view);
          setOpen(false);
        }
      }
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label={`Search (${MOD}K)`}
        className="hidden lg:flex press items-center gap-2"
        style={{
          padding: "0 12px 0 14px",
          height: 36,
          minHeight: 36,
          border: "1px solid var(--line-soft)",
          borderRadius: 8,
          background: "var(--surface)",
          color: "var(--ink-faint)",
          fontFamily: "var(--f-sans)",
          fontSize: 13,
          cursor: "pointer",
        }}
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
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span>search everything</span>
        <span style={{ marginLeft: 6, display: "inline-flex", gap: 2 }}>
          <Kbd>{MOD}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center"
      style={{
        background: "var(--scrim)",
        paddingTop: "12vh",
        paddingLeft: 16,
        paddingRight: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        className="anim-scale-in-design"
        style={{
          width: 640,
          maxWidth: "92vw",
          background: "var(--surface-high)",
          border: "1px solid var(--line)",
          borderRadius: 18,
          boxShadow: "var(--lift-3)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "18px 20px",
            borderBottom: "1px solid var(--line-soft)",
          }}
        >
          <svg
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
            style={{ color: "var(--ink-faint)", flexShrink: 0 }}
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="search everything…"
            type="search"
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-haspopup="listbox"
            aria-controls="omnisearch-listbox"
            aria-autocomplete="list"
            aria-activedescendant={
              results.length > 0 ? `omnisearch-option-${highlighted}` : undefined
            }
            className="f-serif flex-1 border-none bg-transparent outline-none"
            style={{
              fontSize: 17,
              fontStyle: query ? "normal" : "italic",
              color: "var(--ink)",
            }}
          />
          <Kbd>esc</Kbd>
        </div>

        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {query && results.length === 0
            ? "No results found"
            : results.length > 0
              ? `${results.length} result${results.length === 1 ? "" : "s"} found`
              : ""}
        </div>

        <div
          className="scrollbar-hide"
          style={{ maxHeight: 480, overflowY: "auto" }}
        >
          {/* Entries section */}
          {results.length > 0 && (
            <>
              <Micro style={{ padding: "14px 20px 6px" }}>entries</Micro>
              <ul id="omnisearch-listbox" role="listbox" style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {results.map((entry, i) => {
                  const active = i === highlighted;
                  return (
                    <li
                      key={entry.id}
                      id={`omnisearch-option-${i}`}
                      role="option"
                      aria-selected={active}
                    >
                      <button
                        className="press"
                        style={{
                          display: "flex",
                          width: "100%",
                          padding: "10px 20px",
                          gap: 12,
                          textAlign: "left",
                          alignItems: "center",
                          minHeight: 44,
                          background: active ? "var(--surface)" : "transparent",
                          border: "none",
                          cursor: "pointer",
                          transition: "background 120ms",
                        }}
                        onClick={() => {
                          onSelect(entry);
                          setOpen(false);
                        }}
                        onMouseEnter={() => setHighlighted(i)}
                      >
                        <span
                          className="f-sans"
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            color: "var(--ink-faint)",
                            flexShrink: 0,
                            minWidth: 56,
                          }}
                        >
                          {entry.type || "note"}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            className="f-serif truncate"
                            style={{ fontSize: 15, fontWeight: 450, color: "var(--ink)" }}
                          >
                            {entry.title}
                          </div>
                          {entry.content && (
                            <div
                              className="f-serif truncate"
                              style={{
                                fontSize: 12,
                                color: "var(--ink-faint)",
                                fontStyle: "italic",
                                marginTop: 2,
                              }}
                            >
                              {entry.content.slice(0, 80)}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {/* Commands section */}
          {filteredCommands.length > 0 && (
            <>
              <Micro style={{ padding: "14px 20px 6px" }}>commands</Micro>
              {filteredCommands.map((c, i) => {
                const idx = results.length + i;
                const active = idx === highlighted;
                return (
                  <button
                    key={c.label}
                    onClick={() => {
                      onNavigate(c.view);
                      setOpen(false);
                    }}
                    onMouseEnter={() => setHighlighted(idx)}
                    className="press"
                    style={{
                      display: "flex",
                      width: "100%",
                      padding: "10px 20px",
                      gap: 12,
                      textAlign: "left",
                      alignItems: "center",
                      justifyContent: "space-between",
                      minHeight: 40,
                      background: active ? "var(--surface)" : "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <span className="f-sans" style={{ fontSize: 14, color: "var(--ink)" }}>
                      {c.label}
                    </span>
                    <span style={{ display: "inline-flex", gap: 2 }}>
                      <Kbd>{MOD}</Kbd>
                      {c.kbd.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </span>
                  </button>
                );
              })}
            </>
          )}

          {/* Empty state */}
          {query.trim() && results.length + filteredCommands.length === 0 && (
            <div
              className="f-serif"
              style={{
                padding: 32,
                textAlign: "center",
                fontSize: 15,
                color: "var(--ink-faint)",
                fontStyle: "italic",
              }}
            >
              nothing here yet. try a looser word.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
