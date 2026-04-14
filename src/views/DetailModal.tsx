import React, { useState, useEffect, useRef, useMemo } from "react";
import { BrainTypeIcon } from "../components/icons/BrainTypeIcon";
import { TC } from "../data/constants";
import { resolveIcon } from "../lib/typeIcons";
import { extractPhone, toWaUrl } from "../lib/phone";
import { useEntryEdit } from "../hooks/useEntryEdit";
import { authFetch } from "../lib/authFetch";
import { loadGraphFromDB, getRelatedEntries, getConceptsForEntry } from "../lib/conceptGraph";
import type { ConceptGraph } from "../lib/conceptGraph";
import { CANONICAL_TYPES } from "../types";
import type { Entry, Brain, EntryType } from "../types";
import { EntryHealthPanel } from "../components/EntryHealthPanel";

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
  const related = links
    .filter((l) => l.from === entry.id || l.to === entry.id)
    .map((l) => ({
      ...l,
      other: entries.find((e) => e.id === (l.from === entry.id ? l.to : l.from)),
      dir: l.from === entry.id ? "→" : "←",
    }));
  // Concept graph: load async from DB so we always get fresh data
  const brainId = entry.brain_id;
  const [conceptGraph, setConceptGraph] = useState<ConceptGraph | null>(null);
  useEffect(() => {
    if (!brainId) return;
    loadGraphFromDB(brainId).then(setConceptGraph).catch(() => {});
  }, [brainId, entry.id]);
  const entryConcepts = useMemo(() => {
    if (!conceptGraph) return [];
    return getConceptsForEntry(conceptGraph, entry.id);
  }, [conceptGraph, entry.id]);
  const conceptRelated = useMemo(() => {
    if (!conceptGraph) return [];
    return getRelatedEntries(conceptGraph, entry.id)
      .slice(0, 5)
      .map((r) => ({
        ...r,
        entry: entries.find((e) => e.id === r.entryId),
      }))
      .filter((r) => r.entry);
  }, [conceptGraph, entry.id, entries]);
  const [showFullContent, setShowFullContent] = useState(false);
  const [showFullText, setShowFullText] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const CONTENT_PREVIEW_LIMIT = 300;
  const skip = new Set(["category", "status", "confidence", "completeness_score", "raw_content", "source_entry_id", "full_text", "workspace"]);
  const meta = Object.entries(entry.metadata || {}).filter(([k]) => !skip.has(k));
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

  const phone = extractPhone(entry);
  const isSupplier = entry.tags?.includes("supplier") || entry.metadata?.category === "supplier";

  // Build quick actions for this entry type
  const quickActions = [];

  if (isSupplier || entry.type === "contact" || entry.type === "person") {
    if (phone) {
      quickActions.push(
        <a
          key="call"
          href={`tel:${phone}`}
          className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
          style={{
            background: "var(--color-surface-container)",
            border: "1px solid var(--color-outline-variant)",
            color: "var(--color-on-surface-variant)",
          }}
        >
          📞 Call
        </a>,
      );
      quickActions.push(
        <a
          key="wa"
          href={toWaUrl(phone)}
          target="_blank"
          rel="noreferrer"
          className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
          style={{
            background: "var(--color-surface-container)",
            border: "1px solid var(--color-outline-variant)",
            color: "var(--color-on-surface-variant)",
          }}
        >
          💬 WhatsApp
        </a>,
      );
    }
    if (isSupplier && onReorder) {
      quickActions.push(
        <button
          key="reorder"
          className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
          style={{
            background: "var(--color-surface-container)",
            border: "1px solid var(--color-outline-variant)",
            color: "var(--color-on-surface-variant)",
          }}
          onClick={() => onReorder(entry)}
        >
          🔁 Reorder
        </button>,
      );
    }
  }

  if (entry.type === "reminder") {
    if (entry.metadata?.status !== "done") {
      quickActions.push(
        <button
          key="done"
          className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all"
          style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
          onClick={() =>
            onUpdate?.(entry.id, { metadata: { ...entry.metadata, status: "done" }, importance: 0 })
          }
        >
          ✅ Mark Done
        </button>,
      );
    }
    quickActions.push(
      <button
        key="snooze1w"
        className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
        style={{
          background: "var(--color-surface-container)",
          border: "1px solid var(--color-outline-variant)",
          color: "var(--color-on-surface-variant)",
        }}
        onClick={() => {
          const d = new Date(entry.metadata?.due_date || Date.now());
          d.setDate(d.getDate() + 7);
          onUpdate?.(entry.id, {
            metadata: { ...entry.metadata, due_date: d.toISOString().split("T")[0] },
          });
        }}
      >
        ⏰ +1 week
      </button>,
    );
    quickActions.push(
      <button
        key="snooze1m"
        className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
        style={{
          background: "var(--color-surface-container)",
          border: "1px solid var(--color-outline-variant)",
          color: "var(--color-on-surface-variant)",
        }}
        onClick={() => {
          const d = new Date(entry.metadata?.due_date || Date.now());
          d.setMonth(d.getMonth() + 1);
          onUpdate?.(entry.id, {
            metadata: { ...entry.metadata, due_date: d.toISOString().split("T")[0] },
          });
        }}
      >
        ⏰ +1 month
      </button>,
    );
  }

  if (entry.type === "idea") {
    if (entry.metadata?.status !== "in_progress") {
      quickActions.push(
        <button
          key="start"
          className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all"
          style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
          onClick={() =>
            onUpdate?.(entry.id, { metadata: { ...entry.metadata, status: "in_progress" } })
          }
        >
          🚀 Start this
        </button>,
      );
    }
    if (entry.metadata?.status !== "archived") {
      quickActions.push(
        <button
          key="archive"
          className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
          style={{
            background: "var(--color-surface-container)",
            border: "1px solid var(--color-outline-variant)",
            color: "var(--color-on-surface-variant)",
          }}
          onClick={() =>
            onUpdate?.(entry.id, { metadata: { ...entry.metadata, status: "archived" } })
          }
        >
          📦 Archive
        </button>,
      );
    }
  }

  if (entry.type === "document" && onReorder) {
    quickActions.push(
      <button
        key="renewal"
        className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
        style={{
          background: "var(--color-surface-container)",
          border: "1px solid var(--color-outline-variant)",
          color: "var(--color-on-surface-variant)",
        }}
        onClick={() => onReorder({ ...entry, _renewalMode: true })}
      >
        <svg
          className="inline h-3.5 w-3.5 align-middle"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>{" "}
        Set renewal reminder
      </button>,
    );
  }

  if (isSecret) {
    if (secretRevealed) {
      quickActions.push(
        <button
          key="copy-secret"
          className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
          style={{
            background: "var(--color-surface-container)",
            border: "1px solid var(--color-outline-variant)",
            color: "var(--color-on-surface-variant)",
          }}
          onClick={() => {
            navigator.clipboard.writeText(entry.content || "").then(() => {
              setShareMsg("Copied to clipboard");
              setTimeout(() => setShareMsg(null), 2500);
            });
          }}
        >
          📋 Copy
        </button>,
      );
      quickActions.push(
        <button
          key="hide-secret"
          className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
          style={{
            background: "var(--color-surface-container)",
            border: "1px solid var(--color-outline-variant)",
            color: "var(--color-on-surface-variant)",
          }}
          onClick={() => setSecretRevealed(false)}
        >
          👁 Hide
        </button>,
      );
    }
  }

  // Share always available (but not for secret entries)
  if (!isSecret)
    quickActions.push(
      <button
        key="share"
        className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
        style={{
          background: "var(--color-surface-container)",
          border: "1px solid var(--color-outline-variant)",
          color: "var(--color-on-surface-variant)",
        }}
        onClick={() => handleShare(entry)}
      >
        📤 Share
      </button>,
    );

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
        className="relative flex w-full max-w-lg flex-col rounded-t-2xl border lg:rounded-2xl"
        style={{
          background: "var(--color-surface-container-low)",
          borderColor: "var(--color-outline-variant)",
          boxShadow: "var(--shadow-lg)",
          animation: "zoom-in-95 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          // Cap height to the actual available space so the header is never pushed above viewport.
          // 96px = nav bar clearance; subtract safe-area so the header stays fully in view.
          maxHeight: "calc(100dvh - 96px - env(safe-area-inset-bottom) - env(safe-area-inset-top))",
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {/* Header — always visible, never scrolls away */}
        <div className="flex flex-shrink-0 items-start justify-between px-5 pt-5 pb-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-lg">{cfg.i}</span>
              <span
                className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-widest uppercase"
                style={{
                  background: "var(--color-primary-container)",
                  color: "var(--color-primary)",
                }}
              >
                {editType}
              </span>
              {confidence.type && (() => {
                const cl = confidence.type;
                const dotColor = cl === "extracted" ? "rgb(22,163,74)" : cl === "inferred" ? "rgb(217,119,6)" : "rgb(220,38,38)";
                const label = cl === "extracted" ? "Extracted" : cl === "inferred" ? "Inferred" : "Ambiguous";
                return (
                  <span
                    className="rounded-full px-2 py-0.5 text-[9px] font-medium"
                    style={{ background: `${dotColor}15`, color: dotColor }}
                  >
                    {label}
                  </span>
                );
              })()}
            </div>
            {!editing && (
              <h2
                id="detail-modal-title"
                className="text-on-surface truncate text-lg font-bold"
                style={{ fontFamily: "'Lora', Georgia, serif" }}
              >
                {editTitle}
              </h2>
            )}
          </div>
          <div className="ml-3 flex flex-shrink-0 items-center gap-2">
            {!editing && canWrite && onDelete && (
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
            {!editing && canWrite && onUpdate && (
              <button
                className="press-scale rounded-xl px-3 py-1.5 text-xs font-semibold transition-all"
                style={{
                  border: "1px solid var(--color-outline-variant)",
                  color: "var(--color-on-surface-variant)",
                }}
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
            )}
            {!canWrite && <span className="text-on-surface-variant/60 text-xs">🔒 View only</span>}
            <button
              aria-label="Close"
              className="text-on-surface-variant hover:text-on-surface hover:bg-surface-container press-scale flex h-11 w-11 items-center justify-center rounded-lg transition-all"
              onClick={editing ? () => setEditing(false) : onClose}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div
          data-testid="detail-scroll-body"
          className="flex-1 overflow-y-auto px-5 pb-8"
          style={
            {
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
                    fontFamily: "'DM Sans', system-ui, sans-serif",
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
              {related.length > 0 && (
                <div className="pt-1">
                  <p
                    className="mb-2 text-[10px] font-semibold tracking-widest uppercase"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    Connections
                  </p>
                  {related.map(
                    (r, i) =>
                      r.other && (
                        <div
                          key={i}
                          className="mb-1.5 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                          style={{ background: "var(--color-surface-container)" }}
                        >
                          <span>{resolveIcon(r.other.type, typeIcons)}</span>
                          <span className="text-on-surface-variant/50">{r.dir}</span>
                          <span className="text-on-surface flex-1">{r.other.title}</span>
                          <span className="text-on-surface-variant/50 text-[10px] tracking-widest uppercase">
                            {r.rel}
                          </span>
                        </div>
                      ),
                  )}
                </div>
              )}
              {entryConcepts.length > 0 && (
                <div className="pt-1">
                  <p
                    className="mb-2 text-[10px] font-semibold tracking-widest uppercase"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    Concepts
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {entryConcepts.map((c) => (
                      <span
                        key={c.id}
                        className="rounded-full px-2.5 py-0.5 text-[10px] font-medium"
                        style={{
                          background: "var(--color-secondary-container)",
                          color: "var(--color-secondary)",
                        }}
                      >
                        {c.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {conceptRelated.length > 0 && (
                <div className="pt-1">
                  <p
                    className="mb-2 text-[10px] font-semibold tracking-widest uppercase"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    Related by Concepts
                  </p>
                  {conceptRelated.map((r) => (
                    <div
                      key={r.entryId}
                      className="mb-1.5 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                      style={{ background: "var(--color-surface-container)" }}
                    >
                      <span>{resolveIcon(r.entry!.type, typeIcons)}</span>
                      <span className="text-on-surface flex-1 truncate">{r.entry!.title}</span>
                      <span className="text-on-surface-variant/50 text-[10px]">
                        {r.sharedConcepts.slice(0, 2).join(", ")}
                      </span>
                    </div>
                  ))}
                </div>
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
          {!editing && quickActions.length > 0 && (
            <div
              className="mt-4 pt-4"
              style={{ borderTop: "1px solid var(--color-outline-variant)" }}
            >
              <div className="flex flex-wrap gap-2">{quickActions}</div>
              {shareMsg && (
                <p className="mt-2 text-center text-xs" style={{ color: "var(--color-primary)" }}>
                  {shareMsg}
                </p>
              )}
            </div>
          )}

          {/* Brain Health */}
          {!editing && entry.type !== "secret" && brainId && (
            <div
              className="mt-4 pt-4"
              style={{ borderTop: "1px solid var(--color-outline-variant)" }}
            >
              <button
                onClick={() => setHealthOpen((p) => !p)}
                className="flex w-full items-center justify-between py-1"
              >
                <span
                  className="text-[10px] font-semibold tracking-widest uppercase"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  Brain Health
                </span>
                <span className="text-[10px]" style={{ color: "var(--color-on-surface-variant)" }}>
                  {healthOpen ? "▲" : "▼"}
                </span>
              </button>
              {healthOpen && (
                <div className="mt-3">
                  <EntryHealthPanel
                    entry={entry}
                    brainId={brainId}
                    entries={entries}
                    metaKeys={meta.map(([k]) => k)}
                    entryConcepts={entryConcepts}
                    hasRelated={conceptRelated.length > 0}
                    onRefreshConcepts={() =>
                      loadGraphFromDB(brainId).then(setConceptGraph).catch(() => {})
                    }
                    onUpdate={onUpdate}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        {/* end scrollable body */}
      </div>
    </div>
  );
}
