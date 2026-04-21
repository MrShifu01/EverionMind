import { useRef, useEffect, useState, useCallback } from "react";
import { useChat } from "../hooks/useChat";
import { cn } from "../lib/cn";

const EXAMPLE_PROMPTS = [
  "what's coming up in the next thirty days?",
  "do i have Avela's bank details?",
  "what's missing from my staff entries?",
  "find any duplicates i should merge",
];

const TOOL_LABELS: Record<string, string> = {
  retrieve_memory: "searched memory",
  search_entries: "searched entries",
  get_entry: "fetched entry",
  get_upcoming: "checked upcoming dates",
  create_entry: "created entry",
  update_entry: "updated entry",
  delete_entry: "deleted entry",
};

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

const IconMic = (
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

const IconCheck = (
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
    <path d="M5 12l4 4 10-10" />
  </svg>
);

export default function ChatView({ brainId }: ChatViewProps) {
  const { messages, loading, pendingAction, send, confirm, cancel, clearHistory } = useChat(brainId);
  const [input, setInput] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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

  const Composer = (
    <div
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
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="ask your memory…"
          rows={1}
          className="f-serif flex-1 resize-none bg-transparent outline-none"
          style={{
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
        <button
          type="button"
          className="design-btn-ghost press"
          aria-label="Voice note"
          style={{ width: 36, height: 36, minHeight: 36, padding: 0, color: "var(--ink-faint)" }}
        >
          {IconMic}
        </button>
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          aria-label="Send message"
          className="press"
          style={{
            width: 36,
            height: 36,
            minHeight: 36,
            borderRadius: 8,
            background: input.trim() ? "var(--ember)" : "var(--surface-high)",
            color: input.trim() ? "var(--ember-ink)" : "var(--ink-faint)",
            border: 0,
            cursor: input.trim() && !loading ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 180ms",
          }}
        >
          {IconSend}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0, background: "var(--bg)" }}>
      {/* ── Top bar ── */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 32px",
          borderBottom: "1px solid var(--line-soft)",
          minHeight: 68,
          gap: 20,
        }}
      >
        <div>
          <h1
            className="f-serif"
            style={{
              fontSize: 22,
              fontWeight: 450,
              letterSpacing: "-0.01em",
              margin: 0,
              color: "var(--ink)",
            }}
          >
            Chat
          </h1>
          <div
            className="f-serif"
            style={{ fontSize: 13, color: "var(--ink-faint)", fontStyle: "italic", marginTop: 2 }}
          >
            a conversation with your memory.
          </div>
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

            <div
              style={{
                marginTop: 40,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 8,
                width: "100%",
              }}
            >
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleExampleClick(prompt)}
                  disabled={loading}
                  className="press"
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: 10,
                    background: "var(--surface)",
                    border: "1px solid var(--line-soft)",
                    color: "var(--ink-soft)",
                    fontFamily: "var(--f-serif)",
                    fontSize: 14,
                    lineHeight: 1.45,
                    fontStyle: "italic",
                    cursor: "pointer",
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
              {messages.map((msg, i) => (
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
                        {msg.content}
                      </div>

                      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
                        <button
                          onClick={() => handleCopy(msg.content, i)}
                          className="press"
                          aria-label="Copy response"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            height: 26,
                            minHeight: 26,
                            padding: "0 10px",
                            borderRadius: 4,
                            background: "transparent",
                            border: "1px solid var(--line-soft)",
                            color: copiedIdx === i ? "var(--moss)" : "var(--ink-faint)",
                            fontFamily: "var(--f-sans)",
                            fontSize: 11,
                            fontWeight: 500,
                            cursor: "pointer",
                            transition: "color 180ms, border-color 180ms",
                          }}
                        >
                          {copiedIdx === i ? IconCheck : IconCopy}
                          {copiedIdx === i ? "copied" : "copy"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

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
