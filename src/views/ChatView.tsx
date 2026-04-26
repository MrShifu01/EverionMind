import { useRef, useEffect, useState, useCallback } from "react";
import { useChat } from "../hooks/useChat";
import { useAdminDevMode } from "../hooks/useAdminDevMode";
import { useEntries } from "../context/EntriesContext";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import {
  useHasAIAccess,
  readSuggestionsCache,
  writeSuggestionsCache,
  derivePrompts,
} from "./chatUtils";
import ChatComposer from "./ChatComposer";
import ChatMessageList from "./ChatMessageList";

interface ChatViewProps {
  brainId: string | undefined;
  onNavigate?: (view: string) => void;
}

export default function ChatView({ brainId, onNavigate }: ChatViewProps) {
  const aiAvailable = useHasAIAccess();
  const { isAdmin } = useAdminDevMode();
  const { messages, loading, pendingAction, send, confirm, cancel, clearHistory } =
    useChat(brainId);
  const { entries, entriesLoaded } = useEntries();
  const [noMemoryToast, setNoMemoryToast] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(
    () => readSuggestionsCache(brainId) ?? [],
  );

  useEffect(() => {
    if (!entriesLoaded || entries.length === 0) return;
    if (readSuggestionsCache(brainId) !== null) return; // still fresh
    const fresh = derivePrompts(entries);
    writeSuggestionsCache(brainId, fresh);
    setSuggestions(fresh);
  }, [entriesLoaded, brainId]);

  const [input, setInput] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [sharedIdx, setSharedIdx] = useState<number | null>(null);
  const [_voiceStatus, setVoiceStatus] = useState<string | null>(null);
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
      try {
        await navigator.share({ text });
      } catch {
        return;
      }
    } else {
      await navigator.clipboard.writeText(text);
    }
    setSharedIdx(idx);
    setTimeout(() => setSharedIdx(null), 1500);
  }, []);

  const noMemory = entriesLoaded && entries.length === 0;

  if (!aiAvailable) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 24px",
          background: "var(--bg)",
          textAlign: "center",
          gap: 16,
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
            maxWidth: 400,
          }}
        >
          Chat needs an AI provider.
        </p>
        <p
          className="f-sans"
          style={{
            fontSize: 14,
            color: "var(--ink-ghost)",
            margin: 0,
            maxWidth: 360,
            lineHeight: 1.6,
          }}
        >
          Add your own API key in Settings → AI → BYOK, or upgrade to a Pro plan for managed access.
        </p>
      </div>
    );
  }

  const composer = (
    <ChatComposer
      input={input}
      listening={listening}
      voiceLoading={voiceLoading}
      voiceError={voiceError}
      noMemory={noMemory}
      loading={loading}
      textareaRef={textareaRef}
      onInputChange={setInput}
      onKeyDown={handleKeyDown}
      onSend={handleSend}
      onStartVoice={startVoice}
    />
  );

  return (
    <div
      className="chat-root"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: "var(--bg)",
      }}
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
              width="14"
              height="14"
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
            <span className="f-sans flex-1" style={{ fontSize: 13, color: "var(--ink-faint)" }}>
              Search everything
            </span>
            <span style={{ display: "inline-flex", gap: 2, flexShrink: 0 }}>
              <kbd
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
                Ctrl
              </kbd>
              <kbd
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
        <div className="flex flex-1 flex-col" style={{ minHeight: 0, alignItems: "center" }}>
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
          {composer}
        </div>
      ) : (
        <>
          <ChatMessageList
            messages={messages}
            loading={loading}
            pendingAction={pendingAction}
            isAdmin={isAdmin}
            copiedIdx={copiedIdx}
            sharedIdx={sharedIdx}
            endRef={endRef}
            onCopy={handleCopy}
            onShare={handleShare}
            onConfirm={confirm}
            onCancel={cancel}
            onOpenVault={onNavigate ? () => onNavigate("vault") : undefined}
          />
          {composer}
        </>
      )}
    </div>
  );
}
