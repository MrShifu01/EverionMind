import React, { useState, useEffect, useRef } from "react";
import { TC } from "../data/constants";
import { resolveIcon } from "../lib/typeIcons";
import { useEntryEdit } from "../hooks/useEntryEdit";
import { EntryQuickActions } from "../components/EntryQuickActions";
import { authFetch } from "../lib/authFetch";
import { CANONICAL_TYPES } from "../types";
import type { Entry, Brain, EntryType } from "../types";
import { SKIP_META_KEYS } from "../lib/entryConstants";


interface DetailLink {
  from: string;
  to: string;
  rel?: string;
  similarity?: number;
}

interface DetailModalProps {
  entry: Entry;
  onClose: () => void;
  onDelete?: (id: string) => void | Promise<void>;
  onUpdate?: (id: string, changes: any) => Promise<void>;
  onReorder?: (entry: any) => void;
  entries?: Entry[];
  links?: DetailLink[];
  canWrite?: boolean;
  brains?: Brain[];
  vaultUnlocked?: boolean;
  typeIcons?: Record<string, string>;
  onTypeIconChange?: (type: string, icon: string) => void;
}

export default function DetailModal({
  entry,
  onClose,
  onDelete,
  onUpdate,
  onReorder,
  entries = [],
  links = [],
  canWrite = true,
  brains = [],
  vaultUnlocked = false,
  typeIcons = {},
  onTypeIconChange,
}: DetailModalProps) {
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<Element | null>(null);

  // Store the element that opened the modal so focus can return on close
  useEffect(() => {
    triggerRef.current = document.activeElement;
    return () => {
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    };
  }, []);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(entry.title);
  const [editContent, setEditContent] = useState(entry.content ?? "");
  const [editType, setEditType] = useState<string>(entry.type);
  const [editTags, setEditTags] = useState((entry.tags || []).join(", "));
  const [secretRevealed, setSecretRevealed] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [aiMsg, setAiMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const typeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!typeOpen) return;
    function handleClick(e: MouseEvent) {
      if (typeRef.current && !typeRef.current.contains(e.target as Node)) setTypeOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [typeOpen]);

  async function suggestType() {
    setAiTyping(true);
    setAiMsg(null);
    try {
      const canonicalTypes = CANONICAL_TYPES.filter((t) => t !== "secret");
      const orderedTypes = [...canonicalTypes.filter((t) => t !== "person"), "person"];
      const entryContext = `Title: ${editTitle}\nContent: ${(editContent || "").slice(0, 400)}`;
      const res = await authFetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: `Reply with ONE word only — the single most accurate category for this entry.
Preferred types: ${orderedTypes.join(", ")}.
If none of these fit well, invent the single most descriptive lowercase word (e.g. "recipe", "invoice", "supplier", "contract", "procedure").
No explanation, no punctuation, just one word.`,
          messages: [{ role: "user", content: entryContext }],
          max_tokens: 20,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const usedModel: string = data.model || "unknown model";
        const full = (data.content?.[0]?.text || data.choices?.[0]?.message?.content || "")
          .trim()
          .toLowerCase();
        const word = full.replace(/[^a-z]/g, "").slice(0, 40);
        if (!word) {
          setAiMsg({ text: `Empty response · model: ${usedModel}`, ok: false });
        } else {
          setEditType(word);
          setAiMsg({ text: `✓ ${word} · ${usedModel}`, ok: true });
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setAiMsg({ text: (errData as any)?.error || `HTTP ${res.status}`, ok: false });
      }
    } catch (err: any) {
      setAiMsg({ text: err?.message || "Request failed", ok: false });
    }
    setAiTyping(false);
  }


  const {
    saving,
    editExtraBrainIds,
    extraBrainsLoaded,
    shareMsg,
    setShareMsg,
    editBrainId,
    handleSave,
    handleShare,
    toggleExtraBrain,
  } = useEntryEdit({ entry, editing, onUpdate, onTypeIconChange, brains });
  const isSecret = entry.type === "secret";
  const cfg = { ...(TC[editType as EntryType] || TC.note), i: resolveIcon(editType, typeIcons) };
const [showFullContent, setShowFullContent] = useState(false);
  const [showFullText, setShowFullText] = useState(false);
  const CONTENT_PREVIEW_LIMIT = 300;
  const meta = Object.entries(entry.metadata || {}).filter(([k]) => !SKIP_META_KEYS.has(k));
  const confidence = (entry.metadata?.confidence || {}) as Record<string, string>;

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  // Lock body scroll while modal is open — position:fixed is required on iOS where overflow:hidden is ignored
  useEffect(() => {
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollY);
    };
  }, []);

  // UX-5: Escape key closes modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editing) setEditing(false);
        else onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [editing, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center lg:items-center"
      style={{
        background: "var(--color-scrim)",
        paddingBottom: "calc(96px + env(safe-area-inset-bottom))",
      }}
      onClick={editing ? undefined : onClose}
    >
      <div
        className="relative flex w-full flex-col"
        style={{
          maxWidth: 720,
          background: "var(--surface-high)",
          border: "1px solid var(--line-soft)",
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderBottomLeftRadius: 18,
          borderBottomRightRadius: 18,
          boxShadow: "var(--lift-3)",
          animation: "design-scaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
          maxHeight: "calc(100dvh - 96px - env(safe-area-inset-bottom) - env(safe-area-inset-top))",
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "16px 24px",
            borderBottom: "1px solid var(--line-soft)",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-faint)" }}>
            <span style={{ fontSize: 14 }}>{cfg.i}</span>
            <span
              className="f-sans"
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {editType}
            </span>
          </div>
          {confidence.type && (() => {
            const cl = confidence.type;
            const color = cl === "extracted" ? "var(--moss)" : cl === "inferred" ? "var(--ember)" : "var(--blood)";
            const label = cl === "extracted" ? "extracted" : cl === "inferred" ? "inferred" : "ambiguous";
            return (
              <span
                className="f-sans"
                style={{
                  fontSize: 11,
                  color,
                  fontStyle: "italic",
                }}
              >
                {label}
              </span>
            );
          })()}
          <div style={{ flex: 1 }} />
          {!canWrite && (
            <span
              className="f-serif"
              style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-faint)" }}
            >
              view only
            </span>
          )}
          <button
            aria-label="Close"
            className="design-btn-ghost press"
            onClick={editing ? () => setEditing(false) : onClose}
            style={{ width: 32, height: 32, minHeight: 32, padding: 0 }}
          >
            <svg
              width="14" height="14"
              fill="none" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18"/>
            </svg>
          </button>
        </div>

        {/* Title band (non-editing) */}
        {!editing && (
          <div
            style={{
              padding: "24px 32px 8px",
              flexShrink: 0,
            }}
          >
            <h2
              id="detail-modal-title"
              className="f-serif"
              style={{
                fontSize: 32,
                lineHeight: 1.2,
                fontWeight: 450,
                letterSpacing: "-0.015em",
                color: "var(--ink)",
                margin: 0,
              }}
            >
              {editTitle}
            </h2>
          </div>
        )}

        {/* Scrollable body */}
        <div
          data-testid="detail-scroll-body"
          className="flex-1 overflow-y-auto"
          style={
            {
              padding: "0 32px 32px",
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch",
            } as React.CSSProperties
          }
        >
          {/* Edit form */}
          {editing ? (
            <div className="mt-2 space-y-4">
              <div>
                <label
                  className="mb-1.5 block text-[10px] font-semibold tracking-widest uppercase"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  Title
                </label>
                <input
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="text-on-surface min-h-[44px] w-full rounded-xl px-4 py-3 text-sm transition-all focus:outline-none"
                  style={{
                    background: "var(--color-surface-container)",
                    border: "1px solid var(--color-outline-variant)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-primary)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-primary-container)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-outline-variant)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
              <div ref={typeRef} className="relative">
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    className="block text-[10px] font-semibold tracking-widest uppercase"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    Type
                  </label>
                  <div className="flex items-center gap-1.5">
                    {aiMsg && (
                      <span
                        className="text-[9px] break-all"
                        style={{ color: aiMsg.ok ? "var(--color-primary)" : "var(--color-error)" }}
                      >
                        {aiMsg.text}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={suggestType}
                      disabled={aiTyping}
                      className="rounded-lg px-2 py-0.5 text-[10px] font-semibold transition-all disabled:opacity-50"
                      style={{
                        background: "var(--color-primary-container)",
                        color: "var(--color-primary)",
                      }}
                    >
                      {aiTyping ? "Thinking…" : "✦ AI pick"}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTypeOpen((p) => !p)}
                  className="flex min-h-[44px] w-full items-center justify-between rounded-xl px-4 py-3 text-sm transition-all"
                  style={{
                    background: "var(--color-surface-container)",
                    border: `1px solid ${typeOpen ? "var(--color-primary)" : "var(--color-outline-variant)"}`,
                    color: "var(--color-on-surface)",
                  }}
                >
                  <span>{editType.charAt(0).toUpperCase() + editType.slice(1)}</span>
                  <svg
                    className={`h-4 w-4 flex-shrink-0 transition-transform ${typeOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {typeOpen && (
                  <div
                    className="absolute top-full right-0 left-0 z-20 mt-1 overflow-y-auto rounded-xl border shadow-lg"
                    style={{
                      background: "var(--color-surface-container-high)",
                      borderColor: "var(--color-outline-variant)",
                      maxHeight: "200px",
                    }}
                  >
                    {CANONICAL_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setEditType(t);
                          setTypeOpen(false);
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/10"
                        style={{
                          color: "var(--color-on-surface)",
                          background: editType === t ? "var(--color-primary-container)" : undefined,
                        }}
                      >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label
                  className="mb-1.5 block text-[10px] font-semibold tracking-widest uppercase"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  Content
                </label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={4}
                  className="text-on-surface w-full resize-y rounded-xl px-4 py-3 text-sm transition-all focus:outline-none"
                  style={{
                    background: "var(--color-surface-container)",
                    border: "1px solid var(--color-outline-variant)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-primary)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-primary-container)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-outline-variant)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  className="text-on-surface-variant hover:text-on-surface press-scale flex-1 rounded-xl py-3 text-sm font-semibold transition-all"
                  style={{ border: "1px solid var(--color-outline-variant)" }}
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
                <button
                  className="press-scale flex-[2] rounded-xl py-3 text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    background:
                      saving || !editTitle.trim()
                        ? "var(--color-surface-container-highest)"
                        : "var(--color-primary)",
                    color:
                      saving || !editTitle.trim()
                        ? "var(--color-on-surface-variant)"
                        : "var(--color-on-primary)",
                    fontFamily: "var(--f-sans)",
                  }}
                  onClick={() =>
                    handleSave({ editTitle, editContent, editType, editTags }).then(() =>
                      setEditing(false),
                    )
                  }
                  disabled={saving || !editTitle.trim()}
                >
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-1 space-y-4">
              {isSecret && !secretRevealed ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <div className="text-4xl">{vaultUnlocked ? "🔐" : "🔒"}</div>
                  <p className="text-on-surface-variant text-sm">
                    {vaultUnlocked
                      ? "This entry is end-to-end encrypted"
                      : "Unlock your Vault to view this secret"}
                  </p>
                  {vaultUnlocked ? (
                    <button
                      className="press-scale mt-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all"
                      style={{
                        background: "var(--color-primary)",
                        color: "var(--color-on-primary)",
                      }}
                      onClick={() => setSecretRevealed(true)}
                    >
                      Reveal content
                    </button>
                  ) : (
                    <p className="text-on-surface-variant/50 mt-1 text-xs">
                      Go to the Vault tab and enter your passphrase
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-on-surface/90 text-sm leading-relaxed whitespace-pre-wrap">
                    {!showFullText && (editContent || "").length > CONTENT_PREVIEW_LIMIT
                      ? (editContent || "").slice(0, CONTENT_PREVIEW_LIMIT) + "…"
                      : editContent}
                  </p>
                  {(editContent || "").length > CONTENT_PREVIEW_LIMIT && (
                    <button
                      onClick={() => setShowFullText((s) => !s)}
                      className="mt-1 text-[11px] font-semibold"
                      style={{ color: "var(--color-primary)" }}
                    >
                      {showFullText ? "Show less" : "Show more"}
                    </button>
                  )}
                  {meta.length > 0 && (
                    <div
                      className="space-y-2 rounded-xl p-3"
                      style={{ background: "var(--color-surface-container)" }}
                    >
                      {meta.map(([k, v]) => {
                        const cl = confidence[k] as string | undefined;
                        const dotColor = cl === "extracted" ? "rgb(22,163,74)" : cl === "inferred" ? "rgb(217,119,6)" : cl === "ambiguous" ? "rgb(220,38,38)" : undefined;
                        return (
                          <div key={k} className="flex items-baseline gap-2 text-xs">
                            <span
                              className="flex-shrink-0 text-[10px] font-semibold tracking-widest uppercase"
                              style={{ color: "var(--color-on-surface-variant)" }}
                            >
                              {dotColor && (
                                <span
                                  className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                                  style={{ background: dotColor }}
                                  title={cl}
                                />
                              )}
                              {k.replace(/_/g, " ")}:{" "}
                            </span>
                            <span className="text-on-surface/80">
                              {Array.isArray(v) ? v.join(", ") : String(v)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

            </div>
          )}

          {/* Full Content drawer — shown when full_text or raw_content is stored */}
          {!editing && (typeof entry.metadata?.full_text === "string" || typeof entry.metadata?.raw_content === "string") && (
            <div className="pt-1">
              <button
                onClick={() => setShowFullContent((s) => !s)}
                className="flex w-full items-center justify-between py-1"
              >
                <span
                  className="text-[10px] font-semibold tracking-widest uppercase"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  Full Content
                </span>
                <span className="text-[10px]" style={{ color: "var(--color-on-surface-variant)" }}>
                  {showFullContent ? "▲" : "▼"}
                </span>
              </button>
              {showFullContent && (
                <div
                  className="mt-2 rounded-xl p-3"
                  style={{ background: "var(--color-surface-container)" }}
                >
                  <p className="text-on-surface/80 whitespace-pre-wrap text-xs leading-relaxed">
                    {String(entry.metadata.full_text ?? entry.metadata.raw_content)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Quick Actions */}
          {!editing && (
            <EntryQuickActions
              entry={entry}
              secretRevealed={secretRevealed}
              onRevealSecret={setSecretRevealed}
              onReorder={onReorder}
              onUpdate={onUpdate}
              handleShare={handleShare}
              shareMsg={shareMsg}
              onShareMsg={setShareMsg}
            />
          )}

        </div>
        {/* end scrollable body */}

        {/* Action strip — Delete and Edit consolidated at bottom for thumb reach */}
        {!editing && (canWrite && (onDelete || onUpdate)) && (
          <div
            className="flex flex-shrink-0 items-center gap-2 border-t px-5 py-3"
            style={{ borderColor: "var(--color-outline-variant)" }}
          >
            {canWrite && onDelete && (
              <button
                className="press-scale rounded-xl px-3 py-1.5 text-xs font-semibold transition-all"
                style={{
                  background: confirmingDelete
                    ? "var(--color-error-container)"
                    : "color-mix(in oklch, var(--color-error) 8%, transparent)",
                  color: confirmingDelete
                    ? "var(--color-on-error-container)"
                    : "var(--color-error)",
                  border: "1px solid color-mix(in oklch, var(--color-error) 20%, transparent)",
                }}
                onClick={async () => {
                  if (!confirmingDelete) {
                    setConfirmingDelete(true);
                    confirmTimerRef.current = setTimeout(() => setConfirmingDelete(false), 3000);
                  } else {
                    setDeleting(true);
                    await onDelete(entry.id);
                    setDeleting(false);
                  }
                }}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : confirmingDelete ? "Confirm delete?" : "Delete"}
              </button>
            )}
            {canWrite && onUpdate && (
              <button
                className="press-scale ml-auto rounded-xl px-3 py-1.5 text-xs font-semibold transition-all"
                style={{
                  border: "1px solid var(--color-outline-variant)",
                  color: "var(--color-on-surface-variant)",
                }}
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
