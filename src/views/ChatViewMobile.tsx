// COLLOQUY · Mobile chat
// ─────────────────────────────────────────────────────────────────────
// Mobile twin of ChatViewColloquy (desktop). Same Inkwell vocabulary,
// same asymmetric bubble grammar, same composer treatment — adapted
// for a single column. No sources rail on mobile (would crowd the
// conversation); citations remain inline as chips on brain messages
// once useChat exposes source IDs.
//
// View-transitions: the composer carries the same
// `view-transition-name: ask-input` as MobileHome's Ask pill, so the
// Ask pill on home morphs into the composer's input pill when the
// user navigates from home → chat. The startViewTransition wrap is
// handled by Everion's navigateView when onNavigate("chat") fires.

import { useRef, useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { useChat } from "../hooks/useChat";
import { useEntries } from "../context/EntriesContext";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import {
  useHasAIAccess,
  readSuggestionsCache,
  writeSuggestionsCache,
  derivePrompts,
  renderMarkdown,
} from "./chatUtils";

const ACCENT = "var(--ember)";

interface ChatViewMobileProps {
  brainId: string | undefined;
  brainName?: string;
  onNavigate?: (view: string) => void;
}

export default function ChatViewMobile({ brainId, brainName, onNavigate }: ChatViewMobileProps) {
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
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

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

  if (!aiAvailable) {
    return <AiUnavailable onNavigate={onNavigate} />;
  }

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
      }}
    >
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          padding: "14px 16px 12px",
          borderBottom: "1px solid var(--line-soft)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button
          type="button"
          aria-label="Back to home"
          onClick={() => onNavigate?.("home")}
          className="press"
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: "var(--surface)",
            border: "1px solid var(--line-soft)",
            color: "var(--ink-soft)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="f-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.22em",
              color: "var(--ink-faint)",
              textTransform: "uppercase",
            }}
          >
            ask · colloquy
          </div>
          <div
            className="f-serif"
            style={{
              fontSize: 18,
              color: "var(--ink)",
              letterSpacing: "-0.015em",
              lineHeight: 1.15,
              marginTop: 1,
            }}
          >
            <span style={{ fontStyle: "italic", color: ACCENT }}>colloquy</span>
            {brainName ? <span> · {brainName.toLowerCase()}</span> : null}
          </div>
        </div>
        <span
          className="f-mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.16em",
            color: "var(--ink-faint)",
            textTransform: "uppercase",
            flexShrink: 0,
          }}
        >
          {entries.length} mem
        </span>
      </div>

      {/* Conversation */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "20px 16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {messages.length === 0 && entriesLoaded && entries.length > 0 && <Hero />}
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} text={m.content} />
        ))}
        {loading && <ThinkingBubble />}
        <div ref={endRef} />
      </div>

      {/* Composer */}
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
  );
}

// ─── Empty-state hero ────────────────────────────────────────────────

function Hero() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: "32px 8px",
        textAlign: "center",
      }}
    >
      <BrainAvatar size={48} />
      <div>
        <div
          className="f-mono"
          style={{
            fontSize: 9.5,
            letterSpacing: "0.24em",
            color: "var(--ink-faint)",
            textTransform: "uppercase",
          }}
        >
          a colloquy with your brain
        </div>
        <div
          className="f-serif"
          style={{
            fontSize: 19,
            color: "var(--ink)",
            letterSpacing: "-0.015em",
            marginTop: 6,
            fontStyle: "italic",
          }}
        >
          ask anything you've kept.
        </div>
      </div>
    </div>
  );
}

// ─── Bubbles ─────────────────────────────────────────────────────────

function Bubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  if (role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          className="f-serif"
          style={{
            maxWidth: "82%",
            padding: "10px 14px",
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
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <BrainAvatar />
      <div style={{ maxWidth: "82%", display: "flex", flexDirection: "column", gap: 6 }}>
        <div
          className="f-serif"
          style={{
            fontSize: 15,
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
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <BrainAvatar />
      <div
        className="f-mono"
        style={{
          fontSize: 10.5,
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

function BrainAvatar({ size = 26 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
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
      <svg
        width={Math.round(size * 0.5)}
        height={Math.round(size * 0.5)}
        viewBox="0 0 24 24"
        fill="none"
      >
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
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  // Auto-grow textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [input, inputRef]);

  return (
    <div
      style={{
        flexShrink: 0,
        padding: `14px 14px max(env(safe-area-inset-bottom, 0px), 14px)`,
        borderTop: "1px solid var(--line-soft)",
        background: "color-mix(in oklch, var(--surface-low) 30%, var(--bg))",
      }}
    >
      {suggestions.length > 0 && input.length === 0 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 10,
            overflowX: "auto",
            paddingBottom: 2,
          }}
          className="scrollbar-hide"
        >
          {suggestions.slice(0, 4).map((s) => (
            <button
              key={s}
              onClick={() => onSuggestion(s)}
              style={{
                flexShrink: 0,
                padding: "6px 11px",
                background: "var(--surface)",
                border: "1px solid var(--line-soft)",
                borderRadius: 999,
                cursor: "pointer",
                color: "var(--ink-soft)",
                fontFamily: "var(--f-serif)",
                fontStyle: "italic",
                fontSize: 12,
                whiteSpace: "nowrap",
              }}
            >
              {s.toLowerCase()}
            </button>
          ))}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          padding: "8px 10px 8px 14px",
          background: "var(--surface)",
          border: `1px solid color-mix(in oklch, var(--ember) 32%, var(--line-soft))`,
          borderRadius: 16,
          boxShadow: `0 0 0 4px color-mix(in oklch, var(--ember) 8%, transparent), var(--lift-1)`,
          // Shared-element morph target from MobileHome's Ask pill
          // (same `view-transition-name: ask-input`). When the user
          // navigates home → chat, the pill grows from its home
          // position into this composer.
          viewTransitionName: "ask-input",
        }}
      >
        <textarea
          ref={inputRef}
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
          rows={1}
          className="f-serif"
          style={{
            flex: 1,
            minWidth: 0,
            resize: "none",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--ink)",
            fontSize: 16,
            fontStyle: input ? "normal" : "italic",
            lineHeight: 1.5,
            padding: "6px 0",
            minHeight: 24,
            maxHeight: 132,
          }}
        />
        <button
          type="button"
          onClick={onStartVoice}
          disabled={voiceLoading}
          aria-label={listening ? "Stop recording" : "Voice"}
          style={{
            flexShrink: 0,
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "transparent",
            border: "1px solid var(--line-soft)",
            color: listening ? ACCENT : "var(--ink-soft)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {listening ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={onSend}
          disabled={!input.trim()}
          aria-label="Send message"
          style={{
            flexShrink: 0,
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: input.trim() ? ACCENT : "var(--surface-low)",
            color: input.trim() ? "var(--ember-ink)" : "var(--ink-faint)",
            border: "none",
            cursor: input.trim() ? "pointer" : "not-allowed",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: input.trim()
              ? `0 0 16px color-mix(in oklch, var(--ember) 28%, transparent)`
              : "none",
            transition: "background 200ms, box-shadow 200ms",
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12l7-7 7 7M12 5v14" />
          </svg>
        </button>
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
    </div>
  );
}

// ─── AI unavailable ──────────────────────────────────────────────────

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
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 380,
          width: "100%",
          padding: "22px 22px 24px",
          background: "var(--surface)",
          border: "1px solid var(--line-soft)",
          borderRadius: 18,
          boxShadow: "var(--lift-2)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div>
          <div
            className="f-mono"
            style={{
              fontSize: 9.5,
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
              fontSize: 22,
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
            border: `1px solid color-mix(in oklch, ${ACCENT} 38%, var(--line-soft))`,
            borderRadius: 10,
            padding: "12px 14px",
            textAlign: "left",
            cursor: "pointer",
            color: "var(--ink)",
          }}
        >
          <div
            className="f-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.2em",
              color: ACCENT,
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            bring your own key — free
          </div>
          <div className="f-sans" style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
            Gemini, OpenAI, Anthropic, or Groq. We never see it.
          </div>
        </button>
        <button
          onClick={() => goSettings("billing")}
          style={{
            background: `linear-gradient(180deg, color-mix(in oklch, ${ACCENT} 92%, white) 0%, ${ACCENT} 100%)`,
            border: `1px solid color-mix(in oklch, ${ACCENT} 80%, var(--ember-deep))`,
            borderRadius: 10,
            padding: "12px 14px",
            textAlign: "left",
            cursor: "pointer",
            color: "var(--ember-ink)",
            boxShadow: `0 0 18px color-mix(in oklch, ${ACCENT} 22%, transparent)`,
          }}
        >
          <div
            className="f-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            use ours — $4.99 / $9.99 per month
          </div>
          <div className="f-sans" style={{ fontSize: 12, marginTop: 4, opacity: 0.85 }}>
            Hosted Gemini Flash on Starter, Claude Sonnet on Pro.
          </div>
        </button>
      </div>
    </div>
  );
}
