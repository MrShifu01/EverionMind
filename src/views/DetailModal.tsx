import React, { useState, useEffect, useRef } from "react";
import { BrainTypeIcon } from "../components/icons/BrainTypeIcon";
import { TC } from "../data/constants";
import { resolveIcon } from "../lib/typeIcons";
import { extractPhone, toWaUrl } from "../lib/phone";
import { useEntryEdit } from "../hooks/useEntryEdit";
import type { Entry, Brain, EntryType } from "../types";

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

  const {
    saving,
    editExtraBrainIds,
    extraBrainsLoaded,
    shareMsg, setShareMsg,
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
  const skip = new Set(["category", "status"]);
  const meta = Object.entries(entry.metadata || {}).filter(([k]) => !skip.has(k));

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  // Lock body scroll while modal is open (prevents background page scrolling on mobile)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
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
        <svg className="inline h-3.5 w-3.5 align-middle" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
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
          maxHeight: "calc(100vh - 96px - env(safe-area-inset-bottom) - env(safe-area-inset-top))",
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
              <div>
                <label
                  className="mb-1.5 block text-[10px] font-semibold tracking-widest uppercase"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  Type
                </label>
                {/* Free-form type input — AI can use any label; datalist shows known types */}
                <datalist id="entry-types-list">
                  {Array.from(
                    new Set([
                      ...entries.map((e) => e.type).filter(Boolean),
                      "note",
                      "person",
                      "place",
                      "idea",
                      "contact",
                      "document",
                      "reminder",
                      "decision",
                      "secret",
                    ]),
                  ).map((typ) => (
                    <option key={typ} value={typ} />
                  ))}
                </datalist>
                <input
                  type="text"
                  list="entry-types-list"
                  value={editType}
                  onChange={(e) => setEditType(e.target.value.toLowerCase().trim())}
                  placeholder="e.g. recipe, supplier, director…"
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
              <div>
                <label
                  className="mb-1.5 block text-[10px] font-semibold tracking-widest uppercase"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  Tags{" "}
                  <span className="text-on-surface-variant/50 normal-case">(comma separated)</span>
                </label>
                <input
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="tag1, tag2, tag3"
                  className="text-on-surface placeholder:text-on-surface-variant/40 min-h-[44px] w-full rounded-xl px-4 py-3 text-sm transition-all focus:outline-none"
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
              {brains.length > 1 && (
                <div>
                  <label
                    className="mb-1.5 block text-[10px] font-semibold tracking-widest uppercase"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    Brains{" "}
                    <span className="text-on-surface-variant/50 tracking-normal normal-case">
                      (tap to add/remove)
                    </span>
                  </label>
                  {!extraBrainsLoaded ? (
                    <div className="flex flex-wrap gap-2">
                      {brains.map((b) => (
                        <div
                          key={b.id}
                          className="h-9 w-24 animate-pulse rounded-xl"
                          style={{ background: "var(--color-surface-container)" }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {brains.map((b) => {
                        const isPrimary = editBrainId === b.id;
                        const isExtra = editExtraBrainIds.includes(b.id);
                        const isActive = isPrimary || isExtra;
                        return (
                          <button
                            key={b.id}
                            aria-label={`${isActive ? "Remove from" : "Add to"} ${b.name}`}
                            aria-pressed={isActive}
                            className="press-scale flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                            style={{
                              background: isPrimary
                                ? "var(--color-primary-container)"
                                : isExtra
                                  ? "var(--color-secondary-container)"
                                  : "var(--color-surface-container)",
                              border: isPrimary
                                ? "1px solid var(--color-primary)"
                                : isExtra
                                  ? "1px solid var(--color-secondary)"
                                  : "1px solid var(--color-outline-variant)",
                              color: isPrimary
                                ? "var(--color-primary)"
                                : isExtra
                                  ? "var(--color-secondary)"
                                  : "var(--color-on-surface-variant)",
                            }}
                            onClick={() => toggleExtraBrain(b.id, isPrimary)}
                          >
                            <BrainTypeIcon type={b.type ?? "personal"} className="h-3.5 w-3.5" />
                            {b.name}
                            {isPrimary && <span className="text-[9px] opacity-60">primary</span>}
                            {isExtra && <span className="text-[9px] opacity-60">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
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
                  onClick={() => handleSave({ editTitle, editContent, editType, editTags }).then(() => setEditing(false))}
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
                    {editContent}
                  </p>
                  {meta.length > 0 && (
                    <div
                      className="space-y-2 rounded-xl p-3"
                      style={{ background: "var(--color-surface-container)" }}
                    >
                      {meta.map(([k, v]) => (
                        <div key={k} className="flex items-baseline gap-2 text-xs">
                          <span
                            className="flex-shrink-0 text-[10px] font-semibold tracking-widest uppercase"
                            style={{ color: "var(--color-on-surface-variant)" }}
                          >
                            {k.replace(/_/g, " ")}:{" "}
                          </span>
                          <span className="text-on-surface/80">
                            {Array.isArray(v) ? v.join(", ") : String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {editTags
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean).length > 0 && (
                <div className="pt-1">
                  <div className="flex flex-wrap gap-1.5">
                    {editTags
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean)
                      .map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                          style={{
                            background: "var(--color-primary-container)",
                            color: "var(--color-primary)",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                  </div>
                </div>
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
        </div>
        {/* end scrollable body */}
      </div>
    </div>
  );
}
