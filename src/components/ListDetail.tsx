/**
 * ListDetail — drill-in view for a single list entry.
 *
 * Operations on metadata.items[]:
 *   - add (single typed line OR multi-line paste, parsed via listParser)
 *   - toggle complete (checkbox)
 *   - edit title (inline)
 *   - reorder (↑↓ buttons; drag-drop is a v2 polish per spec-lists-v1.md)
 *   - delete (with inline confirm — no native confirm per CLAUDE.md)
 *
 * All mutations are optimistic at the React-state layer; PATCH lands via
 * /api/update-entry with a debounced flush so rapid checkbox-clicking
 * doesn't fire 30 round-trips. Failure → toast + revert via the
 * onUpdate callback (which re-syncs from the entries cache).
 */
import { useEffect, useRef, useState } from "react";
import { authFetch } from "../lib/authFetch";
import { showToast } from "../lib/notifications";
import { parseListText, type ListItem } from "../lib/listParser";
import { Button } from "./ui/button";
import type { Entry } from "../types";

interface ListDetailProps {
  entry: Entry;
  onBack: () => void;
  onUpdate: (updated: Entry) => void;
  onDeleteList: (entryId: string) => void;
}

function readItems(entry: Entry): ListItem[] {
  const raw = entry.metadata?.items;
  if (!Array.isArray(raw)) return [];
  return (raw as ListItem[]).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function rebuildContent(title: string, items: ListItem[]): string {
  // Title + optional description go into one chat-retrieval line per item
  // so the list parent's embedding picks up matches against either field.
  const titles = items
    .map((i) => (i.description ? `- ${i.title}: ${i.description}` : `- ${i.title}`))
    .join("\n");
  return items.length ? `${title}\n\n${titles}` : title;
}

function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `lst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function ListDetail({ entry, onBack, onUpdate, onDeleteList }: ListDetailProps) {
  const [items, setItems] = useState<ListItem[]>(() => readItems(entry));
  const [title, setTitle] = useState(entry.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [addText, setAddText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [confirmDeleteList, setConfirmDeleteList] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync if the parent re-fetches the entry. We intentionally only react
  // to identity (`entry.id`) and server-side updates (`entry.updated_at`);
  // the in-flight optimistic state we own locally would loop if `entry`
  // itself were a dep.
  useEffect(() => {
    setItems(readItems(entry));
    setTitle(entry.title);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entry deps narrowed deliberately to identity + server-update timestamp; full entry would loop.
  }, [entry.id, entry.updated_at]);

  // Debounced server flush — collects rapid mutations into one PATCH.
  function scheduleFlush(nextItems: ListItem[], nextTitle: string) {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      void flush(nextItems, nextTitle);
    }, 350);
  }

  async function flush(nextItems: ListItem[], nextTitle: string) {
    const newContent = rebuildContent(nextTitle, nextItems);
    try {
      const res = await authFetch("/api/update-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: entry.id,
          title: nextTitle,
          content: newContent,
          metadata: { ...(entry.metadata || {}), items: nextItems, list_v: 1 },
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[lists] update failed", res.status, body);
        showToast("Couldn't save changes — try again", "error");
        return;
      }
      const next: Entry = {
        ...entry,
        title: nextTitle,
        content: newContent,
        metadata: { ...(entry.metadata || {}), items: nextItems, list_v: 1 },
        updated_at: new Date().toISOString(),
      };
      onUpdate(next);
    } catch (e) {
      console.error("[lists] update exception", e);
      showToast("Couldn't save changes — try again", "error");
    }
  }

  // ── Mutations (optimistic, then debounced flush) ──

  function commitItems(next: ListItem[]) {
    setItems(next);
    scheduleFlush(next, title);
  }

  function commitTitle(next: string) {
    setTitle(next);
    scheduleFlush(items, next);
  }

  function toggleComplete(id: string) {
    commitItems(items.map((i) => (i.id === id ? { ...i, completed: !i.completed } : i)));
  }

  function startEdit(item: ListItem) {
    setEditingId(item.id);
    setEditText(item.title);
    setEditDescription(item.description ?? "");
  }

  function saveEdit() {
    if (!editingId) return;
    const trimmedDesc = editDescription.trim();
    const next = items.map((i) =>
      i.id === editingId
        ? {
            ...i,
            title: editText.trim() || i.title,
            description: trimmedDesc.length > 0 ? trimmedDesc.slice(0, 500) : undefined,
          }
        : i,
    );
    commitItems(next);
    setEditingId(null);
    setEditText("");
    setEditDescription("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
    setEditDescription("");
  }

  function deleteItem(id: string) {
    const next = items.filter((i) => i.id !== id).map((i, idx) => ({ ...i, order: idx }));
    commitItems(next);
  }

  function moveUp(idx: number) {
    if (idx <= 0) return;
    const next = items.slice();
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    commitItems(next.map((i, k) => ({ ...i, order: k })));
  }

  function moveDown(idx: number) {
    if (idx >= items.length - 1) return;
    const next = items.slice();
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    commitItems(next.map((i, k) => ({ ...i, order: k })));
  }

  function addFromInput() {
    const text = addText.trim();
    if (!text) return;
    const parsed = parseListText(text);
    if (!parsed.length) return;
    const offset = items.length;
    const next = items.concat(
      parsed.map((p, idx) => ({
        id: genId(),
        title: p.title,
        completed: p.completed,
        order: offset + idx,
      })),
    );
    commitItems(next);
    setAddText("");
  }

  function markAllDone() {
    commitItems(items.map((i) => ({ ...i, completed: true })));
    setMenuOpen(false);
  }

  function clearCompleted() {
    commitItems(items.filter((i) => !i.completed).map((i, idx) => ({ ...i, order: idx })));
    setMenuOpen(false);
  }

  // ── Stats ──
  const doneCount = items.filter((i) => i.completed).length;
  const totalCount = items.length;

  return (
    <div style={{ padding: "20px 16px 80px", maxWidth: 720, margin: "0 auto" }}>
      <button
        type="button"
        onClick={onBack}
        className="press"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          border: 0,
          padding: "4px 0",
          color: "var(--ink-soft)",
          fontSize: 13,
          fontFamily: "var(--f-sans)",
          cursor: "pointer",
          marginBottom: 20,
        }}
      >
        ← back to lists
      </button>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingTitle ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                setEditingTitle(false);
                if (title.trim() && title.trim() !== entry.title) commitTitle(title.trim());
                else setTitle(entry.title);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setEditingTitle(false);
                  if (title.trim() && title.trim() !== entry.title) commitTitle(title.trim());
                  else setTitle(entry.title);
                } else if (e.key === "Escape") {
                  setTitle(entry.title);
                  setEditingTitle(false);
                }
              }}
              className="f-serif"
              style={{
                fontSize: 28,
                fontWeight: 400,
                letterSpacing: "-0.01em",
                color: "var(--ink)",
                background: "transparent",
                border: 0,
                borderBottom: "1px solid var(--ember)",
                outline: "none",
                width: "100%",
                padding: "2px 0",
              }}
            />
          ) : (
            <h1
              className="f-serif"
              style={{
                fontSize: 28,
                fontWeight: 400,
                letterSpacing: "-0.01em",
                color: "var(--ink)",
                margin: 0,
                cursor: "text",
                wordBreak: "break-word",
              }}
              onClick={() => setEditingTitle(true)}
            >
              {title}
            </h1>
          )}
          <div
            className="f-sans"
            style={{
              fontSize: 12,
              color: "var(--ink-faint)",
              marginTop: 4,
              fontStyle: "italic",
            }}
          >
            {totalCount === 0
              ? "empty list — paste items above or type one"
              : `${doneCount} of ${totalCount} done`}
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="List options"
            className="press"
            style={{
              background: "transparent",
              border: 0,
              padding: 6,
              color: "var(--ink-soft)",
              fontSize: 18,
              cursor: "pointer",
              borderRadius: 6,
            }}
          >
            ···
          </button>
          {menuOpen && (
            <div
              role="menu"
              style={{
                position: "absolute",
                right: 0,
                top: "100%",
                marginTop: 4,
                background: "var(--surface-high)",
                border: "1px solid var(--line-soft)",
                borderRadius: 8,
                boxShadow: "var(--lift-2)",
                minWidth: 180,
                zIndex: 10,
                overflow: "hidden",
              }}
              onMouseLeave={() => setMenuOpen(false)}
            >
              <MenuRow onClick={markAllDone} disabled={!totalCount || doneCount === totalCount}>
                mark all done
              </MenuRow>
              <MenuRow onClick={clearCompleted} disabled={!doneCount}>
                clear completed
              </MenuRow>
              <MenuRow
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmDeleteList(true);
                }}
                danger
              >
                delete list
              </MenuRow>
            </div>
          )}
        </div>
      </div>

      {confirmDeleteList && (
        <div
          style={{
            background: "var(--surface-low)",
            border: "1px solid var(--danger, #cc4444)",
            borderRadius: 10,
            padding: 14,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span className="f-sans" style={{ fontSize: 13, color: "var(--ink)", flex: 1 }}>
            delete this list and all its items?
          </span>
          <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteList(false)}>
            cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setConfirmDeleteList(false);
              onDeleteList(entry.id);
            }}
            style={{ background: "var(--danger, #cc4444)", color: "#fff" }}
          >
            delete
          </Button>
        </div>
      )}

      <textarea
        value={addText}
        onChange={(e) => setAddText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            addFromInput();
          }
        }}
        placeholder="add an item — Enter to save, Shift+Enter for new line, paste many at once"
        rows={Math.min(6, Math.max(1, addText.split("\n").length))}
        className="f-sans"
        style={{
          width: "100%",
          fontSize: 14,
          lineHeight: 1.5,
          resize: "none",
          padding: "10px 12px",
          color: "var(--ink)",
          background: "var(--surface-low)",
          border: "1px solid var(--line-soft)",
          borderRadius: 8,
          outline: "none",
          marginBottom: 16,
        }}
      />
      {addText.trim() && (
        <div
          className="f-sans"
          style={{
            fontSize: 11,
            color: "var(--ink-faint)",
            marginTop: -8,
            marginBottom: 16,
            fontStyle: "italic",
          }}
        >
          press Enter to save {parseListText(addText).length} item
          {parseListText(addText).length === 1 ? "" : "s"}
        </div>
      )}

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {items.map((item, idx) => {
          const isEditing = editingId === item.id;
          return (
            <li
              key={item.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 8,
                background: "transparent",
                transition: "background 120ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-low)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <input
                type="checkbox"
                checked={item.completed}
                onChange={() => toggleComplete(item.id)}
                aria-label={`Toggle ${item.title}`}
                style={{
                  width: 18,
                  height: 18,
                  cursor: "pointer",
                  accentColor: "var(--ember)",
                  flexShrink: 0,
                  marginTop: 4,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                {isEditing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <input
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          saveEdit();
                        } else if (e.key === "Escape") cancelEdit();
                      }}
                      className="f-sans"
                      placeholder="title"
                      style={{
                        width: "100%",
                        fontSize: 14,
                        padding: "4px 6px",
                        color: "var(--ink)",
                        background: "var(--surface)",
                        border: "1px solid var(--ember)",
                        borderRadius: 4,
                        outline: "none",
                      }}
                    />
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          saveEdit();
                        } else if (e.key === "Escape") cancelEdit();
                      }}
                      placeholder="description (optional)"
                      rows={2}
                      className="f-serif"
                      style={{
                        width: "100%",
                        fontSize: 12,
                        padding: "4px 6px",
                        color: "var(--ink-soft)",
                        background: "var(--surface)",
                        border: "1px solid var(--line-soft)",
                        borderRadius: 4,
                        outline: "none",
                        resize: "vertical",
                        fontStyle: "italic",
                        lineHeight: 1.4,
                      }}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <ItemBtn label="Save" onClick={saveEdit} glyph="✓" />
                      <ItemBtn label="Cancel" onClick={cancelEdit} glyph="×" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className="f-sans"
                      onClick={() => startEdit(item)}
                      style={{
                        fontSize: 14,
                        color: item.completed ? "var(--ink-faint)" : "var(--ink)",
                        textDecoration: item.completed ? "line-through" : "none",
                        cursor: "text",
                        wordBreak: "break-word",
                      }}
                    >
                      {item.title}
                    </div>
                    {item.description && (
                      <div
                        className="f-serif"
                        onClick={() => startEdit(item)}
                        style={{
                          fontSize: 12,
                          color: "var(--ink-soft)",
                          marginTop: 2,
                          lineHeight: 1.4,
                          fontStyle: "italic",
                          cursor: "text",
                          wordBreak: "break-word",
                          textDecoration: item.completed ? "line-through" : "none",
                          opacity: item.completed ? 0.6 : 1,
                        }}
                      >
                        {item.description}
                      </div>
                    )}
                  </>
                )}
              </div>
              {!isEditing && (
                <>
                  <ItemBtn
                    label="Move up"
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    glyph="↑"
                  />
                  <ItemBtn
                    label="Move down"
                    onClick={() => moveDown(idx)}
                    disabled={idx === items.length - 1}
                    glyph="↓"
                  />
                  <ItemBtn label="Edit" onClick={() => startEdit(item)} glyph="✎" />
                  <ItemBtn label="Delete" onClick={() => deleteItem(item.id)} glyph="🗑" />
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MenuRow({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="f-sans press"
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "10px 14px",
        background: "transparent",
        border: 0,
        fontSize: 13,
        color: disabled ? "var(--ink-faint)" : danger ? "var(--danger, #cc4444)" : "var(--ink)",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function ItemBtn({
  glyph,
  label,
  onClick,
  disabled,
}: {
  glyph: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="press"
      style={{
        background: "transparent",
        border: 0,
        padding: 4,
        color: disabled ? "var(--ink-faint)" : "var(--ink-soft)",
        fontSize: 12,
        cursor: disabled ? "not-allowed" : "pointer",
        borderRadius: 4,
        opacity: disabled ? 0.4 : 1,
        flexShrink: 0,
      }}
    >
      {glyph}
    </button>
  );
}
