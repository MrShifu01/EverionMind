import { useState, useRef, useEffect, useCallback } from "react";
import { callAI } from "../lib/ai";
import { authFetch } from "../lib/authFetch";
import { getEmbedHeaders } from "../lib/aiSettings";
import { PROMPTS } from "../config/prompts";
import type { Entry } from "../types";

interface ParsedEntry {
  title: string;
  content?: string;
  type?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  _raw?: string;
}

interface CaptureSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (entry: Entry) => void;
  brainId?: string;
  cryptoKey?: CryptoKey | null;
  isOnline?: boolean;
}

function PreviewModal({
  preview,
  onSave,
  onCancel,
}: {
  preview: ParsedEntry;
  onSave: (p: ParsedEntry) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(preview.title || "");
  const [tags, setTags] = useState((preview.tags || []).join(", "));
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap
  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();
    function trap(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }
    el.addEventListener("keydown", trap);
    return () => el.removeEventListener("keydown", trap);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "var(--color-scrim)" }}
      onClick={onCancel}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cs-preview-title"
        className="w-full max-w-md rounded-2xl border p-5"
        style={{ background: "var(--color-surface-container-low)", borderColor: "var(--color-outline-variant)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <span id="cs-preview-title" className="text-sm font-semibold text-on-surface" style={{ fontFamily: "'Lora', Georgia, serif" }}>
            Before saving
          </span>
          <button onClick={onCancel} aria-label="Close" className="text-on-surface-variant hover:text-on-surface text-lg transition-colors">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border px-3 py-2.5 text-sm text-on-surface bg-transparent outline-none focus:border-primary transition-colors"
              style={{ borderColor: "var(--color-outline-variant)" }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Tags</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="tag1, tag2"
              className="w-full rounded-xl border px-3 py-2.5 text-sm text-on-surface bg-transparent outline-none focus:border-primary transition-colors placeholder:text-on-surface-variant/40"
              style={{ borderColor: "var(--color-outline-variant)" }}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border text-sm text-on-surface-variant transition-colors hover:bg-surface-container"
            style={{ borderColor: "var(--color-outline-variant)" }}
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({
                ...preview,
                title: title.trim(),
                type: preview.type,
                tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
              })
            }
            disabled={!title.trim()}
            className="flex-[2] py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 press-scale"
            style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
          >
            Save to Everion
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CaptureSheet({
  isOpen,
  onClose,
  onCreated,
  brainId,
  isOnline = true,
}: CaptureSheetProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedEntry | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Auto-focus on open; reset on close
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => requestAnimationFrame(() => textareaRef.current?.focus()));
    } else {
      setText("");
      setStatus(null);
      setPreview(null);
    }
  }, [isOpen]);

  // Focus trap for sheet
  useEffect(() => {
    const el = sheetRef.current;
    if (!el || !isOpen) return;
    function trap(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const focusable = el!.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }
    el.addEventListener("keydown", trap);
    return () => el.removeEventListener("keydown", trap);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !preview) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose, preview]);

  const doSave = useCallback(
    async (parsed: ParsedEntry) => {
      setPreview(null);
      setLoading(true);
      setStatus("saving");
      try {
        const res = await authFetch("/api/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(getEmbedHeaders() || {}) },
          body: JSON.stringify({
            p_title: parsed.title,
            p_content: parsed.content || "",
            p_type: parsed.type || "note",
            p_metadata: parsed.metadata || {},
            p_tags: parsed.tags || [],
            p_brain_id: brainId,
          }),
        });
        if (res.ok) {
          const result = await res.json();
          const newEntry: Entry = {
            id: result?.id || Date.now().toString(),
            title: parsed.title,
            content: parsed.content || "",
            type: (parsed.type || "note") as Entry["type"],
            metadata: parsed.metadata || {},
            pinned: false,
            importance: 0,
            tags: parsed.tags || [],
            created_at: new Date().toISOString(),
          } as Entry;
          onCreated(newEntry);
          setStatus("saved");
          setTimeout(() => {
            setStatus(null);
            onClose();
          }, 700);
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
      setLoading(false);
    },
    [brainId, onCreated, onClose],
  );

  const capture = useCallback(async () => {
    if (!text.trim()) return;
    const input = text.trim();
    setText("");
    setLoading(true);
    setStatus("thinking");

    if (!isOnline) {
      // Save as raw note when offline
      await doSave({ title: input.slice(0, 60), content: input, type: "note", tags: [], metadata: {} });
      return;
    }

    try {
      const res = await callAI({
        system: PROMPTS.CAPTURE,
        max_tokens: 800,
        brainId,
        messages: [{ role: "user", content: input }],
      });
      const data = await res.json();
      let parsed: ParsedEntry = { title: "" };
      try {
        parsed = JSON.parse((data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim());
      } catch {}

      if (parsed.title) {
        setLoading(false);
        setStatus(null);
        setPreview({ ...parsed, _raw: input });
        return;
      }
      // Fallback: save raw
      await doSave({ title: input.slice(0, 60), content: input, type: "note", tags: [], metadata: {} });
    } catch {
      setStatus("error");
      setLoading(false);
      setText(input); // restore so user can retry or edit
    }
  }, [text, brainId, isOnline, doSave]);

  if (!isOpen) return null;

  const statusLabel: Record<string, string> = {
    thinking: "Parsing...",
    saving: "Saving...",
    saved: "Saved!",
    error: "Error — please try again",
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: "var(--color-scrim)" }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="New entry"
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl border-t px-5 pt-3 pb-10 lg:bottom-6 lg:left-1/2 lg:-translate-x-1/2 lg:right-auto lg:w-full lg:max-w-lg lg:rounded-3xl"
        style={{
          background: "var(--color-surface-container-low)",
          borderColor: "var(--color-outline-variant)",
          boxShadow: "var(--shadow-lg)",
          animation: "slide-in-from-bottom 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center mb-4">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--color-outline)" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2
            className="font-semibold text-on-surface"
            style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "1.125rem" }}
          >
            New Entry
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") capture();
          }}
          disabled={loading}
          placeholder="Capture a thought, paste a link, log anything..."
          rows={5}
          className="w-full bg-transparent text-on-surface placeholder:text-on-surface-variant/40 outline-none resize-none text-base leading-relaxed"
        />

        {/* Status */}
        {status && (
          <div className="flex items-center gap-2 mt-1 mb-2">
            <p
              className="text-xs"
              style={{ color: status === "error" ? "var(--color-error)" : status === "saved" ? "var(--color-secondary)" : "var(--color-primary)" }}
            >
              {statusLabel[status] ?? status}
            </p>
            {status === "error" && (
              <button
                onClick={capture}
                className="text-xs font-semibold underline press-scale"
                style={{ color: "var(--color-primary)" }}
              >
                Try again
              </button>
            )}
          </div>
        )}

        {/* Action row */}
        <div
          className="flex items-center justify-between pt-3 mt-1 border-t"
          style={{ borderColor: "var(--color-outline-variant)" }}
        >
          <p className="text-[11px] text-on-surface-variant/50">
            {text.trim() ? `${text.trim().length} chars` : "⌘↵ to save"}
          </p>

          <button
            onClick={capture}
            disabled={loading || !text.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-30 press-scale"
            style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
          >
            {loading ? (
              <span className="flex gap-1">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </span>
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>

      {/* Preview modal */}
      {preview && (
        <PreviewModal
          preview={preview}
          onSave={(p) => {
            setPreview(null);
            doSave(p);
          }}
          onCancel={() => {
            setPreview(null);
            setText(preview._raw || "");
          }}
        />
      )}
    </>
  );
}
