import { useState, useCallback, useRef } from "react";
import { authFetch } from "../lib/authFetch";
import { showError, captureError, showToast } from "../lib/notifications";
import { removeFromIndex, indexEntry } from "../lib/searchIndex";
import { writeEntriesCache } from "../lib/entriesCache";
import { encryptEntry } from "../lib/crypto";
import { getEmbedHeaders } from "../lib/aiSettings";
import type { Entry } from "../types";

interface UseEntryActionsParams {
  entries: Entry[];
  setEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  setSelected: React.Dispatch<React.SetStateAction<Entry | null>>;
  isOnline: boolean;
  isOnlineRef: React.MutableRefObject<boolean>;
  refreshCount: () => void;
  cryptoKey: CryptoKey | null;
}

export function useEntryActions({
  entries,
  setEntries,
  setSelected,
  isOnline,
  isOnlineRef,
  refreshCount,
  cryptoKey,
}: UseEntryActionsParams) {
  const [lastAction, setLastAction] = useState<any>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pendingDeleteRef = useRef<any>(null);

  const commitPendingDelete = useCallback(() => {
    if (!pendingDeleteRef.current) return;
    const { id } = pendingDeleteRef.current;
    writeEntriesCache(entries.filter((e) => e.id !== id));
    if (isOnlineRef.current) {
      authFetch("/api/delete-entry", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      }).catch((err) => captureError(err, "commitPendingDelete"));
    } else {
      showToast("You can't delete while offline.", "error");
    }
    pendingDeleteRef.current = null;
  }, [entries, isOnlineRef]);

  const handleDelete = useCallback(
    (id: string) => {
      const entry = entries.find((e) => e.id === id);
      if (!entry) return;
      commitPendingDelete();
      removeFromIndex(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setSelected(null);
      const timer = setTimeout(() => {
        if (pendingDeleteRef.current?.id === id) {
          commitPendingDelete();
          setLastAction(null);
        }
      }, 5000);
      pendingDeleteRef.current = { id, entry, timer };
      setLastAction({ type: "delete", entry });
    },
    [entries, commitPendingDelete, setEntries, setSelected],
  );

  const handleUpdate = useCallback(
    async (id: string, changes: Partial<Entry>) => {
      const previous = entries.find((e) => e.id === id);
      if (!isOnline) {
        showToast("You can't save while offline.", "error");
        return;
      }
      const entryType = (changes as any).type || previous?.type;
      const isSecret = entryType === "secret";
      let serverChanges: any = { ...changes };
      if (isSecret && cryptoKey && ((changes as any).content || (changes as any).metadata)) {
        const encrypted = await encryptEntry(
          { content: (changes as any).content, metadata: (changes as any).metadata },
          cryptoKey,
        );
        if ((changes as any).content) serverChanges.content = encrypted.content;
        if ((changes as any).metadata) serverChanges.metadata = encrypted.metadata;
      }
      try {
        const res = await authFetch("/api/update-entry", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...serverChanges }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data?.message || data?.error) ?? `HTTP ${res.status}`);
        if (Array.isArray(data) && data.length === 0) throw new Error(`No row matched id=${id}`);
      } catch (e: any) {
        captureError(e, "handleUpdate");
        showError(`Save failed: ${e.message}`);
        setSaveError(`Save failed: ${e.message}`);
        setTimeout(() => setSaveError(null), 5000);
        return;
      }
      if (!isSecret) {
        const embedHeaders = getEmbedHeaders();
        if (embedHeaders) {
          authFetch("/api/embed", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...embedHeaders },
            body: JSON.stringify({ entry_id: id }),
          }).catch((err) => console.error("embed re-index failed:", err));
        }
      }
      removeFromIndex(id);
      const updated = { ...entries.find((e) => e.id === id), ...changes } as Entry;
      indexEntry(updated);
      setEntries((prev) => {
        const next = prev.map((e) => (e.id === id ? { ...e, ...changes } : e));
        // Invalidate cache immediately on mutation
        writeEntriesCache(next);
        return next;
      });
      setSelected((prev: any) => (prev?.id === id ? { ...prev, ...changes } : prev));
      if (previous)
        setLastAction({
          type: "update",
          id,
          previous: {
            title: previous.title,
            content: previous.content,
            type: previous.type,
            tags: previous.tags,
            metadata: previous.metadata,
          },
        });
    },
    [entries, isOnline, refreshCount, cryptoKey, setEntries, setSelected],
  );

  const handleUndo = useCallback(() => {
    if (!lastAction) return;
    if (lastAction.type === "delete" && pendingDeleteRef.current) {
      clearTimeout(pendingDeleteRef.current.timer);
      setEntries((prev) => [pendingDeleteRef.current.entry, ...prev]);
      pendingDeleteRef.current = null;
    }
    if (lastAction.type === "update") {
      const { id, previous } = lastAction;
      authFetch("/api/update-entry", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...previous }),
      }).catch((err) => captureError(err, "undo:update"));
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...previous } : e)));
      setSelected((prev: any) => (prev?.id === id ? { ...prev, ...previous } : prev));
    }
    if (lastAction.type === "create") {
      const { id } = lastAction;
      authFetch("/api/delete-entry", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      }).catch((err) => captureError(err, "undo:delete"));
      setEntries((prev) => prev.filter((e) => e.id !== id));
    }
    setLastAction(null);
  }, [lastAction, setEntries, setSelected]);

  const handleCreated = useCallback((newEntry: Entry) => {
    setEntries((prev) => [newEntry, ...prev]);
    setLastAction({ type: "create", id: newEntry.id });
  }, [setEntries]);

  return {
    lastAction,
    setLastAction,
    saveError,
    setSaveError,
    pendingDeleteRef,
    handleDelete,
    handleUpdate,
    handleUndo,
    handleCreated,
    commitPendingDelete,
  };
}
