import type { RefObject } from "react";

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

interface ChatComposerProps {
  input: string;
  listening: boolean;
  voiceLoading: boolean;
  voiceError: string | null;
  noMemory: boolean;
  loading: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: () => void;
  onStartVoice: () => void;
}

export default function ChatComposer({
  input,
  listening,
  voiceLoading,
  voiceError,
  noMemory,
  loading,
  textareaRef,
  onInputChange,
  onKeyDown,
  onSend,
  onStartVoice,
}: ChatComposerProps) {
  return (
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
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
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
          onClick={onStartVoice}
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
          onClick={onSend}
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
}
