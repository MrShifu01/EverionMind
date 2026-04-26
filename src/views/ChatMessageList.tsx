import type { RefObject } from "react";
import type { ChatMessage } from "../hooks/useChat";
import { cn } from "../lib/cn";
import { TOOL_LABELS, firstPhone, firstEmail, renderMarkdown } from "./chatUtils";
import AdminDebugPanel from "./ChatDebugPanel";
import { useAdminPrefs } from "../lib/adminPrefs";

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

const IconShare = (
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
    <path d="M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
    <path d="M12 3v11M8 7l4-4 4 4" />
  </svg>
);

const IconPhone = (
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
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.77h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.4a16 16 0 0 0 5.67 5.67l.95-.95a2 2 0 0 1 2.11-.45c.908.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const IconEmail = (
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
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m2 7 10 7 10-7" />
  </svg>
);

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 26,
    minHeight: 26,
    padding: "0 10px",
    borderRadius: 4,
    background: "transparent",
    border: "1px solid var(--line-soft)",
    color,
    fontFamily: "var(--f-sans)",
    fontSize: 11,
    fontWeight: 500,
    cursor: "pointer",
    transition: "color 180ms, border-color 180ms",
    textDecoration: "none",
  };
}

interface ChatMessageListProps {
  messages: ChatMessage[];
  loading: boolean;
  pendingAction: { label: string } | null;
  isAdmin: boolean;
  copiedIdx: number | null;
  sharedIdx: number | null;
  endRef: RefObject<HTMLDivElement | null>;
  onCopy: (text: string, idx: number) => void;
  onShare: (text: string, idx: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onOpenVault?: () => void;
}

function extractLockedSecrets(
  toolCalls: ChatMessage["tool_calls"],
): Array<{ id: string; title: string }> {
  if (!toolCalls?.length) return [];
  const seen = new Map<string, string>();
  for (const tc of toolCalls) {
    if (tc.tool !== "retrieve_memory") continue;
    const result = tc.result as { lockedSecrets?: Array<{ id?: string; title?: string }> } | null;
    for (const s of result?.lockedSecrets ?? []) {
      if (s?.id && s?.title && !seen.has(s.id)) seen.set(s.id, s.title);
    }
  }
  return Array.from(seen.entries()).map(([id, title]) => ({ id, title }));
}

const IconLock = (
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
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

export default function ChatMessageList({
  messages,
  loading,
  pendingAction,
  isAdmin,
  copiedIdx,
  sharedIdx,
  endRef,
  onCopy,
  onShare,
  onConfirm,
  onCancel,
  onOpenVault,
}: ChatMessageListProps) {
  const adminPrefs = useAdminPrefs();
  return (
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
      <div
        style={{
          maxWidth: 820,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
        {messages.map((msg, i) => {
          const phone = msg.role === "assistant" ? firstPhone(msg.content) : null;
          const email = msg.role === "assistant" ? firstEmail(msg.content) : null;
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
                    <div
                      style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}
                    >
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
                    }}
                  >
                    {renderMarkdown(msg.content)}
                  </div>

                  {(() => {
                    const locked = extractLockedSecrets(msg.tool_calls);
                    if (locked.length === 0 || !onOpenVault) return null;
                    return (
                      <div
                        style={{
                          marginTop: 14,
                          padding: "12px 14px",
                          border: "1px solid var(--line-soft)",
                          borderRadius: 10,
                          background: "var(--surface-low)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        <div
                          className="f-sans"
                          style={{
                            fontSize: 12,
                            color: "var(--ink-faint)",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          {IconLock}
                          {locked.length === 1
                            ? "Vault entry — content encrypted"
                            : `${locked.length} Vault entries — content encrypted`}
                        </div>
                        <ul
                          className="f-serif"
                          style={{
                            margin: 0,
                            padding: 0,
                            listStyle: "none",
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                            fontSize: 15,
                            color: "var(--ink-soft)",
                          }}
                        >
                          {locked.map((s) => (
                            <li key={s.id}>{s.title}</li>
                          ))}
                        </ul>
                        <button
                          onClick={onOpenVault}
                          className="press"
                          style={{
                            ...actionBtnStyle("var(--ink)"),
                            alignSelf: "flex-start",
                            borderColor: "var(--line)",
                          }}
                        >
                          {IconLock} Open Vault
                        </button>
                      </div>
                    );
                  })()}

                  <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
                    <button
                      onClick={() => onCopy(msg.content, i)}
                      className="press"
                      aria-label="Copy response"
                      style={actionBtnStyle(
                        copiedIdx === i ? "var(--moss)" : "var(--ink-faint)",
                      )}
                    >
                      {copiedIdx === i ? IconCheck : IconCopy}
                      {copiedIdx === i ? "copied" : "copy"}
                    </button>
                    <button
                      onClick={() => onShare(msg.content, i)}
                      className="press"
                      aria-label="Share response"
                      style={actionBtnStyle(
                        sharedIdx === i ? "var(--moss)" : "var(--ink-faint)",
                      )}
                    >
                      {sharedIdx === i ? IconCheck : IconShare}
                      {sharedIdx === i ? "shared" : "share"}
                    </button>
                    {phone && (
                      <a
                        href={`tel:+${phone}`}
                        className="press"
                        aria-label="Call"
                        style={actionBtnStyle("var(--ink-faint)")}
                      >
                        {IconPhone} call
                      </a>
                    )}
                    {phone && (
                      <a
                        href={`https://wa.me/${phone}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="press"
                        aria-label="WhatsApp"
                        style={actionBtnStyle("var(--ink-faint)")}
                      >
                        wa
                      </a>
                    )}
                    {email && (
                      <a
                        href={`mailto:${email}`}
                        className="press"
                        aria-label="Email"
                        style={actionBtnStyle("var(--ink-faint)")}
                      >
                        {IconEmail} email
                      </a>
                    )}
                  </div>
                  {isAdmin && adminPrefs.showChatDebug && msg.debug && (
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
                onClick={onConfirm}
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
                onClick={onCancel}
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
  );
}
