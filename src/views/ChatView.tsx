import { useRef, useEffect, useMemo } from "react";

const EXAMPLE_PROMPTS = [
  "Summarize what I've captured this week",
  "What themes keep appearing in my notes?",
  "Find connections between my recent ideas",
];

interface ChatViewProps {
  chatMsgs: { role: string; content: string }[];
  chatLoading: boolean;
  chatInput: string;
  setChatInput: (v: string) => void;
  searchAllBrains: boolean;
  setSearchAllBrains: (v: boolean) => void;
  handleChat: () => void;
  vaultUnlockModal: { vaultData: any; pendingMsg: string } | null;
  setVaultUnlockModal: (v: any) => void;
  vaultModalInput: string;
  setVaultModalInput: (v: string) => void;
  vaultModalMode: "passphrase" | "recovery";
  setVaultModalMode: (v: "passphrase" | "recovery") => void;
  vaultModalError: string;
  vaultModalBusy: boolean;
  handleVaultModalUnlock: () => void;
  chatEndRef: React.RefObject<HTMLDivElement>;
  brains: any[];
  phoneRegex: RegExp;
}

export default function ChatView({
  chatMsgs,
  chatLoading,
  chatInput,
  setChatInput,
  searchAllBrains,
  setSearchAllBrains,
  handleChat,
  vaultUnlockModal,
  setVaultUnlockModal,
  vaultModalInput,
  setVaultModalInput,
  vaultModalMode,
  setVaultModalMode,
  vaultModalError,
  vaultModalBusy,
  handleVaultModalUnlock,
  chatEndRef,
  brains,
  phoneRegex,
}: ChatViewProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [chatInput]);

  const submit = () => {
    if (!chatInput.trim() || chatLoading) return;
    handleChat();
  };

  const renderedMessages = useMemo(
    () =>
      chatMsgs.map((m, i) => ({
        ...m,
        parsedContent:
          m.role === "assistant"
            ? m.content.split(phoneRegex).map((part, pi) => ({
                key: pi,
                isPhone: phoneRegex.test(part),
                value: part,
              }))
            : null,
        key: i,
      })),
    [chatMsgs, phoneRegex],
  );

  return (
    <div className="flex flex-col h-[calc(100dvh-180px)] lg:h-[calc(100dvh-80px)]">
      {/* ── Message thread ── */}
      <div
        role="log"
        className={`overflow-y-auto pb-6 scrollbar-hide ${chatMsgs.length > 0 ? "flex-1" : "flex-1 lg:flex-none"}`}
        aria-live="polite"
        aria-atomic="false"
      >
        <div className="lg:max-w-2xl lg:mx-auto space-y-6 pt-2">
          {chatMsgs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-2 gap-8">
              {/* Heading */}
              <div className="text-center">
                <p
                  className="text-[1.75rem] tracking-tight leading-tight mb-2"
                  style={{
                    fontFamily: "var(--font-family-headline)",
                    color: "var(--color-on-surface)",
                  }}
                >
                  Ask your brain anything.
                </p>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  Search your notes, surface patterns, find forgotten ideas.
                </p>
              </div>

              {/* Example prompts — editorial text suggestions, no card grid */}
              <div className="flex flex-col gap-0.5 w-full max-w-sm">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => setChatInput(prompt)}
                    className="text-left px-3 py-2.5 rounded-lg text-sm press-scale transition-colors flex items-baseline gap-2.5"
                    style={{ color: "var(--color-on-surface-variant)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "var(--color-on-surface)";
                      e.currentTarget.style.background = "oklch(from var(--color-primary) l c h / 0.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--color-on-surface-variant)";
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span
                      className="text-xs flex-shrink-0 translate-y-px"
                      style={{ color: "var(--color-primary)" }}
                    >
                      →
                    </span>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {renderedMessages.map((m) => (
            <div
              key={m.key}
              className={
                m.role === "user"
                  ? "flex justify-end animate-slide-up"
                  : "flex items-start gap-3 animate-slide-up"
              }
            >
              {m.role === "assistant" && (
                <div
                  className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold mt-0.5 select-none"
                  style={{
                    background: "var(--color-primary-container)",
                    color: "var(--color-primary)",
                    fontFamily: "var(--font-family-headline)",
                  }}
                >
                  E
                </div>
              )}

              <div
                className="max-w-[78%] lg:max-w-[68%] text-sm leading-relaxed"
                style={
                  m.role === "user"
                    ? {
                        background: "var(--color-primary-container)",
                        color: "var(--color-on-primary-container)",
                        borderRadius: "1rem 1rem 0.25rem 1rem",
                        padding: "0.625rem 1rem",
                      }
                    : {
                        background: "var(--color-surface-container-low)",
                        color: "var(--color-on-surface)",
                        borderRadius: "0.25rem 1rem 1rem 1rem",
                        padding: "0.75rem 1rem",
                      }
                }
              >
                {m.parsedContent
                  ? m.parsedContent.map((part) =>
                      part.isPhone ? (
                        <a
                          key={part.key}
                          href={`tel:${part.value}`}
                          className="underline"
                          style={{ color: "var(--color-primary)" }}
                        >
                          {part.value}
                        </a>
                      ) : (
                        part.value
                      )
                    )
                  : m.content}
              </div>
            </div>
          ))}

          {chatLoading && (
            <div className="flex items-center gap-3">
              <div
                className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold select-none"
                style={{
                  background: "var(--color-primary-container)",
                  color: "var(--color-primary)",
                  fontFamily: "var(--font-family-headline)",
                }}
              >
                E
              </div>
              <div
                className="flex items-center gap-1.5 px-4 py-3 rounded-xl"
                style={{
                  background: "var(--color-surface-container-low)",
                  border: "1px solid var(--color-outline-variant)",
                }}
              >
                <span className="typing-dot" style={{ color: "var(--color-on-surface-variant)" }} />
                <span className="typing-dot" style={{ color: "var(--color-on-surface-variant)" }} />
                <span className="typing-dot" style={{ color: "var(--color-on-surface-variant)" }} />
              </div>
            </div>
          )}

          {vaultUnlockModal && (
            <div
              className="rounded-xl p-4"
              style={{
                background: "var(--color-surface-container)",
                border: "1px solid var(--color-outline)",
              }}
            >
              {/* System label — distinguishes from AI messages */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <svg
                    className="w-3.5 h-3.5 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  <span
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    System · Vault locked
                  </span>
                </div>
                <button
                  onClick={() => setVaultUnlockModal(null)}
                  aria-label="Dismiss vault unlock"
                  className="press-scale w-11 h-11 flex items-center justify-center rounded-lg transition-colors"
                  style={{ color: "var(--color-on-surface-variant)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-surface-container-high)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex gap-2 mb-3">
                {(["passphrase", "recovery"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => { setVaultModalMode(mode); setVaultModalInput(""); }}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors press-scale"
                    style={
                      vaultModalMode === mode
                        ? {
                            background: "var(--color-primary-container)",
                            color: "var(--color-on-primary-container)",
                            border: "1px solid transparent",
                          }
                        : {
                            background: "transparent",
                            color: "var(--color-on-surface-variant)",
                            border: "1px solid var(--color-outline-variant)",
                          }
                    }
                  >
                    {mode === "passphrase" ? "Passphrase" : "Recovery key"}
                  </button>
                ))}
              </div>

              <input
                type={vaultModalMode === "passphrase" ? "password" : "text"}
                value={vaultModalInput}
                onChange={(e) => setVaultModalInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleVaultModalUnlock()}
                placeholder={
                  vaultModalMode === "passphrase"
                    ? "Enter passphrase…"
                    : "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
                }
                autoFocus
                className="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none mb-3 min-h-[44px] transition-colors"
                style={{
                  background: "var(--color-surface-container)",
                  border: "1px solid var(--color-outline-variant)",
                  color: "var(--color-on-surface)",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-outline-variant)"; }}
              />

              {vaultModalError && (
                <p className="text-xs mb-3" style={{ color: "var(--color-error)" }}>
                  {vaultModalError}
                </p>
              )}

              <button
                onClick={handleVaultModalUnlock}
                disabled={vaultModalBusy || !vaultModalInput.trim()}
                className="w-full py-2.5 rounded-lg text-sm font-semibold press-scale disabled:opacity-40 transition-opacity"
                style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
              >
                {vaultModalBusy ? "Unlocking…" : "Unlock & continue"}
              </button>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      {/* ── Composer ── */}
      <div
        className="pt-4"
        style={{ borderTop: "1px solid var(--color-outline-variant)" }}
      >
        <div className="lg:max-w-2xl lg:mx-auto">
          {/* Brain scope tabs */}
          {brains.length > 1 && (
            <div className="flex gap-5 mb-3 px-1">
              {[
                { key: false, label: "This brain" },
                { key: true, label: "All brains" },
              ].map(({ key, label }) => (
                <button
                  key={String(key)}
                  onClick={() => setSearchAllBrains(key)}
                  className="text-xs font-medium transition-all press-scale pb-1"
                  style={{
                    color:
                      searchAllBrains === key
                        ? "var(--color-primary)"
                        : "var(--color-on-surface-variant)",
                    borderBottom:
                      searchAllBrains === key
                        ? "1.5px solid var(--color-primary)"
                        : "1.5px solid transparent",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Input row */}
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={
                searchAllBrains
                  ? "Ask across all brains…"
                  : "Ask about your memories…"
              }
              rows={1}
              className="flex-1 px-4 py-3 rounded-xl text-sm resize-none overflow-hidden focus:outline-none transition-colors placeholder:text-on-surface-variant/40"
              style={{
                background: "var(--color-surface-container-low)",
                border: "1px solid var(--color-outline-variant)",
                color: "var(--color-on-surface)",
                minHeight: "44px",
                maxHeight: "140px",
                lineHeight: "1.5",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-outline-variant)"; }}
            />
            <button
              onClick={submit}
              disabled={chatLoading || !chatInput.trim()}
              aria-label="Send message (Enter)"
              className="flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-xl press-scale disabled:opacity-40 transition-opacity"
              style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </div>

          {/* Keyboard hint — desktop only */}
          <p
            className="hidden lg:block text-[11px] mt-2 px-1"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
