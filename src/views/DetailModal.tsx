import React, { useState, useEffect, useRef, useContext } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useEntryEdit } from "../hooks/useEntryEdit";
import { EntryQuickActions } from "../components/EntryQuickActions";
import { authFetch } from "../lib/authFetch";
import { trackFirstInsightViewed } from "../lib/events";
import { CANONICAL_TYPES } from "../types";
import type { Entry, Brain } from "../types";
import { BrainContext } from "../context/BrainContext";
import { isFeatureEnabled } from "../lib/featureFlags";
import {
  IMPORTANT_MEMORY_TYPES,
  IMPORTANT_MEMORY_TYPE_LABEL,
  generateMemoryKey,
  type ImportantMemoryType,
} from "../lib/importantMemory";
import { useAdminDevMode } from "../hooks/useAdminDevMode";
import MoveToBrainModal from "../components/MoveToBrainModal";
import ShareToBrainsModal from "../components/ShareToBrainsModal";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";

// ── Metadata highlights ───────────────────────────────────────────────────────

const META_PRIORITY: { key: string; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "contact_name", label: "Contact" },
  { key: "amount", label: "Amount" },
  { key: "price", label: "Price" },
  { key: "account_number", label: "Account" },
  { key: "reference_number", label: "Reference" },
  { key: "reference", label: "Reference" },
  { key: "invoice_number", label: "Invoice" },
  { key: "due_date", label: "Due date" },
  { key: "deadline", label: "Deadline" },
  { key: "expiry_date", label: "Expires" },
  { key: "renewal_date", label: "Renews" },
  { key: "event_date", label: "Date" },
  { key: "date", label: "Date" },
  { key: "cellphone", label: "Cell" },
  { key: "mobile", label: "Cell" },
  { key: "phone", label: "Phone" },
  { key: "tel", label: "Phone" },
  { key: "telephone", label: "Phone" },
  { key: "landline", label: "Landline" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "wa", label: "WhatsApp" },
  { key: "email", label: "Email" },
  { key: "address", label: "Address" },
  { key: "id_number", label: "ID Number" },
  { key: "national_id", label: "ID Number" },
  { key: "url", label: "Link" },
  { key: "status", label: "Status" },
];

const DATE_KEYS = new Set([
  "due_date",
  "deadline",
  "expiry_date",
  "renewal_date",
  "event_date",
  "date",
]);

function safeUrl(url: string): string {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:" ? url : "#";
  } catch {
    return "#";
  }
}

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

function pickTopMetaFields(
  meta: Record<string, unknown>,
): { label: string; value: string; key: string }[] {
  const result: { label: string; value: string; key: string }[] = [];
  const usedLabels = new Set<string>();

  for (const { key, label } of META_PRIORITY) {
    if (result.length >= 8) break;
    if (usedLabels.has(label)) continue;
    const v = meta[key];
    if (v == null) continue;
    const str = String(v).trim();
    if (!str || str === "null" || str === "undefined" || str === "0") continue;
    result.push({ label, value: fmtMetaValue(key, str), key });
    usedLabels.add(label);
  }

  return result;
}

interface DetailModalProps {
  entry: Entry;
  onClose: () => void;
  onDelete?: (id: string) => void | Promise<void>;
  onUpdate?: (id: string, changes: Partial<Entry>) => Promise<void>;
  onReorder?: (entry: Entry) => void;
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

  // Funnel — fire once per device when the user opens an entry that has
  // any AI enrichment surfaced (insight, concepts, persona). Empty entries
  // don't count: the goal is to count "user saw the AI value", not "user
  // opened any entry". Gated to first-time-only by trackFirstInsightViewed.
  useEffect(() => {
    const enrichment = entry.metadata?.enrichment as
      | { has_insight?: boolean; concepts_count?: number }
      | undefined;
    const hasInsight = !!enrichment?.has_insight;
    const hasConcepts = (enrichment?.concepts_count ?? 0) > 0;
    if (hasInsight || hasConcepts) {
      trackFirstInsightViewed({ entry_id: entry.id });
    }
  }, [entry.id, entry.metadata?.enrichment]);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [movingBrain, setMovingBrain] = useState(false);
  const [sharingBrains, setSharingBrains] = useState(false);
  // Read BrainContext directly (not via useBrain) so DetailModal can render
  // outside a provider in tests. Multi-brain UI only appears when both the
  // feature flag is on AND the context is available with >1 brain.
  const brainCtx = useContext(BrainContext);
  const activeBrain = brainCtx?.activeBrain ?? null;
  const ctxBrains = brainCtx?.brains ?? [];
  const refreshBrains = brainCtx?.refresh;
  const { adminFlags } = useAdminDevMode();
  const showMoveBrain =
    isFeatureEnabled("multiBrain", adminFlags) && !!brainCtx && ctxBrains.length > 1;
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(entry.title);
  const [editContent, setEditContent] = useState(entry.content ?? "");
  const [editType, setEditType] = useState<string>(entry.type);
  const [editTags] = useState((entry.tags || []).join(", "));
  const [secretRevealed, setSecretRevealed] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [aiMsg, setAiMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const importantMemoriesEnabled = false;
  const [keeping, setKeeping] = useState(false);
  const [keepType, setKeepType] = useState<ImportantMemoryType>("fact");
  const [keepTitle, setKeepTitle] = useState(entry.title);
  const [keepSummary, setKeepSummary] = useState((entry.content ?? "").trim().slice(0, 500));
  const [keepBusy, setKeepBusy] = useState(false);
  const [keepMsg, setKeepMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleKeepSave() {
    const brainId = entry.brain_id ?? activeBrain?.id;
    if (!brainId) {
      setKeepMsg({ text: "No active brain", ok: false });
      return;
    }
    if (!keepTitle.trim() || !keepSummary.trim()) {
      setKeepMsg({ text: "Title and summary required", ok: false });
      return;
    }
    setKeepBusy(true);
    setKeepMsg(null);
    try {
      const memory_key = generateMemoryKey(keepType, keepTitle);
      const res = await authFetch("/api/important-memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brain_id: brainId,
          memory_key,
          title: keepTitle.trim(),
          summary: keepSummary.trim(),
          memory_type: keepType,
          source_entry_ids: [entry.id],
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setKeepMsg({ text: detail.error ?? "Failed", ok: false });
      } else {
        setKeepMsg({ text: "Kept ✓", ok: true });
        setTimeout(() => {
          setKeeping(false);
          setKeepMsg(null);
        }, 1200);
      }
    } catch (e) {
      setKeepMsg({ text: e instanceof Error ? e.message : "Failed", ok: false });
    }
    setKeepBusy(false);
  }

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
        const errData: { error?: string } = await res.json().catch(() => ({}));
        setAiMsg({ text: errData?.error || `HTTP ${res.status}`, ok: false });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      setAiMsg({ text: message, ok: false });
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
  const isPinned = !!entry.pinned;
  const isContact = entry.type === "contact" || entry.type === "person";
  const isGmailEntry = entry.type === "gmail-flag" || entry.metadata?.source === "gmail";

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

  // Body scroll lock + Escape handling are owned by Radix Dialog now.
  // The custom escape behaviour (Escape exits edit mode first, second
  // Escape closes the modal) lives in `onEscapeKeyDown` on Dialog.Content
  // below. iOS body-scroll-lock is handled by Radix's Portal mounting
  // a focus-trap that also locks scroll via overflow:hidden + a body
  // padding-right shim — works on iOS because the dialog overlay is
  // position:fixed so the page beneath cannot scroll regardless.

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50"
          style={{ background: "var(--color-scrim)" }}
        />
        <DialogPrimitive.Content
          aria-modal="true"
          aria-labelledby="detail-modal-title"
          onEscapeKeyDown={(e) => {
            // Edit-aware escape: first Escape exits edit mode, second
            // Escape closes the dialog. preventDefault stops Radix from
            // closing while editing.
            if (editing) {
              e.preventDefault();
              setEditing(false);
            }
          }}
          onPointerDownOutside={(e) => {
            // Backdrop click while editing should not close — matches
            // the pre-migration onClick={editing ? undefined : onClose}.
            if (editing) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (editing) e.preventDefault();
          }}
          // Tailwind v4 needs underscores inside arbitrary calc() values
          // (`calc(100%_-_12px)`); the prior `calc(100%-12px)` was invalid
          // CSS and Tailwind dropped the rule, so the modal lost its width
          // cap and grew to its content's intrinsic width — pushing the
          // close button off-screen on narrow viewports. width + bottom
          // now ride on inline style to sidestep the v4 tokenizer; the
          // translate classes still drive centering so desktop's vertical
          // centering keeps composing correctly.
          className="fixed left-1/2 z-50 flex max-w-[720px] -translate-x-1/2 flex-col lg:top-1/2 lg:bottom-auto lg:-translate-y-1/2"
          style={{
            background: "var(--surface-high)",
            border: "1px solid var(--line-soft)",
            borderRadius: 18,
            boxShadow: "var(--lift-3)",
            animation: "design-scaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
            width: "calc(100% - 12px)",
            bottom: "calc(96px + env(safe-area-inset-bottom))",
            maxHeight:
              "calc(100dvh - 96px - env(safe-area-inset-bottom) - env(safe-area-inset-top))",
          }}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {/* Visually-hidden title + description — Radix Dialog requires
              both for screen-reader accessibility. This sr-only title owns
              the `detail-modal-title` id so aria-labelledby stays valid
              even in edit mode (when the visible h2 below is unmounted). */}
          <DialogPrimitive.Title id="detail-modal-title" className="sr-only">
            {entry.title || "Entry"}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Entry details
          </DialogPrimitive.Description>

          {/* Header — bell + TYPE · time on left, action icons on right.
              position:sticky belt + flex-shrink:0 braces — on desktop the
              flex layout alone keeps it pinned, but on mobile (anchored
              by the modal's bottom: env(safe-area-inset-bottom) calc) iOS
              Safari occasionally lets the inner scroll bleed past the
              flex bounds. Sticky guarantees the header stays at the top
              of the visible modal region regardless of which container
              is doing the scrolling. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              // Tightened from 14px 18px 14px 24px / gap:10. The wider
              // padding + gap together stole 32px of horizontal real
              // estate from the action toolbar — on a 378px modal the
              // close button got pushed off-screen as more icons were
              // added (Pin, Lock, Move, Share, Edit, Close = 6 buttons).
              // Compact 12px padding + gap:4 buys back ~50px so the
              // toolbar fits without hiding actions or scrolling.
              padding: "12px 12px",
              borderBottom: "1px solid var(--line-soft)",
              gap: 4,
              flexShrink: 0,
              position: "sticky",
              top: 0,
              zIndex: 2,
              background: "var(--surface-high)",
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-faint)" }}
            >
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
                // Some legacy rows have camelCase `createdAt` instead of the
                // canonical snake_case `created_at` — accept either.
                const iso = entry.created_at || (entry as Entry & { createdAt?: string }).createdAt;
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

            {/* Action icons (Pin, Vault, Move, Share, Edit) moved to the
                modal's bottom nav — see the <div> with role="toolbar"
                near the bottom-strip section. The top header now hosts
                only the type chip, time, view-only badge, and the close
                X so the close button is always reachable on narrow
                viewports. */}

            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              onClick={editing ? () => setEditing(false) : onClose}
              style={{ color: "var(--ink-faint)" }}
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
            </Button>
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
                <div>
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
                          style={{
                            color: aiMsg.ok ? "var(--color-primary)" : "var(--color-error)",
                          }}
                        >
                          {aiMsg.text}
                        </span>
                      )}
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={suggestType}
                        disabled={aiTyping}
                        style={{
                          background: "var(--color-primary-container)",
                          color: "var(--color-primary)",
                        }}
                      >
                        {aiTyping ? "Thinking…" : "✦ AI pick"}
                      </Button>
                    </div>
                  </div>
                  <Select value={editType} onValueChange={setEditType}>
                    <SelectTrigger
                      className="min-h-[44px] w-full rounded-xl px-4 py-3 text-sm"
                      style={{
                        background: "var(--color-surface-container)",
                        borderColor: "var(--color-outline-variant)",
                        color: "var(--color-on-surface)",
                      }}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CANONICAL_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Button
                    variant="outline"
                    size="lg"
                    className="flex-1"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="lg"
                    className="flex-[2]"
                    onClick={() =>
                      handleSave({ editTitle, editContent, editType, editTags }).then(() =>
                        setEditing(false),
                      )
                    }
                    disabled={saving || !editTitle.trim()}
                  >
                    {saving ? "Saving..." : "Save changes"}
                  </Button>
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
                      <Button onClick={() => setSecretRevealed(true)}>Reveal content</Button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* List type — title-then-bullets, no checkboxes. Items
                        live in metadata.items[] (list_v=1 schema written by
                        CaptureSheet.buildListPayload). Falls through to the
                        standard <p> body when items are absent for any reason
                        so legacy lists without metadata.items still render. */}
                    {entry.type === "list" &&
                    Array.isArray((entry.metadata as Record<string, unknown>)?.items) &&
                    ((entry.metadata as Record<string, unknown>).items as unknown[]).length > 0 ? (
                      <ul
                        className="f-serif"
                        style={{
                          margin: 0,
                          padding: 0,
                          listStyle: "none",
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        {(
                          (entry.metadata as Record<string, unknown>).items as Array<{
                            title?: string;
                          }>
                        ).map((it, i) => (
                          <li
                            key={i}
                            style={{
                              fontSize: 18,
                              lineHeight: 1.55,
                              color: "var(--ink)",
                              paddingLeft: 18,
                              position: "relative",
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                            }}
                          >
                            <span
                              aria-hidden="true"
                              style={{
                                position: "absolute",
                                left: 0,
                                top: "0.55em",
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: "var(--ember)",
                                opacity: 0.65,
                              }}
                            />
                            {typeof it?.title === "string" ? it.title : String(it)}
                          </li>
                        ))}
                      </ul>
                    ) : entry.type === "article" ? (
                      /* Article reading view — byline strip (site + source
                         link) above the body. Typography bumped to 17/1.75 and
                         max-width capped via the parent surface so reading
                         lines stay comfortable. */
                      <>
                        {(() => {
                          const meta = entry.metadata as Record<string, unknown> | undefined;
                          const url = typeof meta?.url === "string" ? meta.url : "";
                          const site = typeof meta?.site === "string" ? meta.site : "";
                          if (!url && !site) return null;
                          return (
                            <div
                              className="f-sans"
                              style={{
                                fontSize: 12,
                                color: "var(--ink-faint)",
                                letterSpacing: "0.03em",
                                marginBottom: 12,
                                display: "flex",
                                gap: 10,
                                alignItems: "center",
                                flexWrap: "wrap",
                              }}
                            >
                              {site && <span>{site}</span>}
                              {url && (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  style={{
                                    color: "var(--ember)",
                                    textDecoration: "none",
                                  }}
                                >
                                  open source ↗
                                </a>
                              )}
                            </div>
                          );
                        })()}
                        <p
                          className="f-serif"
                          style={{
                            fontSize: 17,
                            lineHeight: 1.75,
                            color: "var(--ink)",
                            margin: 0,
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                            minWidth: 0,
                          }}
                        >
                          {showFullText
                            ? (editContent ?? "")
                            : (editContent ?? "").length > CONTENT_PREVIEW_LIMIT
                              ? (editContent ?? "").slice(0, CONTENT_PREVIEW_LIMIT) + "…"
                              : (editContent ?? "")}
                        </p>
                      </>
                    ) : (
                      /* Body — serif 18/1.65, the redesign's "reading surface".
                        overflowWrap: "anywhere" handles unbreakable tokens
                        like long URLs and the `*****…*` divider walls Gmail
                        statements love — without it pre-wrap preserves
                        newlines but the wall overflows horizontally and
                        drags subsequent lines off-screen. minWidth: 0 is the
                        flex-child escape hatch so this <p> can actually
                        shrink below its content's intrinsic width. */
                      (() => {
                        // Prefer the rich AI-generated summary for Gmail entries
                        // whose raw content is the thin scan-time placeholder
                        // ("see attached" / cluster-time body excerpt). Editing
                        // still bound to editContent so when the user clicks Edit
                        // they see the underlying source-of-truth, not the AI
                        // paraphrase. Same logic as EntryCard — kept in sync.
                        const meta = entry.metadata as Record<string, unknown> | undefined;
                        const isGmail = (meta?.source as string | undefined) === "gmail";
                        const aiSummary =
                          isGmail && typeof meta?.ai_summary === "string"
                            ? (meta.ai_summary as string).trim()
                            : "";
                        const aiInsight =
                          isGmail && typeof meta?.ai_insight === "string"
                            ? (meta.ai_insight as string).trim()
                            : "";
                        const raw = editContent ?? "";
                        const displayContent = editing
                          ? raw
                          : aiSummary && aiSummary.length >= raw.length / 2
                            ? aiSummary
                            : aiInsight && raw.length < 200 && aiInsight.length > raw.length
                              ? aiInsight
                              : raw;
                        const truncated =
                          !showFullText && displayContent.length > CONTENT_PREVIEW_LIMIT
                            ? displayContent.slice(0, CONTENT_PREVIEW_LIMIT) + "…"
                            : displayContent;
                        return (
                          <p
                            className="f-serif"
                            style={{
                              fontSize: 18,
                              lineHeight: 1.65,
                              color: "var(--ink)",
                              margin: 0,
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                              minWidth: 0,
                            }}
                          >
                            {truncated}
                          </p>
                        );
                      })()
                    )}
                    {(editContent || "").length > CONTENT_PREVIEW_LIMIT && (
                      <Button
                        variant="link"
                        size="xs"
                        className="self-start px-0"
                        onClick={() => setShowFullText((s) => !s)}
                      >
                        {showFullText ? "show less" : "show more"}
                      </Button>
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
                          <div className="micro" style={{ marginBottom: 10 }}>
                            Details
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            {fields.map(({ label, value, key }) => {
                              const isEmail = key === "email";
                              const isPhone =
                                key === "phone" || key === "cellphone" || key === "landline";
                              const isUrl = key === "url";
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
                                return (
                                  <a key={label} href={`mailto:${value}`} style={chipStyle}>
                                    {inner}
                                  </a>
                                );
                              if (isPhone)
                                return (
                                  <a key={label} href={`tel:${value}`} style={chipStyle}>
                                    {inner}
                                  </a>
                                );
                              if (isUrl)
                                return (
                                  <a
                                    key={label}
                                    href={safeUrl(value)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={chipStyle}
                                  >
                                    {inner}
                                  </a>
                                );
                              return (
                                <div key={label} style={chipStyle}>
                                  {inner}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Dropped attachments — surfaces files that lived alongside the
                      source note (Google Keep photos, etc.) but weren't uploaded.
                      Filenames stay so the user can find them in the source zip. */}
                    {(() => {
                      const meta = (entry.metadata || {}) as Record<string, unknown>;
                      const count =
                        typeof meta.attachments_dropped === "number" ? meta.attachments_dropped : 0;
                      const files = Array.isArray(meta.attachment_files)
                        ? (meta.attachment_files as unknown[]).filter(
                            (f): f is string => typeof f === "string",
                          )
                        : [];
                      if (count === 0 && files.length === 0) return null;
                      const source =
                        typeof meta.import_source === "string" ? meta.import_source : null;
                      return (
                        <div>
                          <div className="micro" style={{ marginBottom: 10 }}>
                            Attachments ({count || files.length})
                          </div>
                          <div
                            className="f-sans"
                            style={{
                              fontSize: 12,
                              color: "var(--ink-faint)",
                              padding: "10px 14px",
                              border: "1px solid var(--line-soft)",
                              borderRadius: 10,
                              background: "var(--surface)",
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                            }}
                          >
                            <span>
                              Stored alongside this entry in the original{" "}
                              {source === "google_keep" ? "Google Takeout" : "import"} archive. Not
                              uploaded to Everion.
                            </span>
                            {files.length > 0 && (
                              <ul
                                style={{
                                  margin: 0,
                                  padding: 0,
                                  listStyle: "none",
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: 6,
                                }}
                              >
                                {files.map((f) => (
                                  <li
                                    key={f}
                                    style={{
                                      padding: "4px 8px",
                                      borderRadius: 4,
                                      background: "var(--surface-low)",
                                      border: "1px solid var(--line-soft)",
                                      color: "var(--ink-soft)",
                                      fontSize: 11,
                                    }}
                                  >
                                    {f.split("/").pop() ?? f}
                                  </li>
                                ))}
                              </ul>
                            )}
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
                      // Concepts can live on metadata.concepts (canonical) or
                      // entry.concepts (legacy graph-extractor output that was
                      // written to the entry root before the metadata move).
                      const rawConcepts: unknown =
                        entry.metadata?.concepts ??
                        (entry as Entry & { concepts?: unknown }).concepts ??
                        [];
                      // Concepts shape: { label: string, entry_ids: string[] }[]
                      // (per stepConcepts in api/_lib/enrich.ts) OR a legacy
                      // string[]. Both must render. Previous code only allowed
                      // strings — newer object-shape concepts were silently
                      // dropped, so the chips never appeared on Gmail entries.
                      const concepts = Array.isArray(rawConcepts)
                        ? rawConcepts
                            .map((c) =>
                              typeof c === "string"
                                ? c
                                : typeof (c as { label?: unknown })?.label === "string"
                                  ? (c as { label: string }).label
                                  : null,
                            )
                            .filter((c): c is string => typeof c === "string" && c.length > 0)
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
                  <Accordion type="single" collapsible>
                    <AccordionItem value="full-content" className="border-b-0">
                      <AccordionTrigger
                        className="py-1 text-[10px] font-semibold tracking-widest uppercase hover:no-underline"
                        style={{ color: "var(--color-on-surface-variant)" }}
                      >
                        Full Content
                      </AccordionTrigger>
                      <AccordionContent className="pb-0">
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
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
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

          {/* Inline "Keep this" panel — slides in above the bottom strip */}
          {!editing && keeping && (
            <div
              style={{
                flexShrink: 0,
                padding: "16px 24px",
                borderTop: "1px solid var(--line-soft)",
                background: "var(--surface)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {IMPORTANT_MEMORY_TYPES.map((t) => {
                  const active = keepType === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setKeepType(t)}
                      className="press"
                      style={{
                        height: 28,
                        padding: "0 12px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        border: "1px solid",
                        borderColor: active ? "var(--ember)" : "var(--line-soft)",
                        background: active ? "var(--ember-wash)" : "var(--surface)",
                        color: active ? "var(--ember)" : "var(--ink-soft)",
                        cursor: "pointer",
                      }}
                    >
                      {IMPORTANT_MEMORY_TYPE_LABEL[t]}
                    </button>
                  );
                })}
              </div>
              <input
                value={keepTitle}
                onChange={(e) => setKeepTitle(e.target.value)}
                maxLength={200}
                placeholder="Title"
                className="f-serif"
                style={{
                  height: 36,
                  padding: "0 12px",
                  borderRadius: 10,
                  border: "1px solid var(--line-soft)",
                  background: "var(--surface)",
                  color: "var(--ink)",
                  fontSize: 15,
                  outline: "none",
                }}
              />
              <textarea
                value={keepSummary}
                onChange={(e) => setKeepSummary(e.target.value)}
                maxLength={1000}
                rows={2}
                placeholder="Summary — the fact Everion should trust"
                className="f-serif"
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid var(--line-soft)",
                  background: "var(--surface)",
                  color: "var(--ink)",
                  fontSize: 14,
                  lineHeight: 1.5,
                  resize: "vertical",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
              {keepMsg && (
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: keepMsg.ok ? "var(--moss)" : "var(--danger)",
                  }}
                >
                  {keepMsg.text}
                </p>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setKeeping(false);
                    setKeepMsg(null);
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={handleKeepSave} disabled={keepBusy}>
                  {keepBusy ? "Saving…" : "Keep"}
                </Button>
              </div>
            </div>
          )}

          {/* DetailModal bottom nav — universal entry actions (Pin, Vault,
              Move, Share, Edit). Moved here from the top header so the
              close X is always reachable on narrow viewports. Sits above
              the context strip (Save Contact / Ignore Email / Keep /
              Delete) so the destructive Delete button stays visually
              separated from these mostly-toggle actions. flex-shrink:0
              keeps it pinned to the modal frame even when the body
              content scrolls. */}
          {!editing && (canWrite || onUpdate) && (
            <div
              role="toolbar"
              aria-label="Entry actions"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-around",
                gap: 4,
                padding: "10px 12px",
                borderTop: "1px solid var(--line-soft)",
                background: "var(--surface-high)",
                flexShrink: 0,
              }}
            >
              {/* Pin */}
              {canWrite && onUpdate && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={isPinned ? "Unpin" : "Pin"}
                  title={isPinned ? "Unpin" : "Pin"}
                  onClick={() => onUpdate(entry.id, { pinned: !isPinned })}
                  style={{ color: isPinned ? "var(--ember)" : "var(--ink-faint)" }}
                >
                  <svg
                    width="18"
                    height="18"
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
                </Button>
              )}

              {/* Vault / lock toggle */}
              {canWrite && onUpdate && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={isSecret ? "Remove from vault" : "Add to vault"}
                  title={isSecret ? "Remove from vault" : "Add to vault"}
                  style={{ color: isSecret ? "var(--ember)" : "var(--ink-faint)" }}
                  onClick={() => onUpdate(entry.id, { type: isSecret ? "note" : "secret" })}
                >
                  <svg
                    width="18"
                    height="18"
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
                </Button>
              )}

              {/* Move to brain */}
              {canWrite && showMoveBrain && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move to brain"
                  title="Move to brain"
                  onClick={() => setMovingBrain(true)}
                  style={{ color: "var(--ink-faint)" }}
                >
                  <svg
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M3 12h13" />
                    <path d="m13 6 6 6-6 6" />
                    <rect x="20" y="4" width="2" height="16" rx="1" />
                  </svg>
                </Button>
              )}

              {/* Share with brains */}
              {canWrite && showMoveBrain && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Share with brains"
                  title="Share with brains"
                  onClick={() => setSharingBrains(true)}
                  style={{ color: "var(--ink-faint)" }}
                >
                  <svg
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
                  </svg>
                </Button>
              )}

              {/* Edit */}
              {canWrite && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Edit"
                  title="Edit"
                  onClick={() => setEditing(true)}
                  style={{ color: "var(--ink-faint)" }}
                >
                  <svg
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </Button>
              )}
            </div>
          )}

          {/* Minimal bottom strip — Keep this + Delete + Save to Contacts */}
          {!editing &&
            (isContact ||
              (canWrite && onDelete) ||
              isGmailEntry ||
              (canWrite && importantMemoriesEnabled && !isSecret)) && (
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={saveToContacts}
                    style={{ color: "var(--ink-soft)" }}
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
                  </Button>
                )}
                {!isContact &&
                !isGmailEntry &&
                canWrite &&
                importantMemoriesEnabled &&
                !isSecret ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setKeepTitle(entry.title);
                      setKeepSummary((entry.content ?? "").trim().slice(0, 500));
                      setKeepType("fact");
                      setKeepMsg(null);
                      setKeeping(true);
                    }}
                    style={{ color: "var(--ember)" }}
                    disabled={keeping}
                  >
                    ★ Keep this
                  </Button>
                ) : !isContact && !isGmailEntry ? (
                  <span />
                ) : null}
                {canWrite && onDelete && (
                  <Button
                    variant={confirmingDelete ? "destructive" : "ghost"}
                    size="sm"
                    style={
                      confirmingDelete
                        ? undefined
                        : { color: "var(--blood)", background: "transparent" }
                    }
                    onClick={async () => {
                      if (!confirmingDelete) {
                        setConfirmingDelete(true);
                        confirmTimerRef.current = setTimeout(
                          () => setConfirmingDelete(false),
                          3000,
                        );
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
                  </Button>
                )}
              </div>
            )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
      {movingBrain && activeBrain && (
        <MoveToBrainModal
          entry={entry}
          currentBrain={activeBrain}
          brains={ctxBrains}
          onClose={() => setMovingBrain(false)}
          onMoved={() => {
            setMovingBrain(false);
            refreshBrains?.()?.catch(() => {});
            onClose();
          }}
        />
      )}
      {sharingBrains && activeBrain && (
        <ShareToBrainsModal
          entry={entry}
          sourceBrain={activeBrain}
          brains={ctxBrains}
          onClose={() => setSharingBrains(false)}
        />
      )}
    </DialogPrimitive.Root>
  );
}
