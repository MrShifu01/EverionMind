import React, { useState, useEffect, useRef } from "react";
import { TC } from "../data/constants";
import { resolveIcon, pickDefaultIcon } from "../lib/typeIcons";
import { extractPhone, toWaUrl } from "../lib/phone";
import { authFetch } from "../lib/authFetch";
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
  onDelete?: (id: string) => Promise<void>;
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
  if (!entry) return null;
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editTitle, setEditTitle] = useState(entry.title);
  const [editContent, setEditContent] = useState(entry.content);
  const [editType, setEditType] = useState<string>(entry.type);
  const [editTags, setEditTags] = useState((entry.tags || []).join(", "));
  const editBrainId = entry.brain_id || "";
  // Extra brains: brains the entry is shared into via entry_brains junction (beyond primary)
  const [extraBrainIds, setExtraBrainIds] = useState<string[]>([]); // server state (loaded on edit open)
  const [editExtraBrainIds, setEditExtraBrainIds] = useState<string[]>([]); // in-progress edits
  const [extraBrainsLoaded, setExtraBrainsLoaded] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [secretRevealed, setSecretRevealed] = useState(false);
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
    return () => { document.body.style.overflow = prev; };
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

  // Fetch extra brain assignments when edit mode opens
  useEffect(() => {
    if (!editing || extraBrainsLoaded || !entry.id) return;
    authFetch(`/api/entry-brains?entry_id=${encodeURIComponent(entry.id)}`)
      .then((r) => r.json())
      .then((ids: string[]) => {
        const clean = Array.isArray(ids) ? ids : [];
        setExtraBrainIds(clean);
        setEditExtraBrainIds(clean);
        setExtraBrainsLoaded(true);
      })
      .catch(() => setExtraBrainsLoaded(true));
  }, [editing, entry.id, extraBrainsLoaded]);

  const handleSave = async () => {
    setSaving(true);
    const tags = editTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const changes: Record<string, any> = {
      title: editTitle,
      content: editContent,
      type: editType,
      tags,
    };
    if (editBrainId && editBrainId !== entry.brain_id) changes.brain_id = editBrainId;
    // If the type changed, ensure the new type has an icon registered
    if (editType !== entry.type) {
      const icon = pickDefaultIcon(editType);
      onTypeIconChange?.(editType, icon);
    }
    await onUpdate?.(entry.id, changes);

    // Sync extra brain assignments (entry_brains junction)
    if (extraBrainsLoaded) {
      const prevSet = new Set(extraBrainIds);
      const nextSet = new Set(editExtraBrainIds);
      const toAdd = [...nextSet].filter((id) => !prevSet.has(id));
      const toRemove = [...prevSet].filter((id) => !nextSet.has(id));
      await Promise.all([
        ...toAdd.map((brain_id) =>
          authFetch("/api/entry-brains", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entry_id: entry.id, brain_id }),
          }).catch(() => {}),
        ),
        ...toRemove.map((brain_id) =>
          authFetch(`/api/entry-brains?entry_id=${encodeURIComponent(entry.id)}&brain_id=${encodeURIComponent(brain_id)}`, {
            method: "DELETE",
          }).catch(() => {}),
        ),
      ]);
      // Update local snapshot so subsequent saves diff correctly
      setExtraBrainIds([...nextSet]);
    }

    setSaving(false);
    setEditing(false);
  };

  const handleShare = async () => {
    const phone = extractPhone(entry);
    const text = [
      entry.title,
      entry.content,
      phone ? `📞 ${phone}` : null,
      Object.entries(entry.metadata || {})
        .filter(([k]) => !["category", "workspace"].includes(k))
        .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
        .join("\n") || null,
      "— from OpenBrain",
    ]
      .filter(Boolean)
      .join("\n");

    if (navigator.share) {
      try {
        await navigator.share({ title: entry.title, text });
      } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      setShareMsg("Copied to clipboard");
      setTimeout(() => setShareMsg(null), 2500);
    }
  };

  const phone = extractPhone(entry);
  const isSupplier = entry.tags?.includes("supplier") || entry.metadata?.category === "supplier";

  // Build quick actions for this entry type
  const quickActions = [];

  if (isSupplier || entry.type === "contact" || entry.type === "person") {
    if (phone) {
      quickActions.push(
        <a key="call" href={`tel:${phone}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all press-scale" style={{ background: "#262626", border: "1px solid rgba(72,72,71,0.2)", color: "#adaaaa" }}>
          📞 Call
        </a>,
      );
      quickActions.push(
        <a key="wa" href={toWaUrl(phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all press-scale" style={{ background: "#262626", border: "1px solid rgba(72,72,71,0.2)", color: "#adaaaa" }}>
          💬 WhatsApp
        </a>,
      );
    }
    if (isSupplier && onReorder) {
      quickActions.push(
        <button key="reorder" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all press-scale" style={{ background: "#262626", border: "1px solid rgba(72,72,71,0.2)", color: "#adaaaa" }} onClick={() => onReorder(entry)}>
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
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all press-scale"
          style={{ background: "linear-gradient(135deg, #72eff5, #1fb1b7)", color: "#002829" }}
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
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all press-scale"
        style={{ background: "#262626", border: "1px solid rgba(72,72,71,0.2)", color: "#adaaaa" }}
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
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all press-scale"
        style={{ background: "#262626", border: "1px solid rgba(72,72,71,0.2)", color: "#adaaaa" }}
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
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all press-scale"
          style={{ background: "linear-gradient(135deg, #72eff5, #1fb1b7)", color: "#002829" }}
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
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all press-scale"
          style={{ background: "#262626", border: "1px solid rgba(72,72,71,0.2)", color: "#adaaaa" }}
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
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all press-scale"
        style={{ background: "#262626", border: "1px solid rgba(72,72,71,0.2)", color: "#adaaaa" }}
        onClick={() => onReorder({ ...entry, _renewalMode: true })}
      >
        🔔 Set renewal reminder
      </button>,
    );
  }

  if (isSecret) {
    if (secretRevealed) {
      quickActions.push(
        <button
          key="copy-secret"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all press-scale"
          style={{ background: "#262626", border: "1px solid rgba(72,72,71,0.2)", color: "#adaaaa" }}
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
        <button key="hide-secret" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all press-scale" style={{ background: "#262626", border: "1px solid rgba(72,72,71,0.2)", color: "#adaaaa" }} onClick={() => setSecretRevealed(false)}>
          👁 Hide
        </button>,
      );
    }
  }

  // Share always available (but not for secret entries)
  if (!isSecret)
    quickActions.push(
      <button key="share" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all press-scale" style={{ background: "#262626", border: "1px solid rgba(72,72,71,0.2)", color: "#adaaaa" }} onClick={handleShare}>
        📤 Share
      </button>,
    );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-title"
      className="fixed inset-0 z-50 flex items-end lg:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", paddingBottom: "calc(96px + env(safe-area-inset-bottom))" }}
      onClick={editing ? undefined : onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-t-2xl lg:rounded-2xl border flex flex-col"
        style={{
          background: "#1a1919",
          borderColor: "rgba(72,72,71,0.2)",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5), 0 0 20px rgba(114,239,245,0.05)",
          animation: "zoom-in-95 0.2s ease-out",
          // Cap height to the actual available space so the header is never pushed above viewport.
          // 96px = nav bar clearance; subtract safe-area so the header stays fully in view.
          maxHeight: "calc(100vh - 96px - env(safe-area-inset-bottom) - env(safe-area-inset-top))",
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {/* Header — always visible, never scrolls away */}
        <div className="flex items-start justify-between flex-shrink-0 px-5 pt-5 pb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-lg">{cfg.i}</span>
              <span
                className="text-[10px] uppercase tracking-widest font-semibold px-2.5 py-0.5 rounded-full"
                style={{ background: "rgba(114,239,245,0.1)", color: "#72eff5" }}
              >
                {editType}
              </span>
            </div>
            {!editing && (
              <h2
                id="detail-modal-title"
                className="text-lg font-bold text-on-surface truncate"
                style={{ fontFamily: "'Manrope', sans-serif" }}
              >
                {editTitle}
              </h2>
            )}
          </div>
          <div className="flex items-center gap-2 ml-3 flex-shrink-0">
            {!editing && canWrite && onDelete && (
              <button
                className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all press-scale"
                style={{
                  background: confirmingDelete ? "rgba(220,38,38,0.15)" : "rgba(220,38,38,0.08)",
                  color: confirmingDelete ? "#fca5a5" : "#ef4444",
                  border: "1px solid rgba(220,38,38,0.2)",
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
                className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all press-scale"
                style={{
                  border: "1px solid rgba(72,72,71,0.2)",
                  color: "#adaaaa",
                }}
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
            )}
            {!canWrite && (
              <span className="text-xs text-on-surface-variant/60">🔒 View only</span>
            )}
            <button
              aria-label="Close"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all press-scale"
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
          style={{ overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        >

        {/* Edit form */}
        {editing ? (
          <div className="space-y-4 mt-2">
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "#777" }}>
                Title
              </label>
              <input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-on-surface text-sm min-h-[44px] transition-all focus:outline-none"
                style={{
                  background: "#262626",
                  border: "1px solid rgba(72,72,71,0.20)",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(114,239,245,0.6)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(114,239,245,0.08)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(72,72,71,0.20)"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "#777" }}>
                Type
              </label>
              {/* Free-form type input — AI can use any label; datalist shows known types */}
              <datalist id="entry-types-list">
                {Array.from(new Set([
                  ...entries.map((e) => e.type).filter(Boolean),
                  "note", "person", "place", "idea", "contact",
                  "document", "reminder", "decision", "secret",
                ])).map((typ) => <option key={typ} value={typ} />)}
              </datalist>
              <input
                type="text"
                list="entry-types-list"
                value={editType}
                onChange={(e) => setEditType(e.target.value.toLowerCase().trim())}
                placeholder="e.g. recipe, supplier, director…"
                className="w-full px-4 py-3 rounded-xl text-on-surface text-sm min-h-[44px] transition-all focus:outline-none"
                style={{
                  background: "#262626",
                  border: "1px solid rgba(72,72,71,0.20)",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(114,239,245,0.6)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(114,239,245,0.08)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(72,72,71,0.20)"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "#777" }}>
                Content
              </label>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 rounded-xl text-on-surface text-sm transition-all focus:outline-none resize-y"
                style={{
                  background: "#262626",
                  border: "1px solid rgba(72,72,71,0.20)",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(114,239,245,0.6)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(114,239,245,0.08)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(72,72,71,0.20)"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "#777" }}>
                Tags{" "}
                <span className="normal-case text-on-surface-variant/50">(comma separated)</span>
              </label>
              <input
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="tag1, tag2, tag3"
                className="w-full px-4 py-3 rounded-xl text-on-surface placeholder:text-on-surface-variant/40 text-sm min-h-[44px] transition-all focus:outline-none"
                style={{
                  background: "#262626",
                  border: "1px solid rgba(72,72,71,0.20)",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(114,239,245,0.6)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(114,239,245,0.08)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(72,72,71,0.20)"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>
            {brains.length > 1 && (
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "#777" }}>
                  Brains <span className="normal-case tracking-normal text-on-surface-variant/50">(tap to add/remove)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {brains.map((b) => {
                    const emoji = b.type === "family" ? "🏠" : b.type === "business" ? "🏪" : "🧠";
                    const isPrimary = editBrainId === b.id;
                    const isExtra = editExtraBrainIds.includes(b.id);
                    const isActive = isPrimary || isExtra;
                    return (
                      <button
                        key={b.id}
                        aria-label={`${isActive ? "Remove from" : "Add to"} ${b.name}`}
                        aria-pressed={isActive}
                        className="px-3 py-2 rounded-xl text-xs font-semibold transition-all press-scale flex items-center gap-1.5"
                        style={{
                          background: isPrimary
                            ? "rgba(114,239,245,0.12)"
                            : isExtra
                              ? "rgba(213,117,255,0.10)"
                              : "#262626",
                          border: isPrimary
                            ? "1px solid rgba(114,239,245,0.45)"
                            : isExtra
                              ? "1px solid rgba(213,117,255,0.35)"
                              : "1px solid rgba(72,72,71,0.2)",
                          color: isPrimary ? "#72eff5" : isExtra ? "#d575ff" : "#adaaaa",
                        }}
                        onClick={() => {
                          if (isPrimary) {
                            // Can't deselect primary — switch primary to another already-selected brain
                            // or do nothing (always need a primary)
                            return;
                          }
                          if (isExtra) {
                            setEditExtraBrainIds((prev) => prev.filter((id) => id !== b.id));
                          } else {
                            setEditExtraBrainIds((prev) => [...prev, b.id]);
                          }
                        }}
                      >
                        {emoji} {b.name}
                        {isPrimary && <span className="text-[9px] opacity-60">primary</span>}
                        {isExtra && <span className="text-[9px] opacity-60">✓</span>}
                      </button>
                    );
                  })}
                </div>
                {!extraBrainsLoaded && editing && (
                  <p className="text-[10px] mt-1.5" style={{ color: "#555" }}>Loading brain assignments…</p>
                )}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface transition-all press-scale"
                style={{ border: "1px solid rgba(72,72,71,0.20)" }}
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button
                className="flex-[2] py-3 rounded-xl text-sm font-bold press-scale transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: saving || !editTitle.trim() ? "#262626" : "linear-gradient(135deg, #72eff5, #1fb1b7)",
                  color: saving || !editTitle.trim() ? "#777575" : "#002829",
                  fontFamily: "'Manrope', sans-serif",
                  boxShadow: !saving && editTitle.trim() ? "0 4px 24px rgba(114,239,245,0.20)" : "none",
                }}
                onClick={handleSave}
                disabled={saving || !editTitle.trim()}
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 mt-1">
            {isSecret && !secretRevealed ? (
              <div className="flex flex-col items-center text-center py-8 gap-3">
                <div className="text-4xl">{vaultUnlocked ? "🔐" : "🔒"}</div>
                <p className="text-sm text-on-surface-variant">
                  {vaultUnlocked
                    ? "This entry is end-to-end encrypted"
                    : "Unlock your Vault to view this secret"}
                </p>
                {vaultUnlocked ? (
                  <button
                    className="mt-2 px-5 py-2.5 rounded-xl text-sm font-bold press-scale transition-all"
                    style={{
                      background: "linear-gradient(135deg, #72eff5, #1fb1b7)",
                      color: "#002829",
                      boxShadow: "0 4px 24px rgba(114,239,245,0.20)",
                    }}
                    onClick={() => setSecretRevealed(true)}
                  >
                    Reveal content
                  </button>
                ) : (
                  <p className="text-xs text-on-surface-variant/50 mt-1">
                    Go to the Vault tab and enter your passphrase
                  </p>
                )}
              </div>
            ) : (
              <>
                <p className="text-sm text-on-surface/90 leading-relaxed whitespace-pre-wrap">{editContent}</p>
                {meta.length > 0 && (
                  <div
                    className="rounded-xl p-3 space-y-2"
                    style={{ background: "#262626" }}
                  >
                    {meta.map(([k, v]) => (
                      <div key={k} className="flex items-baseline gap-2 text-xs">
                        <span className="text-[10px] uppercase tracking-widest font-semibold flex-shrink-0" style={{ color: "#777" }}>
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
                        style={{ background: "rgba(114,239,245,0.08)", color: "#72eff5" }}
                      >
                        {tag}
                      </span>
                    ))}
                </div>
              </div>
            )}
            {related.length > 0 && (
              <div className="pt-1">
                <p className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: "#777" }}>
                  Connections
                </p>
                {related.map(
                  (r, i) =>
                    r.other && (
                      <div
                        key={i}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1.5 text-xs"
                        style={{ background: "#262626" }}
                      >
                        <span>{resolveIcon(r.other.type, typeIcons)}</span>
                        <span className="text-on-surface-variant/50">{r.dir}</span>
                        <span className="text-on-surface flex-1">{r.other.title}</span>
                        <span className="text-[10px] uppercase tracking-widest text-on-surface-variant/50">{r.rel}</span>
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
            style={{ borderTop: "1px solid rgba(72,72,71,0.15)" }}
          >
            <div className="flex flex-wrap gap-2">{quickActions}</div>
            {shareMsg && (
              <p className="mt-2 text-xs text-center" style={{ color: "#72eff5" }}>
                {shareMsg}
              </p>
            )}
          </div>
        )}

        </div>{/* end scrollable body */}
      </div>
    </div>
  );
}
