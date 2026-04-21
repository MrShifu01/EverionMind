import { useRef, useEffect, useState, useCallback } from "react";
import { useKeyboardVisible } from "../hooks/useKeyboardVisible";
import { useChat } from "../hooks/useChat";
import { cn } from "../lib/cn";

const EXAMPLE_PROMPTS = [
  "What's coming up in the next 30 days?",
  "Do I have Avela's bank details?",
  "What information am I missing for my staff?",
  "Find any duplicate entries I should merge",
];

const EXAMPLE_ICONS = ["📅", "💳", "👥", "🔍"];

const TOOL_LABELS: Record<string, string> = {
  retrieve_memory: "Searching memory…",
  search_entries: "Searching entries…",
  get_entry: "Fetching entry…",
  get_upcoming: "Checking upcoming dates…",
  create_entry: "Creating entry…",
  update_entry: "Updating entry…",
  delete_entry: "Deleting entry…",
};

interface ChatViewProps {
  brainId: string | undefined;
}

/* Inline orbital animation — no HeroOrbital component exists */
function WelcomeOrbital() {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
      {/* Outer pulsing ring */}
      <div
        className="absolute inset-0 rounded-full animate-ping"
        style={{
          background: "transparent",
          border: "1px solid var(--color-primary)",
          opacity: 0.15,
          animationDuration: "2.4s",
        }}
      />
      {/* Mid ring */}
      <div
        className="absolute rounded-full animate-ping"
        style={{
          inset: 16,
          background: "transparent",
          border: "1px solid var(--color-secondary)",
          opacity: 0.2,
          animationDuration: "1.8s",
          animationDelay: "0.3s",
        }}
      />
      {/* Inner ring */}
      <div
        className="absolute rounded-full animate-ping"
        style={{
          inset: 32,
          background: "transparent",
          border: "1px solid var(--color-primary)",
          opacity: 0.3,
          animationDuration: "1.2s",
          animationDelay: "0.6s",
        }}
      />
      {/* Core icon */}
      <div
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: 52,
          height: 52,
          background: "var(--color-surface-container-high)",
          border: "1px solid var(--color-outline-variant)",
          boxShadow: "0 0 24px oklch(68% 0.09 75 / 0.2)",
        }}
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 18V5" />
          <path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" />
          <path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" />
          <path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" />
          <path d="M18 18a4 4 0 0 0 2-7.464" />
          <path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" />
          <path d="M6 18a4 4 0 0 1-2-7.464" />
          <path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" />
        </svg>
      </div>
    </div>
  );
}

/* Violet sparkle avatar for AI messages */
function AIAvatar({ pulse = false }: { pulse?: boolean }) {
  return (
    <div
      className={cn(
        "flex-shrink-0 flex items-center justify-center rounded-full",
        pulse && "animate-pulse",
      )}
      style={{
        width: 30,
        height: 30,
        background: "var(--color-secondary-container)",
        border: "1px solid var(--color-outline-variant)",
      }}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-secondary)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
        <path d="M5 3l.75 2.25L8 6l-2.25.75L5 9l-.75-2.25L2 6l2.25-.75z" />
        <path d="M19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75z" />
      </svg>
    </div>
  );
}

export default function ChatView({ brainId }: ChatViewProps) {
  const { messages, loading, pendingAction, send, confirm, cancel, clearHistory } = useChat(brainId);
  const [input, setInput] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const keyboardVisible = useKeyboardVisible();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    send(text);
  }, [input, loading, send]);

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

  const inputBar = (
    <div className="px-3 py-3">
      <div
        className="glass-panel synapse-glow flex items-end gap-2 rounded-2xl px-4 py-2"
        style={{ border: "1px solid var(--color-outline-variant)" }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything…"
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm outline-none"
          style={{
            color: "var(--color-on-surface)",
            maxHeight: "120px",
            overflowY: "auto",
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          aria-label="Send message"
          className="press-scale flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-all duration-150 disabled:opacity-40"
          style={{
            background: input.trim() ? "var(--color-primary)" : "var(--color-surface-container-high)",
            color: input.trim() ? "var(--color-on-primary)" : "var(--color-on-surface-variant)",
            boxShadow: input.trim() ? "0 0 12px oklch(68% 0.09 75 / 0.3)" : "none",
          }}
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
            />
          </svg>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--color-outline-variant)" }}
      >
        <div>
          <p
            className="caps-label"
            style={{ color: "var(--color-secondary)", marginBottom: 2 }}
          >
            Intelligence Console
          </p>
          <h2 className="font-headline text-base font-semibold" style={{ color: "var(--color-on-surface)", margin: 0 }}>
            Ask your{" "}
            <span className="gradient-text">brain</span>
          </h2>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            className="press-scale text-xs px-2 py-1 rounded-lg transition-colors"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            Clear
          </button>
        )}
      </div>

      {messages.length === 0 ? (
        /* ── Welcome state ── */
        <div className="flex flex-1 flex-col items-center justify-center px-4 gap-6">
          {/* Orbital hero */}
          <div className="flex flex-col items-center gap-4">
            <WelcomeOrbital />
            <div className="text-center">
              <h3
                className="font-headline text-xl font-semibold"
                style={{ color: "var(--color-on-surface)", margin: "0 0 4px" }}
              >
                Ask your{" "}
                <span className="gradient-text">brain</span>
              </h3>
              <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
                Chat directly with your memory database
              </p>
            </div>
          </div>

          {/* Suggestion chips */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 w-full max-w-md">
            {EXAMPLE_PROMPTS.map((prompt, i) => (
              <button
                key={prompt}
                onClick={() => handleExampleClick(prompt)}
                disabled={loading}
                className="press-scale text-left rounded-xl px-3 py-3 text-sm transition-all duration-150 flex items-start gap-3"
                style={{
                  background: "var(--color-surface-container)",
                  color: "var(--color-on-surface)",
                  border: "1px solid var(--color-outline-variant)",
                }}
              >
                <span
                  className="flex-shrink-0 flex items-center justify-center rounded-lg text-sm"
                  style={{
                    width: 28,
                    height: 28,
                    background: "var(--color-primary-container)",
                    color: "var(--color-on-primary-container)",
                    fontSize: 14,
                  }}
                >
                  {EXAMPLE_ICONS[i]}
                </span>
                <span style={{ lineHeight: 1.4 }}>{prompt}</span>
              </button>
            ))}
          </div>

          <div className="w-full max-w-md">{inputBar}</div>
        </div>
      ) : (
        <>
          {/* ── Messages ── */}
          <div
            className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
            style={{ minHeight: 0 }}
            aria-live="polite"
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start items-start")}
              >
                {msg.role === "assistant" && <AIAvatar />}

                <div className={cn("flex flex-col gap-1", msg.role === "user" ? "items-end" : "items-start", "max-w-[85%]")}>
                  {msg.role === "user" ? (
                    /* User bubble */
                    <div
                      className="rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap"
                      style={{
                        background: "var(--color-primary-container)",
                        color: "var(--color-on-primary-container)",
                        border: "1px solid oklch(68% 0.09 75 / 0.25)",
                      }}
                    >
                      {msg.content}
                    </div>
                  ) : (
                    /* AI bubble */
                    <div
                      className="glass-panel ai-glow rounded-2xl rounded-bl-sm overflow-hidden"
                      style={{ position: "relative" }}
                    >
                      {/* Thin gradient top line */}
                      <div
                        style={{
                          height: 2,
                          background: "linear-gradient(90deg, var(--color-primary), var(--color-secondary), transparent)",
                          opacity: 0.6,
                        }}
                      />
                      <div className="px-4 py-3">
                        <div
                          className="ai-prose whitespace-pre-wrap"
                          style={{ color: "var(--color-on-surface)" }}
                        >
                          {msg.content}
                        </div>

                        {/* Tool call chips */}
                        {msg.tool_calls && msg.tool_calls.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {msg.tool_calls.map((tc, j) => (
                              <span
                                key={j}
                                className="caps-label rounded-full px-2 py-1"
                                style={{
                                  background: "var(--color-surface-container-high)",
                                  color: "var(--color-on-surface-variant)",
                                  border: "1px solid var(--color-outline-variant)",
                                }}
                              >
                                {TOOL_LABELS[tc.tool] ?? tc.tool}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-1 mt-2">
                          <button
                            onClick={() => handleCopy(msg.content, i)}
                            className="press-scale flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors"
                            style={{
                              background: "transparent",
                              color: copiedIdx === i ? "var(--color-tertiary)" : "var(--color-on-surface-variant)",
                              border: "1px solid var(--color-outline-variant)",
                            }}
                            aria-label="Copy response"
                          >
                            {copiedIdx === i ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                            )}
                            {copiedIdx === i ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* ── Synthesizing state ── */}
            {loading && (
              <div className="flex gap-2 justify-start items-start">
                <AIAvatar pulse />
                <div
                  className="glass-panel ai-glow rounded-2xl rounded-bl-sm overflow-hidden max-w-[85%]"
                  style={{ position: "relative" }}
                >
                  {/* Animated gradient radial background */}
                  <div
                    className="absolute inset-0 animate-pulse"
                    style={{
                      background: "radial-gradient(ellipse at 20% 50%, oklch(58% 0.022 75 / 0.06) 0%, transparent 70%)",
                      pointerEvents: "none",
                    }}
                  />
                  {/* Thin gradient top line */}
                  <div
                    style={{
                      height: 2,
                      background: "linear-gradient(90deg, var(--color-primary), var(--color-secondary), transparent)",
                      opacity: 0.4,
                    }}
                  />
                  <div className="relative px-4 py-3 space-y-3">
                    {/* Typing dots */}
                    <div className="flex items-center gap-1" style={{ color: "var(--color-secondary)" }}>
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                    {/* Shimmer skeleton lines */}
                    <div className="space-y-2">
                      <div className="skeleton-shimmer rounded" style={{ height: 10, width: "80%" }} />
                      <div className="skeleton-shimmer rounded" style={{ height: 10, width: "60%" }} />
                      <div className="skeleton-shimmer rounded" style={{ height: 10, width: "70%" }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Confirmation card ── */}
            {pendingAction && !loading && (
              <div
                className="glass-panel rounded-2xl p-4 space-y-3"
                style={{
                  border: "1px solid var(--color-error)",
                  background: "color-mix(in oklch, var(--color-error) 8%, var(--color-surface-container))",
                }}
              >
                <p className="text-sm font-medium" style={{ color: "var(--color-on-surface)" }}>
                  {pendingAction.label}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={confirm}
                    className="press-scale flex-1 rounded-xl py-2 text-sm font-semibold transition-colors"
                    style={{ background: "var(--color-error)", color: "var(--color-on-error)" }}
                  >
                    Confirm
                  </button>
                  <button
                    onClick={cancel}
                    className="press-scale flex-1 rounded-xl py-2 text-sm font-semibold transition-colors"
                    style={{
                      background: "var(--color-surface-container-high)",
                      color: "var(--color-on-surface)",
                      border: "1px solid var(--color-outline-variant)",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>

          {/* ── Input bar (bottom) ── */}
          <div className="border-t" style={{ borderColor: "var(--color-outline-variant)" }}>
            {inputBar}
          </div>
        </>
      )}
    </div>
  );
}
