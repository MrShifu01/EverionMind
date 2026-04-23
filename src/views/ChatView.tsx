import { useRef, useEffect, useState, useCallback } from "react";
import { useChat, type ChatMessage, type DebugInfo } from "../hooks/useChat";
import { useAdminDevMode } from "../hooks/useAdminDevMode";
import { useEntries } from "../context/EntriesContext";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import type { Entry } from "../types";
import { cn } from "../lib/cn";
import { hasAIAccess } from "../lib/aiSettings";

const SUGGESTIONS_TTL = 86_400_000; // 24 h

function cacheKey(brainId: string | undefined) {
  return `everion_chat_suggestions_${brainId ?? "default"}`;
}

function readSuggestionsCache(brainId: string | undefined): string[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(brainId));
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    return Date.now() - ts < SUGGESTIONS_TTL ? data : null;
  } catch { return null; }
}

function writeSuggestionsCache(brainId: string | undefined, data: string[]) {
  try {
    localStorage.setItem(cacheKey(brainId), JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

function derivePrompts(entries: Entry[]): string[] {
  const out: string[] = [];
  const types = new Set(entries.map((e) => e.type));
  const contacts = entries.filter((e) => e.type === "contact" || e.type === "person");
  const hasUpcoming = entries.some(
    (e) => e.metadata?.due_date || e.metadata?.event_date || e.metadata?.deadline,
  );
  if (hasUpcoming)           out.push("what's coming up soon?");
  if (types.has("reminder")) out.push("what still needs doing?");
  if (contacts.length > 0)   out.push(`what do i know about ${contacts[0].title.split(" ")[0]}?`);
  if (types.has("idea"))     out.push("any unactioned ideas?");
  if (types.has("link"))     out.push("what links have i saved?");
  if (entries.length > 15)   out.push("find any duplicates to merge");
  if (types.has("note"))     out.push("summarise my recent notes");
  if (contacts.length > 1)   out.push("who should i follow up with?");
  return out.slice(0, 4);
}

function useHasAIAccess() {
  const [access, setAccess] = useState(() => hasAIAccess());
  useEffect(() => {
    const handler = () => setAccess(hasAIAccess());
    window.addEventListener("aiSettingsLoaded", handler);
    return () => window.removeEventListener("aiSettingsLoaded", handler);
  }, []);
  return access;
}


const TOOL_LABELS: Record<string, string> = {
  retrieve_memory: "searched memory",
  search_entries: "searched entries",
  get_entry: "fetched entry",
  get_upcoming: "checked upcoming dates",
  create_entry: "created entry",
  update_entry: "updated entry",
  delete_entry: "deleted entry",
};

function ToolCallDebug({ tc }: { tc: NonNullable<ChatMessage["tool_calls"]>[number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: "1px solid var(--line-soft)", borderRadius: 6, overflow: "hidden", fontFamily: "monospace" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", textAlign: "left", padding: "5px 10px", background: "var(--surface-low)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: "var(--ink-soft)", fontSize: 11 }}
      >
        <span style={{ color: "var(--ember)", fontWeight: 600, flexShrink: 0 }}>fn</span>
        <span style={{ fontWeight: 600 }}>{tc.tool}</span>
        <span style={{ marginLeft: "auto", opacity: 0.5, fontSize: 10 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ borderTop: "1px solid var(--line-soft)", fontSize: 11 }}>
          {tc.args != null && (
            <div style={{ padding: "6px 10px", borderBottom: "1px solid var(--line-soft)" }}>
              <div style={{ color: "var(--ink-ghost)", marginBottom: 3, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>args</div>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", color: "var(--ink-soft)", maxHeight: 180, overflow: "auto" }}>{JSON.stringify(tc.args, null, 2)}</pre>
            </div>
          )}
          <div style={{ padding: "6px 10px" }}>
            <div style={{ color: "var(--ink-ghost)", marginBottom: 3, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>result</div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", color: "var(--ink-soft)", maxHeight: 180, overflow: "auto" }}>{JSON.stringify(tc.result, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminDebugPanel({ debug, toolCalls }: { debug: DebugInfo; toolCalls?: ChatMessage["tool_calls"] }) {
  const [open, setOpen] = useState(false);
  const hasTools = toolCalls && toolCalls.length > 0;
  return (
    <div style={{ marginTop: 10, borderTop: "1px dashed var(--line-soft)", paddingTop: 8 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--ink-ghost)", fontFamily: "monospace", fontSize: 11, flexWrap: "wrap" }}
      >
        <span style={{ color: "var(--ember)", opacity: 0.7, fontSize: 10 }}>⬡</span>
        <span>{debug.provider}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>{debug.model}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>{debug.latency_ms}ms</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>{debug.rounds} {debug.rounds === 1 ? "round" : "rounds"}</span>
        {hasTools && <><span style={{ opacity: 0.4 }}>·</span><span>{toolCalls.length} tool{toolCalls.length !== 1 ? "s" : ""}</span></>}
        {debug.error && <><span style={{ opacity: 0.4 }}>·</span><span style={{ color: "var(--blood)" }}>error</span></>}
        <span style={{ opacity: 0.4, fontSize: 10, marginLeft: 2 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {debug.error && (
            <div style={{ padding: "6px 10px", borderRadius: 6, background: "var(--blood-wash)", border: "1px solid var(--blood)", fontFamily: "monospace", fontSize: 11, color: "var(--blood)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {debug.error}
            </div>
          )}
          {toolCalls?.map((tc, i) => <ToolCallDebug key={i} tc={tc} />)}
        </div>
      )}
    </div>
  );
}

interface ChatViewProps {
  brainId: string | undefined;
}

const IconSend = (
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
    <path d="M4 12 20 4l-7 16-2-7-7-1z" />
  </svg>
);

const IconMic = ({ on = false }: { on?: boolean }) =>
  on ? (
    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  ) : (
    <svg
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );

const IconCopy = (
  <svg
    width="12"
    height="12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const RICH_PATTERN =
  /(\+\d[\d\s\-]{8,13}\d|\b0\d{9}\b|[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}|https?:\/\/[^\s<>]+)/g;

const PHONE_RE = /(\+\d[\d\s\-]{8,13}\d|\b0\d{9}\b)/;
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

function firstPhone(text: string): string | null {
  const m = text.match(PHONE_RE);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, "");
  return digits.startsWith("0") ? "27" + digits.slice(1) : digits;
}

function firstEmail(text: string): string | null {
  const m = text.match(EMAIL_RE);
  return m ? m[0] : null;
}

function renderRichText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  RICH_PATTERN.lastIndex = 0;
  while ((m = RICH_PATTERN.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const raw = m[0];
    if (raw.startsWith("http")) {
      parts.push(
        <a key={m.index} href={raw} target="_blank" rel="noopener noreferrer"
           style={{ color: "var(--ember)", textDecoration: "underline" }}>{raw}</a>
      );
    } else if (raw.includes("@")) {
      parts.push(
        <a key={m.index} href={`mailto:${raw}`}
           style={{ color: "var(--ember)", textDecoration: "underline" }}>{raw}</a>
      );
    } else {
      const digits = raw.replace(/\D/g, "");
      const intl = digits.startsWith("0") ? `27${digits.slice(1)}` : digits;
      parts.push(
        <span key={m.index}>
          <a href={`tel:+${intl}`} style={{ color: "var(--ember)", textDecoration: "underline" }}>{raw}</a>
          <a href={`https://wa.me/${intl}`} target="_blank" rel="noopener noreferrer"
             className="f-sans"
             style={{ marginLeft: 6, fontSize: 11, color: "var(--ink-faint)", verticalAlign: "middle" }}>wa</a>
        </span>
      );
    }
    last = m.index + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const IconCheck = (
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12l4 4 10-10" />
  </svg>
);

const IconShare = (
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
    <path d="M12 3v11M8 7l4-4 4 4" />
  </svg>
);

const IconPhone = (
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.77h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.4a16 16 0 0 0 5.67 5.67l.95-.95a2 2 0 0 1 2.11-.45c.908.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const IconEmail = (
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m2 7 10 7 10-7" />
  </svg>
);

export default function ChatView({ brainId }: ChatViewProps) {
  const aiAvailable = useHasAIAccess();
  const { isAdmin } = useAdminDevMode();
  const { messages, loading, pendingAction, send, confirm, cancel, clearHistory } = useChat(brainId);
  const { entries, entriesLoaded } = useEntries();
  const [noMemoryToast, setNoMemoryToast] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(() => readSuggestionsCache(brainId) ?? []);

  useEffect(() => {
    if (!entriesLoaded || entries.length === 0) return;
    if (readSuggestionsCache(brainId) !== null) return; // still fresh
    const fresh = derivePrompts(entries);
    writeSuggestionsCache(brainId, fresh);
    setSuggestions(fresh);
  }, [entriesLoaded, brainId]);

  if (!aiAvailable) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", background: "var(--bg)", textAlign: "center", gap: 16 }}>
        <p className="f-serif" style={{ fontSize: 22, fontStyle: "italic", color: "var(--ink-soft)", lineHeight: 1.4, margin: 0, maxWidth: 400 }}>
          Chat needs an AI provider.
        </p>
        <p className="f-sans" style={{ fontSize: 14, color: "var(--ink-ghost)", margin: 0, maxWidth: 360, lineHeight: 1.6 }}>
          Add your own API key in Settings → AI → BYOK, or upgrade to a Pro plan for managed access.
        </p>
      </div>
    );
  }
  const [input, setInput] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [sharedIdx, setSharedIdx] = useState<number | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const { listening, startVoice } = useVoiceRecorder({
    onTranscript: (t) => {
      setInput((prev) => (prev ? `${prev} ${t}` : t));
      setVoiceStatus(null);
    },
    onStatus: setVoiceStatus,
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
    if (entriesLoaded && entries.length === 0) {
      setNoMemoryToast(true);
      setTimeout(() => setNoMemoryToast(false), 3000);
      return;
    }
    setInput("");
    send(text);
  }, [input, loading, send, entries, entriesLoaded]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleExampleClick = useCallback(
    (prompt: string) => {
      send(prompt);
    },
    [send],
  );

  const handleCopy = useCallback((text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    });
  }, []);

  const handleShare = useCallback(async (text: string, idx: number) => {
    if (navigator.share) {
      try { await navigator.share({ text }); } catch { return; }
    } else {
      await navigator.clipboard.writeText(text);
    }
    setSharedIdx(idx);
    setTimeout(() => setSharedIdx(null), 1500);
  }, []);

  const noMemory = entriesLoaded && entries.length === 0;

  const Composer = (
    <div
      className="chat-composer"
      style={{
        padding: "14px 24px calc(14px + env(safe-area-inset-bottom, 0px))",
        borderTop: "1px solid var(--line-soft)",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          maxWidth: 820,
          margin: "0 auto",
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 18,
          padding: "10px 14px",
          display: "flex",
          alignItems: "flex-end",
          gap: 10,
        }}
      >
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={voiceLoading}
            placeholder={
              listening
                ? "listening… tap stop when done"
                : voiceLoading
                  ? "transcribing…"
                  : "ask your memory…"
            }
            rows={1}
            className="f-serif resize-none bg-transparent outline-none"
            style={{
              width: "100%",
              fontSize: 16,
              lineHeight: 1.5,
              minHeight: 24,
              maxHeight: 140,
              padding: "6px 0",
              color: "var(--ink)",
              fontStyle: input ? "normal" : "italic",
              border: 0,
            }}
          />
          {voiceError && (
            <span
              className="f-sans"
              style={{ fontSize: 11, color: "var(--blood)", paddingBottom: 4 }}
            >
              {voiceError}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={startVoice}
          disabled={voiceLoading}
          className="design-btn-ghost press"
          aria-label={listening ? "Stop recording" : "Voice note"}
          style={{
            width: 36,
            height: 36,
            minHeight: 36,
            padding: 0,
            color: listening ? "var(--ember)" : "var(--ink-faint)",
          }}
        >
          <IconMic on={listening} />
        </button>
        <button
          onClick={handleSend}
          aria-label="Send message"
          className="press"
          style={{
            width: 36,
            height: 36,
            minHeight: 36,
            borderRadius: 8,
            background: input.trim() && !noMemory ? "var(--ember)" : "var(--surface-high)",
            color: input.trim() && !noMemory ? "var(--ember-ink)" : "var(--ink-faint)",
            border: 0,
            cursor: !input.trim() || loading ? "not-allowed" : noMemory ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 180ms",
            opacity: noMemory ? 0.45 : 1,
          }}
        >
          {IconSend}
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="chat-root"
      style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0, background: "var(--bg)" }}
    >
      {noMemoryToast && (
        <div
          className="f-serif anim-fade-in-design"
          style={{
            position: "fixed",
            bottom: 110,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--surface-high)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            padding: "10px 20px",
            zIndex: 200,
            fontSize: 14,
            fontStyle: "italic",
            color: "var(--ink-soft)",
            boxShadow: "var(--lift-2)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          add memories before chatting.
        </div>
      )}
      {/* ── Top bar ── */}
      <header
        className="chat-topbar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--line-soft)",
          gap: 20,
        }}
      >
        <div>
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
            Chat
          </h1>
          <div
            className="f-serif"
            style={{ fontSize: 14, color: "var(--ink-faint)", fontStyle: "italic", marginTop: 4 }}
          >
            a conversation with your memory
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div
            className="chat-topbar-search"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "0 10px 0 14px",
              height: 40,
              minWidth: 280,
              background: "var(--surface)",
              border: "1px solid var(--line-soft)",
              borderRadius: 8,
              cursor: "pointer",
            }}
            onClick={() =>
              window.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
              )
            }
          >
            <svg
              width="14" height="14"
              fill="none" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"
              viewBox="0 0 24 24"
              style={{ color: "var(--ink-faint)", flexShrink: 0 }}
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="6.5" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span
              className="f-sans flex-1"
              style={{ fontSize: 13, color: "var(--ink-faint)" }}
            >
              Search everything
            </span>
            <span style={{ display: "inline-flex", gap: 2, flexShrink: 0 }}>
              <kbd
                className="f-sans"
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  minWidth: 18, height: 18, padding: "0 5px",
                  background: "var(--surface-low)", border: "1px solid var(--line)",
                  borderRadius: 4, fontSize: 11, color: "var(--ink-faint)", fontWeight: 500,
                }}
              >
                Ctrl
              </kbd>
              <kbd
                className="f-sans"
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  minWidth: 18, height: 18, padding: "0 5px",
                  background: "var(--surface-low)", border: "1px solid var(--line)",
                  borderRadius: 4, fontSize: 11, color: "var(--ink-faint)", fontWeight: 500,
                }}
              >
                K
              </kbd>
            </span>
          </div>
          {messages.length > 0 && (
            <button
              onClick={clearHistory}
              className="design-btn-ghost press"
              style={{ fontSize: 13, height: 32, minHeight: 32, padding: "0 12px" }}
            >
              clear
            </button>
          )}
        </div>
      </header>

      {messages.length === 0 ? (
        /* ── Empty state ── */
        <div
          className="flex flex-1 flex-col"
          style={{ minHeight: 0, alignItems: "center" }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              padding: "40px 24px",
              maxWidth: 560,
              width: "100%",
              textAlign: "center",
            }}
          >
            {noMemory ? (
              <p
                className="f-serif"
                style={{
                  fontSize: 18,
                  fontStyle: "italic",
                  color: "var(--ink-ghost)",
                  lineHeight: 1.5,
                  margin: 0,
                  letterSpacing: "-0.005em",
                }}
              >
                add some memories before you start chatting.
              </p>
            ) : (
              <>
                <p
                  className="f-serif"
                  style={{
                    fontSize: 22,
                    fontStyle: "italic",
                    color: "var(--ink-soft)",
                    lineHeight: 1.4,
                    margin: 0,
                    letterSpacing: "-0.005em",
                  }}
                >
                  Ask me anything about what you've written down.
                </p>

                {suggestions.length > 0 && (
                  <div
                    style={{
                      marginTop: 40,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      width: "100%",
                    }}
                  >
                    {suggestions.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => handleExampleClick(prompt)}
                        disabled={loading}
                        className="press"
                        style={{
                          textAlign: "left",
                          padding: "12px 16px",
                          borderRadius: 10,
                          background: "var(--surface)",
                          border: "1px solid var(--line-soft)",
                          color: "var(--ink-soft)",
                          fontFamily: "var(--f-serif)",
                          fontSize: 14,
                          lineHeight: 1,
                          fontStyle: "italic",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          transition: "background 180ms, border-color 180ms, color 180ms",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--surface-high)";
                          e.currentTarget.style.color = "var(--ink)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "var(--surface)";
                          e.currentTarget.style.color = "var(--ink-soft)";
                        }}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          {Composer}
        </div>
      ) : (
        <>
          {/* ── Messages ── */}
          <div
            className="scrollbar-hide"
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "28px 24px",
              minHeight: 0,
            }}
            aria-live="polite"
          >
            <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 28 }}>
              {messages.map((msg, i) => {
                const phone = msg.role === "assistant" ? firstPhone(msg.content) : null;
                const email = msg.role === "assistant" ? firstEmail(msg.content) : null;
                const actionBtnStyle = (color: string): React.CSSProperties => ({
                  display: "inline-flex", alignItems: "center", gap: 6,
                  height: 26, minHeight: 26, padding: "0 10px", borderRadius: 4,
                  background: "transparent", border: "1px solid var(--line-soft)",
                  color, fontFamily: "var(--f-sans)", fontSize: 11, fontWeight: 500,
                  cursor: "pointer", transition: "color 180ms, border-color 180ms",
                  textDecoration: "none",
                });
                return (
                <div
                  key={i}
                  className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
                >
                  {msg.role === "user" ? (
                    /* User bubble — sans, right-aligned */
                    <div
                      className="f-sans"
                      style={{
                        background: "var(--surface-high)",
                        border: "1px solid var(--line-soft)",
                        padding: "12px 18px",
                        borderRadius: 18,
                        maxWidth: "70%",
                        fontSize: 15,
                        lineHeight: 1.5,
                        color: "var(--ink)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {msg.content}
                    </div>
                  ) : (
                    /* Assistant — serif, no bubble, just prose */
                    <div style={{ maxWidth: "90%" }}>
                      {msg.tool_calls && msg.tool_calls.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                          {msg.tool_calls.map((tc, j) => (
                            <span
                              key={j}
                              className="f-sans"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "6px 12px",
                                minHeight: 28,
                                height: 28,
                                border: "1px solid var(--line-soft)",
                                borderRadius: 999,
                                background: "var(--surface-low)",
                                color: "var(--ink-faint)",
                                fontSize: 12,
                              }}
                            >
                              <svg
                                width="12"
                                height="12"
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
                              {TOOL_LABELS[tc.tool] ?? tc.tool}
                            </span>
                          ))}
                        </div>
                      )}

                      <div
                        className="f-serif"
                        style={{
                          fontSize: 18,
                          lineHeight: 1.65,
                          color: "var(--ink)",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {renderRichText(msg.content)}
                      </div>

                      <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
                        <button
                          onClick={() => handleCopy(msg.content, i)}
                          className="press"
                          aria-label="Copy response"
                          style={actionBtnStyle(copiedIdx === i ? "var(--moss)" : "var(--ink-faint)")}
                        >
                          {copiedIdx === i ? IconCheck : IconCopy}
                          {copiedIdx === i ? "copied" : "copy"}
                        </button>
                        <button
                          onClick={() => handleShare(msg.content, i)}
                          className="press"
                          aria-label="Share response"
                          style={actionBtnStyle(sharedIdx === i ? "var(--moss)" : "var(--ink-faint)")}
                        >
                          {sharedIdx === i ? IconCheck : IconShare}
                          {sharedIdx === i ? "shared" : "share"}
                        </button>
                        {phone && (
                          <a href={`tel:+${phone}`} className="press" aria-label="Call" style={actionBtnStyle("var(--ink-faint)")}>
                            {IconPhone} call
                          </a>
                        )}
                        {phone && (
                          <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer" className="press" aria-label="WhatsApp" style={actionBtnStyle("var(--ink-faint)")}>
                            wa
                          </a>
                        )}
                        {email && (
                          <a href={`mailto:${email}`} className="press" aria-label="Email" style={actionBtnStyle("var(--ink-faint)")}>
                            {IconEmail} email
                          </a>
                        )}
                      </div>
                      {isAdmin && msg.debug && (
                        <AdminDebugPanel debug={msg.debug} toolCalls={msg.tool_calls} />
                      )}
                    </div>
                  )}
                </div>
                );
              })}

              {/* Thinking state */}
              {loading && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "var(--ember)",
                      animation: "design-breathe 3.5s ease-in-out infinite",
                    }}
                  />
                  <span
                    className="f-serif"
                    style={{
                      fontSize: 15,
                      fontStyle: "italic",
                      color: "var(--ink-faint)",
                    }}
                  >
                    thinking…
                  </span>
                </div>
              )}

              {/* Confirmation card */}
              {pendingAction && !loading && (
                <div
                  style={{
                    border: "1px solid var(--blood)",
                    background: "var(--blood-wash)",
                    borderRadius: 12,
                    padding: 18,
                  }}
                >
                  <p
                    className="f-serif"
                    style={{
                      fontSize: 15,
                      color: "var(--ink)",
                      margin: "0 0 14px",
                      lineHeight: 1.5,
                    }}
                  >
                    {pendingAction.label}
                  </p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={confirm}
                      className="press"
                      style={{
                        flex: 1,
                        height: 36,
                        minHeight: 36,
                        background: "var(--blood)",
                        color: "var(--ember-ink)",
                        borderRadius: 8,
                        border: 0,
                        fontFamily: "var(--f-sans)",
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      Confirm
                    </button>
                    <button
                      onClick={cancel}
                      className="design-btn-secondary press"
                      style={{ flex: 1, height: 36, minHeight: 36 }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div ref={endRef} />
            </div>
          </div>

          {Composer}
        </>
      )}
    </div>
  );
}
