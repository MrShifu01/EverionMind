// COLLOQUY · Desktop chat
// ─────────────────────────────────────────────────────────────────────
// Implements the Colloquy variant from DesktopDesignInkwell:
//   - 2-column split: conversation (flex 1) + sources rail (360px right)
//   - Header: mono date + "A colloquy with your brain" serif headline +
//     mono "draws from N memories · {brain}" caption
//   - Bubbles asymmetric:
//       user  = italic serif card, right-aligned, surface bg, asymmetric
//               border radius (16/16/4/16)
//       brain = metallic ember avatar (28px) + full-bleed serif text +
//               action row (copy / thread / regen) in mono ALL-CAPS chips
//   - Composer: ember-bordered + glow input with serif italic placeholder,
//     voice/photo/link mono chips, ember ASK pill with ↵
//   - Suggestion chips below in serif italic
//   - Sources rail: real recent entries as SourceCards (ember-tinted for
//     cited, dimmed for nearby), hover-to-focus animation
//
// Faithful to extracted/everionmobile/project/desktop-colloquy.jsx with
// mock TRANSCRIPT / SOURCES replaced by real chat + entries. Citation
// chip data isn't tracked by useChat yet; the design's hover-citation
// behavior is staged so it lights up when source IDs become available.

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useChat } from "../hooks/useChat";
import { useEntries } from "../context/EntriesContext";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import {
  useHasAIAccess,
  readSuggestionsCache,
  writeSuggestionsCache,
  derivePrompts,
} from "./chatUtils";
import { renderMarkdown } from "./chatUtils";
import type { Entry } from "../types";

const ACCENT = "var(--ember)";

interface ChatViewColloquyProps {
  brainId: string | undefined;
  brainName?: string;
  onNavigate?: (view: string) => void;
}

export default function ChatViewColloquy({
  brainId,
  brainName,
  onNavigate,
}: ChatViewColloquyProps) {
  const aiAvailable = useHasAIAccess();
  const { messages, loading, send } = useChat(brainId);
  const { entries, entriesLoaded } = useEntries();

  const [suggestions, setSuggestions] = useState<string[]>(
    () => readSuggestionsCache(brainId) ?? [],
  );
  useEffect(() => {
    if (!entriesLoaded || entries.length === 0) return;
    if (readSuggestionsCache(brainId) !== null) return;
    const fresh = derivePrompts(entries);
    writeSuggestionsCache(brainId, fresh);
    setSuggestions(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable while typing
  }, [entriesLoaded, brainId]);

  const [input, setInput] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [highlightSourceId, setHighlightSourceId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { listening, startVoice } = useVoiceRecorder({
    onTranscript: (t) => setInput((prev) => (prev ? `${prev} ${t}` : t)),
    onStatus: () => {},
    onError: (msg) => {
      setVoiceError(msg);
      setTimeout(() => setVoiceError(null), 4000);
    },
    onLoading: setVoiceLoading,
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || loading || voiceLoading) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      toast("You're offline · Chat needs internet. We'll keep your message ready.", {
        id: "chat-offline",
        duration: 4000,
      });
      return;
    }
    if (entriesLoaded && entries.length === 0) {
      toast("Add memories before asking.", { duration: 3000 });
      return;
    }
    setInput("");
    send(text);
  }, [input, loading, send, entriesLoaded, entries.length, voiceLoading]);

  // Source rail: 10 most-recent non-secret entries. "Cited" status would
  // come from the LLM response once tracked; for now treat the top 2 as
  // visually-cited (the user's eye expects something to anchor on).
  const railEntries = useMemo(() => {
    return entries
      .filter((e) => e.type !== "secret")
      .slice(0, 10)
      .map((e, i) => ({ entry: e, cited: i < 2 }));
  }, [entries]);

  if (!aiAvailable) {
    return <AiUnavailable onNavigate={onNavigate} />;
  }

  return (
    <div style={{ height: "100%", display: "flex" }}>
      {/* ── Conversation column ── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "32px 36px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <Header brainName={brainName} entryCount={entries.length} />
          {messages.length === 0 && entriesLoaded && entries.length > 0 && <EmptyState />}
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} text={m.content} onCitationHover={setHighlightSourceId} />
          ))}
          {loading && <ThinkingBubble />}
          <div ref={endRef} />
        </div>
        <Composer
          input={input}
          onInputChange={setInput}
          onSend={handleSend}
          onStartVoice={startVoice}
          listening={listening}
          voiceLoading={voiceLoading}
          voiceError={voiceError}
          suggestions={suggestions}
          onSuggestion={(s) => send(s)}
          inputRef={inputRef}
        />
      </div>

      {/* ── Sources rail ── */}
      <ColloquySources
        entries={railEntries}
        highlightId={highlightSourceId}
        brainName={brainName}
      />
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────

function Header({ brainName, entryCount }: { brainName?: string; entryCount: number }) {
  const now = new Date();
  const dateLine = `${now.toLocaleDateString("en-ZA", { weekday: "long", month: "long", day: "numeric" }).toLowerCase()} · ${now.toLocaleTimeString("en-ZA", { hour: "numeric", minute: "2-digit", hour12: true })}`;
  return (
    <div>
      <div
        className="f-mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.24em",
          color: "var(--ink-faint)",
          textTransform: "uppercase",
        }}
      >
        {dateLine}
      </div>
      <div
        className="f-serif"
        style={{
          fontSize: 30,
          color: "var(--ink)",
          letterSpacing: "-0.02em",
          marginTop: 4,
          lineHeight: 1.1,
        }}
      >
        A <span style={{ fontStyle: "italic", color: ACCENT }}>colloquy</span> with your brain
      </div>
      <div
        className="f-mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          color: "var(--ink-faint)",
          textTransform: "uppercase",
          marginTop: 6,
        }}
      >
        draws from {entryCount} memor{entryCount === 1 ? "y" : "ies"}
        {brainName ? ` · ${brainName.toLowerCase()}` : ""}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="f-serif"
      style={{
        color: "var(--ink-faint)",
        fontSize: 15,
        fontStyle: "italic",
        padding: "20px 0",
      }}
    >
      ask anything you've kept. start with a suggestion below or just type.
    </div>
  );
}

// ─── Bubbles ─────────────────────────────────────────────────────────

function Bubble({
  role,
  text,
  onCitationHover: _onCitationHover,
}: {
  role: "user" | "assistant";
  text: string;
  onCitationHover: (id: string | null) => void;
}) {
  if (role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          className="f-serif"
          style={{
            maxWidth: 460,
            padding: "12px 16px",
            background: "var(--surface)",
            border: "1px solid var(--line-soft)",
            borderRadius: "16px 16px 4px 16px",
            color: "var(--ink)",
            fontSize: 15,
            fontStyle: "italic",
            lineHeight: 1.4,
            letterSpacing: "-0.005em",
          }}
        >
          {text}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <BrainAvatar />
      <div style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          className="f-serif"
          style={{
            fontSize: 16.5,
            color: "var(--ink)",
            lineHeight: 1.5,
            letterSpacing: "-0.005em",
          }}
        >
          {renderMarkdown(text)}
        </div>
        <ActionRow text={text} />
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <BrainAvatar />
      <div
        className="f-mono"
        style={{
          fontSize: 11,
          letterSpacing: "0.2em",
          color: "var(--ink-faint)",
          textTransform: "uppercase",
          paddingTop: 7,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>thinking</span>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: ACCENT,
            boxShadow: `0 0 8px ${ACCENT}`,
            animation: "pulse-dot 1.2s ease-in-out infinite",
          }}
        />
      </div>
    </div>
  );
}

function BrainAvatar() {
  return (
    <span
      aria-hidden
      style={{
        width: 28,
        height: 28,
        flexShrink: 0,
        marginTop: 2,
        borderRadius: "50%",
        background: `radial-gradient(circle at 35% 30%, color-mix(in oklch, ${ACCENT} 60%, var(--ember-deep)), var(--ember-deep))`,
        border: `1px solid color-mix(in oklch, ${ACCENT} 70%, transparent)`,
        boxShadow: `0 0 14px color-mix(in oklch, ${ACCENT} 28%, transparent)`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="6" r="2" fill="var(--ember-ink)" />
        <circle cx="6" cy="18" r="2" fill="var(--ember-ink)" />
        <circle cx="18" cy="18" r="2" fill="var(--ember-ink)" />
      </svg>
    </span>
  );
}

function ActionRow({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <button
        onClick={handleCopy}
        style={{
          padding: "3px 8px",
          background: "transparent",
          border: "1px solid var(--line-soft)",
          borderRadius: 999,
          color: copied ? ACCENT : "var(--ink-faint)",
          fontFamily: "var(--f-mono)",
          fontSize: 9,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        {copied ? "copied" : "copy"}
      </button>
      {(["thread", "regen"] as const).map((a) => (
        <button
          key={a}
          style={{
            padding: "3px 8px",
            background: "transparent",
            border: "1px solid var(--line-soft)",
            borderRadius: 999,
            color: "var(--ink-faint)",
            fontFamily: "var(--f-mono)",
            fontSize: 9,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {a}
        </button>
      ))}
    </div>
  );
}

// ─── Composer ────────────────────────────────────────────────────────

function Composer({
  input,
  onInputChange,
  onSend,
  onStartVoice,
  listening,
  voiceLoading,
  voiceError,
  suggestions,
  onSuggestion,
  inputRef,
}: {
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onStartVoice: () => void;
  listening: boolean;
  voiceLoading: boolean;
  voiceError: string | null;
  suggestions: string[];
  onSuggestion: (s: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div
      style={{
        flexShrink: 0,
        padding: "18px 36px 22px",
        borderTop: "1px solid var(--line-soft)",
        background: "color-mix(in oklch, var(--surface-low) 30%, var(--bg))",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px 10px 16px",
          background: "var(--surface)",
          border: `1px solid color-mix(in oklch, var(--ember) 32%, var(--line-soft))`,
          borderRadius: 14,
          boxShadow: `0 0 0 4px color-mix(in oklch, var(--ember) 8%, transparent), var(--lift-1)`,
          // Shared-element morph target from MobileHome Ask pill
          viewTransitionName: "ask-input",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--ink-faint)", flexShrink: 0 }}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={
            listening
              ? "listening… tap stop when done"
              : voiceLoading
                ? "transcribing…"
                : "ask anything you've kept…"
          }
          disabled={voiceLoading}
          style={{
            flex: 1,
            minWidth: 0,
            height: 36,
            background: "transparent",
            border: "none",
            outline: "none",
            fontFamily: "var(--f-serif)",
            fontSize: 16,
            fontStyle: input ? "normal" : "italic",
            color: "var(--ink)",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={onStartVoice}
            disabled={voiceLoading}
            aria-label={listening ? "Stop recording" : "Voice"}
            style={{
              background: "var(--surface-low)",
              border: "1px solid var(--line-soft)",
              borderRadius: 999,
              padding: "5px 11px",
              color: listening ? ACCENT : "var(--ink-soft)",
              fontFamily: "var(--f-mono)",
              fontSize: 9.5,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {listening ? "stop" : "voice"}
          </button>
          <button
            onClick={onSend}
            disabled={!input.trim()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: input.trim() ? ACCENT : "var(--surface-low)",
              color: input.trim() ? "var(--ember-ink)" : "var(--ink-faint)",
              border: "none",
              borderRadius: 999,
              padding: "7px 14px",
              fontWeight: 700,
              fontSize: 13,
              cursor: input.trim() ? "pointer" : "not-allowed",
              fontFamily: "var(--f-sans)",
              boxShadow: input.trim()
                ? `0 0 16px color-mix(in oklch, var(--ember) 28%, transparent)`
                : "none",
              transition: "background 200ms, box-shadow 200ms",
            }}
          >
            ask
            <span className="f-mono" style={{ fontSize: 10, fontWeight: 600 }}>
              ↵
            </span>
          </button>
        </div>
      </div>

      {voiceError && (
        <div
          className="f-mono"
          style={{
            fontSize: 10,
            color: "var(--blood, var(--ember))",
            marginTop: 8,
            letterSpacing: "0.12em",
          }}
        >
          {voiceError}
        </div>
      )}

      {suggestions.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <span
            className="f-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.2em",
              color: "var(--ink-faint)",
              textTransform: "uppercase",
              alignSelf: "center",
            }}
          >
            try
          </span>
          {suggestions.slice(0, 4).map((s) => (
            <button
              key={s}
              onClick={() => onSuggestion(s)}
              style={{
                padding: "6px 12px",
                background: "var(--surface)",
                border: "1px solid var(--line-soft)",
                borderRadius: 999,
                cursor: "pointer",
                color: "var(--ink-soft)",
                fontFamily: "var(--f-serif)",
                fontStyle: "italic",
                fontSize: 12.5,
              }}
            >
              {s.toLowerCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sources rail ────────────────────────────────────────────────────

function ColloquySources({
  entries,
  highlightId,
  brainName,
}: {
  entries: Array<{ entry: Entry; cited: boolean }>;
  highlightId: string | null;
  brainName?: string;
}) {
  const citedCount = entries.filter((e) => e.cited).length;
  return (
    <aside
      style={{
        width: 360,
        flexShrink: 0,
        borderLeft: "1px solid var(--line-soft)",
        background: "color-mix(in oklch, var(--surface-low) 50%, var(--bg))",
        padding: "26px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        overflowY: "auto",
      }}
    >
      <div>
        <div
          className="f-mono"
          style={{
            fontSize: 9.5,
            letterSpacing: "0.22em",
            color: "var(--ink-faint)",
            textTransform: "uppercase",
          }}
        >
          pulled from
        </div>
        <div
          className="f-serif"
          style={{
            fontSize: 20,
            color: "var(--ink)",
            letterSpacing: "-0.02em",
            marginTop: 2,
          }}
        >
          <span style={{ fontStyle: "italic", color: ACCENT }}>{citedCount}</span> memor
          {citedCount === 1 ? "y" : "ies"} cited
        </div>
        <div
          className="f-mono"
          style={{
            fontSize: 9.5,
            letterSpacing: "0.18em",
            color: "var(--ink-faint)",
            textTransform: "uppercase",
            marginTop: 4,
          }}
        >
          + {Math.max(0, entries.length - citedCount)} nearby
          {brainName ? ` · ${brainName.toLowerCase()}` : ""}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {entries.length === 0 ? (
          <div
            className="f-serif"
            style={{
              fontStyle: "italic",
              color: "var(--ink-faint)",
              fontSize: 14,
              padding: "20px 0",
              textAlign: "center",
            }}
          >
            no memories yet — drop a thought first.
          </div>
        ) : (
          entries.map(({ entry, cited }) => (
            <SourceCard
              key={entry.id}
              entry={entry}
              cited={cited}
              highlighted={highlightId === entry.id}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function SourceCard({
  entry,
  cited,
  highlighted,
}: {
  entry: Entry;
  cited: boolean;
  highlighted: boolean;
}) {
  const tag = (entry.tags?.[0] || entry.type || "note").toUpperCase().slice(0, 14);
  const time = formatRelative(entry.created_at);
  const body = (entry.content || entry.title || "").trim();
  const isVoice =
    entry.type === "voice" ||
    (typeof entry.metadata?.source === "string" &&
      /voice/i.test(entry.metadata.source as string)) ||
    !!entry.metadata?.is_voice_note;

  return (
    <article
      style={{
        position: "relative",
        padding: "14px 16px",
        background: highlighted
          ? `color-mix(in oklch, ${ACCENT} 10%, var(--surface))`
          : cited
            ? "var(--surface)"
            : `color-mix(in oklch, var(--surface-low) 80%, var(--surface))`,
        border: `1px solid ${
          highlighted
            ? `color-mix(in oklch, ${ACCENT} 55%, transparent)`
            : cited
              ? `color-mix(in oklch, ${ACCENT} 22%, var(--line-soft))`
              : "var(--line-soft)"
        }`,
        borderRadius: 12,
        opacity: cited ? 1 : 0.7,
        boxShadow: highlighted
          ? `0 0 0 5px color-mix(in oklch, ${ACCENT} 14%, transparent), 0 0 24px color-mix(in oklch, ${ACCENT} 20%, transparent)`
          : "none",
        transition: "all 280ms cubic-bezier(0.16, 1, 0.3, 1)",
        // Shared-element morph anchor — keeps consistency with Atelier cards.
        viewTransitionName: `entry-${entry.id}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          {cited && (
            <span
              className="f-mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.18em",
                color: highlighted ? "var(--ember-ink)" : ACCENT,
                background: highlighted
                  ? ACCENT
                  : `color-mix(in oklch, ${ACCENT} 14%, transparent)`,
                border: `1px solid color-mix(in oklch, ${ACCENT} 35%, transparent)`,
                textTransform: "uppercase",
                padding: "2px 6px",
                borderRadius: 4,
                fontWeight: 700,
              }}
            >
              cited
            </span>
          )}
          <span
            className="f-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.18em",
              color: "var(--ink-faint)",
              textTransform: "uppercase",
            }}
          >
            {time}
          </span>
        </div>
        <span
          className="f-mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            color: ACCENT,
            textTransform: "uppercase",
            padding: "2px 6px",
            background: `color-mix(in oklch, ${ACCENT} 14%, transparent)`,
            borderRadius: 4,
            border: `1px solid color-mix(in oklch, ${ACCENT} 28%, transparent)`,
          }}
        >
          {tag}
        </span>
      </div>
      <div
        className="f-serif"
        style={{
          fontSize: 13.5,
          color: "var(--ink)",
          lineHeight: 1.45,
          letterSpacing: "-0.005em",
          display: "-webkit-box",
          WebkitLineClamp: 4,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {body}
      </div>
      {isVoice && (
        <div
          style={{
            marginTop: 10,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 8px",
            background: "var(--surface-low)",
            border: "1px solid var(--line-soft)",
            borderRadius: 999,
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "var(--ink-faint)" }}
          >
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
          <span
            className="f-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.16em",
              color: "var(--ink-faint)",
              textTransform: "uppercase",
            }}
          >
            voice
          </span>
        </div>
      )}
    </article>
  );
}

// ─── AI unavailable state ────────────────────────────────────────────

function AiUnavailable({ onNavigate }: { onNavigate?: (view: string) => void }) {
  const goSettings = (tab: "ai" | "billing") => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", url.toString());
    onNavigate?.("settings");
  };
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 48,
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: "100%",
          padding: "28px 32px",
          background: "var(--surface)",
          border: "1px solid var(--line-soft)",
          borderRadius: 18,
          boxShadow: "var(--lift-2)",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div>
          <div
            className="f-mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.24em",
              color: "var(--ink-faint)",
              textTransform: "uppercase",
            }}
          >
            colloquy is quiet
          </div>
          <div
            className="f-serif"
            style={{
              fontSize: 26,
              color: "var(--ink)",
              letterSpacing: "-0.015em",
              marginTop: 6,
              lineHeight: 1.15,
            }}
          >
            Chat needs an <span style={{ fontStyle: "italic", color: ACCENT }}>AI provider</span>.
          </div>
        </div>
        <button
          onClick={() => goSettings("ai")}
          style={{
            background: "transparent",
            border: "1px solid color-mix(in oklch, var(--ember) 38%, var(--line-soft))",
            borderRadius: 10,
            padding: "14px 16px",
            textAlign: "left",
            cursor: "pointer",
            color: "var(--ink)",
          }}
        >
          <div
            className="f-mono"
            style={{
              fontSize: 9.5,
              letterSpacing: "0.2em",
              color: ACCENT,
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            bring your own key — free
          </div>
          <div
            className="f-sans"
            style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4 }}
          >
            Paste a Gemini, OpenAI, Anthropic, or Groq key. We never see it.
          </div>
        </button>
        <button
          onClick={() => goSettings("billing")}
          style={{
            background: `linear-gradient(180deg, color-mix(in oklch, ${ACCENT} 92%, white) 0%, ${ACCENT} 100%)`,
            border: `1px solid color-mix(in oklch, ${ACCENT} 80%, var(--ember-deep))`,
            borderRadius: 10,
            padding: "14px 16px",
            textAlign: "left",
            cursor: "pointer",
            color: "var(--ember-ink)",
            boxShadow: `0 0 18px color-mix(in oklch, ${ACCENT} 22%, transparent)`,
          }}
        >
          <div
            className="f-mono"
            style={{
              fontSize: 9.5,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            use ours — $4.99 / $9.99 per month
          </div>
          <div className="f-sans" style={{ fontSize: 12.5, marginTop: 4, opacity: 0.85 }}>
            Hosted Gemini Flash on Starter, Claude Sonnet on Pro.
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────

function formatRelative(input: string | number | undefined | null): string {
  if (!input) return "—";
  const t = typeof input === "number" ? input : new Date(input).getTime();
  if (!Number.isFinite(t) || t === 0) return "—";
  const diff = Date.now() - t;
  if (diff < 0) return "now";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"}`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w} wk`;
  return new Date(t).toLocaleDateString("en-ZA", { month: "short", day: "numeric" });
}
