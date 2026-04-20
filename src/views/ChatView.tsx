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

export default function ChatView({ brainId }: ChatViewProps) {
  const { messages, loading, pendingAction, send, confirm, cancel, clearHistory } = useChat(brainId);
  const [input, setInput] = useState("");
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

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleExampleClick = useCallback((prompt: string) => {
    send(prompt);
  }, [send]);

  const inputBar = (
    <div
      className="px-4 py-3"
      style={{ background: "var(--color-surface)" }}
    >
      <div
        className="flex items-end gap-2 rounded-2xl px-4 py-2"
        style={{ background: "var(--color-surface-container)", border: "1px solid var(--color-outline-variant)" }}
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
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          aria-label="Send message"
          className="press-scale flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-all duration-150 disabled:opacity-40"
          style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
        >
          <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
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
          <h2 className="text-base font-semibold" style={{ color: "var(--color-on-surface)" }}>
            Chat
          </h2>
          <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
            Ask, add, update, or delete anything
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            className="text-xs px-2 py-1 rounded-lg transition-colors"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            Clear
          </button>
        )}
      </div>

      {messages.length === 0 ? (
        /* ── Empty state: centered input ── */
        <div className="flex flex-1 flex-col items-center justify-center px-4 gap-6">
          <p className="text-center text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
            Chat directly with your memory database
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 w-full max-w-md">
            {EXAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => handleExampleClick(prompt)}
                disabled={loading}
                className="press-scale text-left rounded-xl px-4 py-3 text-sm transition-colors"
                style={{
                  background: "var(--color-surface-container)",
                  color: "var(--color-on-surface)",
                  border: "1px solid var(--color-outline-variant)",
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
          <div className="w-full max-w-md">{inputBar}</div>
        </div>
      ) : (
        <>
          {/* ── Messages ── */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ minHeight: 0 }} aria-live="polite">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                    msg.role === "user" ? "rounded-br-sm" : "rounded-bl-sm",
                  )}
                  style={
                    msg.role === "user"
                      ? { background: "var(--color-primary)", color: "var(--color-on-primary)" }
                      : { background: "var(--color-surface-container)", color: "var(--color-on-surface)" }
                  }
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div
                  className="rounded-2xl rounded-bl-sm px-4 py-3 text-sm"
                  style={{ background: "var(--color-surface-container)", color: "var(--color-on-surface-variant)" }}
                >
                  <span className="animate-pulse">Thinking…</span>
                </div>
              </div>
            )}

            {/* ── Confirmation card ── */}
            {pendingAction && !loading && (
              <div
                className="rounded-2xl p-4 space-y-3"
                style={{
                  background: "var(--color-error-container, #fde8e8)",
                  border: "1px solid var(--color-error, #d32f2f)",
                }}
              >
                <p className="text-sm font-medium" style={{ color: "var(--color-on-error-container, #7f1d1d)" }}>
                  {pendingAction.label}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={confirm}
                    className="press-scale flex-1 rounded-xl py-2 text-sm font-semibold transition-colors"
                    style={{ background: "var(--color-error, #d32f2f)", color: "#fff" }}
                  >
                    Confirm
                  </button>
                  <button
                    onClick={cancel}
                    className="press-scale flex-1 rounded-xl py-2 text-sm font-semibold transition-colors"
                    style={{ background: "var(--color-surface-container)", color: "var(--color-on-surface)" }}
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
