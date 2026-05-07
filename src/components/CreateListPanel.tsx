/**
 * Create-list panel — modal for creating a new list with optional initial
 * items. Two import paths:
 *   - Pasted text (deterministic line-based parser, no AI)
 *   - Uploaded file (PDF / image / docx / xlsx / csv / txt → AI extraction
 *     into title + optional description pairs)
 *
 * Submission:
 *  1. POST /api/capture with type="list", title, content, metadata.items=[...]
 *  2. Caller (ListsView) refreshes the entries cache + drills into the new list
 *
 * Per CLAUDE.md design philosophy: no native confirm/alert. All controls
 * use the project's design tokens; modal lives behind Radix Dialog so focus
 * trap + scroll lock + Escape come for free.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "./ui/button";
import { authFetch } from "../lib/authFetch";
import { getEmbedHeaders } from "../lib/aiSettings";
import { parseListText, MAX_ITEMS_PER_PARSE, type ListItem } from "../lib/listParser";
import { showToast } from "../lib/notifications";
import type { Entry } from "../types";

interface CreateListPanelProps {
  brainId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (entry: Entry) => void;
}

// Hard cap mirrored from the server. Server enforces ~24 MB on the
// base64 payload (~32 MB raw); we clamp at 16 MB raw to leave headroom
// for the b64 inflation (33%) and JSON envelope.
const MAX_FILE_BYTES = 16 * 1024 * 1024;

const ALLOWED_FILE_EXTENSIONS =
  ".pdf,.txt,.csv,.md,.html,.docx,.xlsx,.json,.jpg,.jpeg,.png,.webp,.heic,.heif";

function genItemId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `lst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function readFileAsBase64(
  file: File,
): Promise<{ data: string; mimeType: string; filename: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("File read returned non-string"));
        return;
      }
      // Strip the data: URL prefix.
      const commaIdx = result.indexOf(",");
      if (commaIdx === -1) {
        reject(new Error("Malformed data URL"));
        return;
      }
      resolve({
        data: result.slice(commaIdx + 1),
        mimeType: file.type || "application/octet-stream",
        filename: file.name,
      });
    };
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

export default function CreateListPanel({
  brainId,
  open,
  onClose,
  onCreated,
}: CreateListPanelProps) {
  const [name, setName] = useState("");
  const [pasted, setPasted] = useState("");
  // When the user uploads a file, extracted items take precedence over
  // pasted text. Cleared whenever the textarea is touched, so the user
  // can always fall back to manual paste.
  const [extractedItems, setExtractedItems] = useState<ListItem[] | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Effective items: extracted (from file) wins if present, else parsed
  // from the textarea live as the user types.
  const detectedItems = useMemo<ListItem[]>(() => {
    if (extractedItems && extractedItems.length > 0) return extractedItems;
    return parseListText(pasted);
  }, [extractedItems, pasted]);

  useEffect(() => {
    if (open) {
      setName("");
      setPasted("");
      setExtractedItems(null);
      setExtracting(false);
      setSubmitting(false);
      // Defer focus until Dialog mounts.
      setTimeout(() => nameRef.current?.focus(), 30);
    }
  }, [open]);

  async function handleFileSelected(file: File | null) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      showToast(
        `File too large — keep it under ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB`,
        "error",
      );
      return;
    }
    setExtracting(true);
    try {
      const { data, mimeType, filename } = await readFileAsBase64(file);
      const res = await authFetch("/api/llm?action=extract-list-from-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileData: data, mimeType, filename }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg =
          typeof errBody?.message === "string"
            ? errBody.message
            : typeof errBody?.error === "string"
              ? errBody.error
              : `Extraction failed (${res.status})`;
        showToast(msg, "error");
        return;
      }
      const data2: { items?: Array<{ title?: string; description?: string }> } = await res
        .json()
        .catch(() => ({}));
      const incoming = Array.isArray(data2.items) ? data2.items : [];
      if (incoming.length === 0) {
        showToast("No list found in that file", "info");
        return;
      }
      const items: ListItem[] = incoming
        .map((it, idx) => ({
          id: genItemId(),
          title: typeof it.title === "string" ? it.title.trim().slice(0, 200) : "",
          description:
            typeof it.description === "string" && it.description.trim().length > 0
              ? it.description.trim().slice(0, 500)
              : undefined,
          completed: false,
          order: idx,
        }))
        .filter((it) => it.title.length > 0)
        .slice(0, MAX_ITEMS_PER_PARSE);
      setExtractedItems(items);
      setPasted("");
      // Auto-fill the name from the filename if the user hasn't typed
      // anything yet — strip extension and replace separators.
      if (!name.trim()) {
        const base = file.name
          .replace(/\.[^.]+$/, "")
          .replace(/[_-]+/g, " ")
          .trim();
        if (base) setName(base);
      }
      showToast(`${items.length} item${items.length === 1 ? "" : "s"} extracted`, "success");
    } catch (err) {
      console.error("[lists] file extract failed", err);
      showToast("Couldn't read that file — try a different format", "error");
    } finally {
      setExtracting(false);
      // Clear the input so re-uploading the same file fires onChange.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleCreate() {
    const trimmedName = name.trim();
    if (!trimmedName || submitting) return;
    setSubmitting(true);

    // Items are stamped with order 0..N; embed item titles + descriptions
    // into the parent's `content` so chat retrieval finds the list when
    // the user asks about any of its items (without per-item embedding).
    const items: ListItem[] = detectedItems.map((it, idx) => ({ ...it, order: idx }));
    const itemTitlesForChat = items
      .map((i) => (i.description ? `- ${i.title}: ${i.description}` : `- ${i.title}`))
      .join("\n");
    const content = items.length ? `${trimmedName}\n\n${itemTitlesForChat}` : trimmedName;

    try {
      const res = await authFetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getEmbedHeaders() || {}) },
        body: JSON.stringify({
          p_title: trimmedName,
          p_content: content,
          p_type: "list",
          p_metadata: {
            items,
            list_v: 1,
          },
          p_tags: [],
          p_brain_id: brainId,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        console.error("[lists] create failed", res.status, errBody);
        showToast("Couldn't create list — please try again", "error");
        setSubmitting(false);
        return;
      }

      const data = await res.json();
      const entry: Entry = {
        id: data?.id || `tmp_${Date.now()}`,
        title: trimmedName,
        content,
        type: "list",
        metadata: { items, list_v: 1 },
        tags: [],
        pinned: false,
        importance: 0,
        created_at: new Date().toISOString(),
      } as Entry;

      onCreated(entry);
      onClose();
    } catch (e) {
      console.error("[lists] create exception", e);
      showToast("Couldn't create list — please try again", "error");
      setSubmitting(false);
    }
  }

  const usingExtracted = !!(extractedItems && extractedItems.length > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        aria-label="New list"
        className="anim-scale-in-design max-h-[calc(100vh-32px)] !max-w-[min(560px,calc(100vw-32px))] overflow-y-auto !rounded-[18px]"
        style={{
          padding: "32px 32px 24px",
          background: "var(--surface-high)",
          borderColor: "var(--line-soft)",
          boxShadow: "var(--lift-3)",
        }}
      >
        <VisuallyHidden>
          <DialogTitle>New list</DialogTitle>
        </VisuallyHidden>

        <div
          className="f-serif"
          style={{
            fontSize: 24,
            fontWeight: 400,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
            marginBottom: 4,
          }}
        >
          new list
        </div>
        <div
          className="f-serif"
          style={{
            fontSize: 14,
            fontStyle: "italic",
            color: "var(--ink-soft)",
            marginBottom: 24,
          }}
        >
          give it a name. paste text or upload a file — pdf, image, doc, sheet, csv.
        </div>

        <label
          className="f-sans"
          style={{
            display: "block",
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--ink-faint)",
            marginBottom: 6,
          }}
        >
          name
        </label>
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleCreate();
            }
          }}
          placeholder="groceries…"
          className="f-serif"
          style={{
            width: "100%",
            fontSize: 17,
            padding: "8px 0 12px",
            color: "var(--ink)",
            background: "transparent",
            border: 0,
            borderBottom: "1px solid var(--line)",
            borderRadius: 0,
            outline: "none",
            marginBottom: 24,
          }}
        />

        <label
          className="f-sans"
          style={{
            display: "block",
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--ink-faint)",
            marginBottom: 6,
          }}
        >
          items (optional)
        </label>

        {usingExtracted ? (
          <div
            style={{
              padding: "10px 12px",
              border: "1px solid var(--line-soft)",
              borderRadius: 8,
              background: "var(--surface-low)",
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            {extractedItems!.slice(0, 50).map((it) => (
              <div key={it.id} style={{ paddingBottom: 8, marginBottom: 8 }}>
                <div
                  className="f-sans"
                  style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}
                >
                  {it.title}
                </div>
                {it.description && (
                  <div
                    className="f-serif"
                    style={{
                      fontSize: 12,
                      color: "var(--ink-soft)",
                      marginTop: 2,
                      lineHeight: 1.4,
                      fontStyle: "italic",
                    }}
                  >
                    {it.description}
                  </div>
                )}
              </div>
            ))}
            {extractedItems!.length > 50 && (
              <div
                className="f-sans"
                style={{ fontSize: 11, color: "var(--ink-faint)", fontStyle: "italic" }}
              >
                …and {extractedItems!.length - 50} more
              </div>
            )}
          </div>
        ) : (
          <textarea
            value={pasted}
            onChange={(e) => {
              setPasted(e.target.value);
              if (extractedItems) setExtractedItems(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleCreate();
              }
            }}
            placeholder={`milk\neggs\nbread`}
            rows={6}
            className="f-sans"
            style={{
              width: "100%",
              fontSize: 14,
              lineHeight: 1.5,
              resize: "vertical",
              padding: "10px 12px",
              color: "var(--ink)",
              background: "var(--surface-low)",
              border: "1px solid var(--line-soft)",
              borderRadius: 8,
              outline: "none",
              fontFamily: "var(--f-mono, ui-monospace, monospace)",
            }}
          />
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 8,
          }}
        >
          <div
            className="f-sans"
            style={{
              fontSize: 12,
              color: detectedItems.length ? "var(--ink-soft)" : "var(--ink-faint)",
              fontStyle: "italic",
            }}
          >
            {detectedItems.length === 0
              ? extracting
                ? "reading file…"
                : "no items yet — that's fine, you can add some after creating"
              : detectedItems.length === MAX_ITEMS_PER_PARSE
                ? `${MAX_ITEMS_PER_PARSE} items detected (max — extra lines truncated)`
                : `${detectedItems.length} item${detectedItems.length === 1 ? "" : "s"} detected${usingExtracted ? " · from file" : ""}`}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {usingExtracted && !extracting && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setExtractedItems(null)}
                disabled={submitting}
              >
                clear
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_FILE_EXTENSIONS}
              onChange={(e) => void handleFileSelected(e.target.files?.[0] ?? null)}
              style={{ display: "none" }}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={extracting || submitting}
            >
              {extracting ? "reading…" : "upload file"}
            </Button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 12,
            marginTop: 24,
            alignItems: "center",
          }}
        >
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || submitting || extracting}>
            {submitting ? "creating…" : "create list"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
