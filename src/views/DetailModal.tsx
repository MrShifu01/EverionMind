import React, { useState, useEffect, useRef } from "react";
import { useEntryEdit } from "../hooks/useEntryEdit";
import { EntryQuickActions } from "../components/EntryQuickActions";
import { authFetch } from "../lib/authFetch";
import { CANONICAL_TYPES } from "../types";
import type { Entry, Brain } from "../types";

// ── Metadata highlights ───────────────────────────────────────────────────────

const META_SKIP = new Set([
  "source", "embedding_provider", "embedded_at", "gmail_message_id",
  "gmail_thread_id", "gmail_thread_size", "gmail_participants",
  "completeness_score", "attachment_text", "full_text", "raw_content",
  "concepts", "confidence", "workspace", "email_type",
  // Gmail/AI internal fields — not useful in the detail card
  "gmail_date", "gmail_subject", "gmail_labels",
  "ai_insight", "insight", "relevance_score", "urgency",
]);

const META_PRIORITY: { key: string; label: string }[] = [
  { key: "amount",           label: "Amount"      },
  { key: "price",            label: "Price"       },
  { key: "account_number",   label: "Account"     },
  { key: "reference_number", label: "Reference"   },
  { key: "reference",        label: "Reference"   },
  { key: "due_date",         label: "Due date"    },
  { key: "deadline",         label: "Deadline"    },
  { key: "expiry_date",      label: "Expires"     },
  { key: "renewal_date",     label: "Renews"      },
  { key: "event_date",       label: "Date"        },
  { key: "date",             label: "Date"        },
  { key: "phone",            label: "Phone"       },
  { key: "email",            label: "Email"       },
  { key: "id_number",        label: "ID Number"   },
  { key: "national_id",      label: "ID Number"   },
  { key: "url",              label: "Link"        },
  { key: "status",           label: "Status"      },
  { key: "gmail_from",       label: "From"        },
];

const DATE_KEYS = new Set(["due_date", "deadline", "expiry_date", "renewal_date", "event_date", "date"]);

function fmtMetaValue(key: string, raw: string): string {
  if (DATE_KEYS.has(key)) {
    try {
      const d = new Date(raw);
      if (!isNaN(d.getTime()))
        return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
    } catch {}
  }
  return raw;
}

function pickTopMetaFields(meta: Record<string, unknown>): { label: string; value: string; key: string }[] {
  const result: { label: string; value: string; key: string }[] = [];
  const usedLabels = new Set<string>();

  for (const { key, label } of META_PRIORITY) {
    if (result.length >= 5) break;
    if (usedLabels.has(label)) continue;
    const v = meta[key];
    if (v == null) continue;
    const str = String(v).trim();
    if (!str || str === "null" || str === "undefined" || str === "0") continue;
    result.push({ label, value: fmtMetaValue(key, str), key });
    usedLabels.add(label);
  }

  for (const [key, val] of Object.entries(meta)) {
    if (result.length >= 5) break;
    if (META_SKIP.has(key) || META_PRIORITY.some((p) => p.key === key)) continue;
    if (val == null || typeof val === "object") continue;
    const str = String(val).trim();
    if (!str || str === "null" || str === "undefined") continue;
    const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    if (usedLabels.has(label)) continue;
    result.push({ label, value: fmtMetaValue(key, str), key });
    usedLabels.add(label);
  }

  return result;
}

interface DetailModalProps {
  entry: Entry;
  onClose: () => void;
  onDelete?: (id: string) => void | Promise<void>;
  onUpdate?: (id: string, changes: any) => Promise<void>;
  onReorder?: (entry: any) => void;
  canWrite?: boolean;
  brains?: Brain[];
  vaultUnlocked?: boolean;
  onTypeIconChange?: (type: string, icon: string) => void;
}

export default function DetailModal({
  entry,
  onClose,
  onDelete,
  onUpdate,
  onReorder,
  canWrite = true,
  brains = [],
  vaultUnlocked = false,
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
  const [editTags] = useState((entry.tags || []).join(", "));
  const [secretRevealed, setSecretRevealed] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [aiMsg, setAiMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [ignoringEmail, setIgnoringEmail] = useState(false);
  const [ignoreMsg, setIgnoreMsg] = useState<{ text: string; ok: boolean } | null>(null);
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
    editExtraBrainIds: _editExtraBrainIds,
    extraBrainsLoaded: _extraBrainsLoaded,
    shareMsg,
    setShareMsg,
    editBrainId: _editBrainId,
    handleSave,
    handleShare,
    toggleExtraBrain: _toggleExtraBrain,
  } = useEntryEdit({ entry, editing, onUpdate, onTypeIconChange, brains });
  const isSecret = entry.type === "secret";
  const isPinned = !!(entry as any).pinned;
  const isContact = entry.type === "contact" || entry.type === "person";
  const isGmailEntry = entry.type === "gmail-flag" || (entry.metadata as any)?.source === "gmail";

  async function handleIgnoreEmail() {
    setIgnoringEmail(true);
    setIgnoreMsg(null);
    try {
      const r = await authFetch("/api/gmail?action=ignore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: (entry.metadata as any)?.gmail_subject,
          from: (entry.metadata as any)?.gmail_from,
          email_type: (entry.metadata as any)?.email_type,
          content_preview: entry.content?.slice(0, 300),
        }),
      });
      if (r?.ok) {
        setIgnoreMsg({ text: "Rule saved ✓", ok: true });
      } else {
        setIgnoreMsg({ text: "Failed — try again", ok: false });
      }
    } catch {
      setIgnoreMsg({ text: "Failed — try again", ok: false });
    }
    setIgnoringEmail(false);
  }

  function saveToContacts() {
    const meta = (entry.metadata || {}) as Record<string, string>;
    const content = entry.content ?? "";

    const phone =
      meta.phone ||
      content.match(/(?:phone|tel|cell|mobile)[:\s]+([+\d][\d\s().+-]{6,})/i)?.[1]?.trim() ||
      content.match(/(\+\d[\d\s().+-]{6,})/)?.[1]?.trim() ||
      "";

    const email = meta.email || content.match(/[\w.+-]+@[\w-]+\.\w+/)?.[0] || "";

    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${entry.title}`,
      `N:${entry.title};;;;`,
      phone ? `TEL:${phone}` : "",
      email ? `EMAIL:${email}` : "",
      content ? `NOTE:${content.replace(/\n/g, "\\n")}` : "",
      "END:VCARD",
    ]
      .filter(Boolean)
      .join("\r\n");

    const blob = new Blob([lines], { type: "text/vcard" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${entry.title.replace(/[^a-z0-9]/gi, "_")}.vcf`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const [showFullContent, setShowFullContent] = useState(false);
  const [showFullText, setShowFullText] = useState(false);
  const CONTENT_PREVIEW_LIMIT = 300;
  // Freeze "now" at mount so the relative-time display doesn't recompute
  // impurely on every render (React Compiler rule) — modal is ephemeral anyway.
  const [mountedAt] = useState(() => Date.now());

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
        {/* Header — bell + TYPE · time on left, action icons on right */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "14px 18px 14px 24px",
            borderBottom: "1px solid var(--line-soft)",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-faint)" }}>
            {/* Small line-art bell/reminder glyph (uses entry type) */}
            <svg
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
              aria-hidden="true"
              style={{ flexShrink: 0 }}
            >
              {editType === "reminder" ? (
                <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" />
              ) : editType === "link" ? (
                <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
              ) : editType === "idea" ? (
                <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V15h7v-1.1A6 6 0 0 0 12 3z" />
              ) : editType === "contact" || editType === "person" ? (
                <>
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
                </>
              ) : editType === "file" || editType === "document" ? (
                <>
                  <path d="M6 3h8l4 4v14H6z" />
                  <path d="M14 3v4h4" />
                </>
              ) : editType === "secret" ? (
                <>
                  <rect x="4" y="10" width="16" height="10" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </>
              ) : (
                <>
                  <path d="M5 4h10l4 4v12H5z" />
                  <path d="M15 4v4h4M8 12h8M8 16h6" />
                </>
              )}
            </svg>
            <span
              className="f-sans"
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--ink-soft)",
              }}
            >
              {editType}
            </span>
          </div>
          <span
            aria-hidden="true"
            style={{
              width: 1,
              height: 14,
              background: "var(--line-soft)",
              flexShrink: 0,
              margin: "0 2px",
            }}
          />
          <span className="f-sans" style={{ fontSize: 13, color: "var(--ink-faint)" }}>
            {(() => {
              const iso = (entry as any).created_at || (entry as any).createdAt;
              if (!iso) return "";
              const then = new Date(iso).getTime();
              const diff = mountedAt - then;
              const m = Math.round(diff / 60000);
              if (m < 1) return "just now";
              if (m < 60) return `${m}m ago`;
              const h = Math.round(m / 60);
              if (h < 24) return `${h}h ago`;
              const d = Math.round(h / 24);
              if (d < 7) return `${d}d ago`;
              if (d < 30) return `${Math.round(d / 7)}w ago`;
              const mo = Math.round(d / 30);
              if (mo < 12) return `${mo}mo ago`;
              return `${Math.round(d / 365)}y ago`;
            })()}
          </span>

          <div style={{ flex: 1 }} />

          {!canWrite && (
            <span
              className="f-serif"
              style={{
                fontSize: 12,
                fontStyle: "italic",
                color: "var(--ink-faint)",
                marginRight: 4,
              }}
            >
              view only
            </span>
          )}

          {/* Pin */}
          {canWrite && onUpdate && (
            <button
              aria-label={isPinned ? "Unpin" : "Pin"}
              className="design-btn-ghost press"
              onClick={() => onUpdate(entry.id, { pinned: !isPinned })}
              style={{
                width: 32,
                height: 32,
                minHeight: 32,
                padding: 0,
                color: isPinned ? "var(--ember)" : "var(--ink-faint)",
              }}
            >
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
                <path d="M15 3 21 9l-4 1-4 4-1 5-3-3-5 5-1-1 5-5-3-3 5-1 4-4z" />
              </svg>
            </button>
          )}

          {/* Vault / lock */}
          <button
            aria-label={isSecret ? "Vault entry" : "Move to vault"}
            className="design-btn-ghost press"
            style={{
              width: 32,
              height: 32,
              minHeight: 32,
              padding: 0,
              color: isSecret ? "var(--ember)" : "var(--ink-faint)",
            }}
            onClick={() => {
              if (canWrite && onUpdate) onUpdate(entry.id, { type: isSecret ? "note" : "secret" });
            }}
          >
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
              <rect x="4" y="10" width="16" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </button>

          {/* More / edit */}
          {canWrite && (
            <button
              aria-label="Edit"
              className="design-btn-ghost press"
              onClick={() => setEditing(true)}
              style={{
                width: 32,
                height: 32,
                minHeight: 32,
                padding: 0,
                color: "var(--ink-faint)",
              }}
            >
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
                <circle cx="6" cy="12" r="1" />
                <circle cx="12" cy="12" r="1" />
                <circle cx="18" cy="12" r="1" />
              </svg>
            </button>
          )}

          <button
            aria-label="Close"
            className="design-btn-ghost press"
            onClick={editing ? () => setEditing(false) : onClose}
            style={{ width: 32, height: 32, minHeight: 32, padding: 0, color: "var(--ink-faint)" }}
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
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
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
            <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 24 }}>
              {isSecret && !secretRevealed ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                    padding: "32px 0",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: "50%",
                      background: "var(--ember-wash)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      width="24"
                      height="24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      viewBox="0 0 24 24"
                      style={{ color: "var(--ember)" }}
                      aria-hidden="true"
                    >
                      <rect x="4" y="10" width="16" height="10" rx="2" />
                      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                    </svg>
                  </div>
                  <p
                    className="f-serif"
                    style={{
                      fontSize: 16,
                      fontStyle: "italic",
                      color: "var(--ink-soft)",
                      margin: 0,
                    }}
                  >
                    {vaultUnlocked
                      ? "end-to-end encrypted. tap to reveal."
                      : "unlock your vault to view this secret."}
                  </p>
                  {vaultUnlocked && (
                    <button
                      className="design-btn-primary press"
                      onClick={() => setSecretRevealed(true)}
                    >
                      Reveal content
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Body — serif 18/1.65, the redesign's "reading surface" */}
                  <p
                    className="f-serif"
                    style={{
                      fontSize: 18,
                      lineHeight: 1.65,
                      color: "var(--ink)",
                      margin: 0,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {!showFullText && (editContent || "").length > CONTENT_PREVIEW_LIMIT
                      ? (editContent || "").slice(0, CONTENT_PREVIEW_LIMIT) + "…"
                      : editContent}
                  </p>
                  {(editContent || "").length > CONTENT_PREVIEW_LIMIT && (
                    <button
                      onClick={() => setShowFullText((s) => !s)}
                      className="f-sans press"
                      style={{
                        alignSelf: "flex-start",
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--ember)",
                        background: "transparent",
                        border: 0,
                        padding: 0,
                        cursor: "pointer",
                      }}
                    >
                      {showFullText ? "show less" : "show more"}
                    </button>
                  )}

                  {/* Key metadata highlights */}
                  {(() => {
                    const fields = entry.metadata
                      ? pickTopMetaFields(entry.metadata as Record<string, unknown>)
                      : [];
                    if (!fields.length) return null;
                    const chipStyle: React.CSSProperties = {
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: "var(--surface)",
                      border: "1px solid var(--line-soft)",
                      minWidth: 0,
                      overflow: "hidden",
                      textDecoration: "none",
                      display: "block",
                    };
                    const labelStyle: React.CSSProperties = {
                      fontFamily: "var(--f-sans)",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--ink-faint)",
                      marginBottom: 4,
                    };
                    return (
                      <div>
                        <div className="micro" style={{ marginBottom: 10 }}>Details</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          {fields.map(({ label, value, key }) => {
                            const isEmail = key === "email";
                            const isPhone = key === "phone";
                            const isUrl   = key === "url";
                            const isAccent = isEmail || isPhone || isUrl;
                            const inner = (
                              <>
                                <div style={labelStyle}>{label}</div>
                                <div
                                  className="f-sans"
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 500,
                                    color: isAccent ? "var(--ember)" : "var(--ink)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {value}
                                </div>
                              </>
                            );
                            if (isEmail)
                              return <a key={label} href={`mailto:${value}`} style={chipStyle}>{inner}</a>;
                            if (isPhone)
                              return <a key={label} href={`tel:${value}`} style={chipStyle}>{inner}</a>;
                            if (isUrl)
                              return <a key={label} href={value} target="_blank" rel="noopener noreferrer" style={chipStyle}>{inner}</a>;
                            return <div key={label} style={chipStyle}>{inner}</div>;
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Tags — #admin style chips */}
                  {(entry.tags || []).length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {(entry.tags || []).map((t) => (
                        <span key={t} className="design-chip f-sans" style={{ fontSize: 13 }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Concepts — ember-wash chips under a CONCEPTS micro label */}
                  {(() => {
                    const rawConcepts =
                      ((entry.metadata as any)?.concepts as unknown) ??
                      (entry as any).concepts ??
                      [];
                    const concepts = Array.isArray(rawConcepts)
                      ? rawConcepts.filter((c) => typeof c === "string")
                      : [];
                    if (concepts.length === 0) return null;
                    return (
                      <div>
                        <div className="micro" style={{ marginBottom: 10 }}>
                          Concepts
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {concepts.map((c: string) => (
                            <span
                              key={c}
                              className="design-chip f-sans"
                              style={{
                                fontSize: 13,
                                background: "var(--ember-wash)",
                                color: "var(--ember)",
                              }}
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* Full Content drawer — shown when full_text, raw_content, or attachment_text is stored */}
          {!editing &&
            (typeof entry.metadata?.full_text === "string" ||
              typeof entry.metadata?.raw_content === "string" ||
              typeof entry.metadata?.attachment_text === "string") && (
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
                  <span
                    className="text-[10px]"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    {showFullContent ? "▲" : "▼"}
                  </span>
                </button>
                {showFullContent && (
                  <div
                    className="mt-2 rounded-xl p-3"
                    style={{ background: "var(--color-surface-container)" }}
                  >
                    <p className="text-on-surface/80 text-xs leading-relaxed whitespace-pre-wrap">
                      {String(
                        entry.metadata.full_text ??
                          entry.metadata.raw_content ??
                          entry.metadata.attachment_text,
                      )}
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

        {/* Minimal bottom strip — Delete + Save to Contacts */}
        {!editing && (isContact || (canWrite && onDelete) || isGmailEntry) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
              padding: "12px 24px",
              borderTop: "1px solid var(--line-soft)",
            }}
          >
            {isContact && (
              <button
                className="press f-sans"
                onClick={saveToContacts}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "0 12px",
                  height: 30,
                  minHeight: 30,
                  borderRadius: 6,
                  background: "transparent",
                  color: "var(--ink-soft)",
                  border: "1px solid transparent",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 180ms",
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
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                save to contacts
              </button>
            )}
            {!isContact && isGmailEntry && (
              <button
                className="press f-sans"
                onClick={handleIgnoreEmail}
                disabled={ignoringEmail || ignoreMsg?.ok === true}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "0 12px",
                  height: 30,
                  minHeight: 30,
                  borderRadius: 6,
                  background: "transparent",
                  color: ignoreMsg?.ok
                    ? "var(--moss)"
                    : ignoreMsg
                      ? "var(--blood)"
                      : "var(--ink-soft)",
                  border: "1px solid transparent",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: ignoringEmail || ignoreMsg?.ok ? "default" : "pointer",
                  transition: "all 180ms",
                  opacity: ignoringEmail ? 0.6 : 1,
                }}
              >
                {ignoringEmail
                  ? "Adding rule…"
                  : ignoreMsg
                    ? ignoreMsg.text
                    : "Ignore future emails like this"}
              </button>
            )}
            {!isContact && !isGmailEntry && <span />}
            {canWrite && onDelete && (
              <button
                className="press f-sans"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "0 12px",
                  height: 30,
                  minHeight: 30,
                  borderRadius: 6,
                  background: confirmingDelete ? "var(--blood-wash)" : "transparent",
                  color: "var(--blood)",
                  border: `1px solid ${confirmingDelete ? "var(--blood)" : "transparent"}`,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 180ms",
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
                  <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
                </svg>
                {deleting ? "deleting…" : confirmingDelete ? "confirm delete?" : "delete"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
