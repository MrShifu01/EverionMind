import { useState, useEffect } from "react";
import { authFetch } from "../lib/authFetch";
import { pickDefaultIcon } from "../lib/typeIcons";
import { extractPhone } from "../lib/phone";
import type { Entry, Brain } from "../types";

interface UseEntryEditOptions {
  entry: Entry;
  editing: boolean;
  onUpdate?: (id: string, changes: any) => Promise<void>;
  onTypeIconChange?: (type: string, icon: string) => void;
  brains: Brain[];
}

export function useEntryEdit({
  entry,
  editing,
  onUpdate,
  onTypeIconChange,
  brains: _brains,
}: UseEntryEditOptions) {
  const [saving, setSaving] = useState(false);
  const [extraBrainIds, setExtraBrainIds] = useState<string[]>([]);
  const [editExtraBrainIds, setEditExtraBrainIds] = useState<string[]>([]);
  const [extraBrainsLoaded, setExtraBrainsLoaded] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const editBrainId = entry.brain_id || "";

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

  const handleSave = async (fields: {
    editTitle: string;
    editContent: string;
    editType: string;
    editTags: string;
  }) => {
    setSaving(true);
    const tags = fields.editTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const changes: Record<string, any> = {
      title: fields.editTitle,
      content: fields.editContent,
      type: fields.editType,
      tags,
    };
    if (editBrainId && editBrainId !== entry.brain_id) changes.brain_id = editBrainId;
    if (fields.editType !== entry.type) {
      const icon = pickDefaultIcon(fields.editType);
      onTypeIconChange?.(fields.editType, icon);
    }
    await onUpdate?.(entry.id, changes);

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
          }).catch((err) => console.error("[useEntryEdit] entry-brains add failed", brain_id, err)),
        ),
        ...toRemove.map((brain_id) =>
          authFetch(
            `/api/entry-brains?entry_id=${encodeURIComponent(entry.id)}&brain_id=${encodeURIComponent(brain_id)}`,
            { method: "DELETE" },
          ).catch((err) => console.error("[useEntryEdit] entry-brains remove failed", brain_id, err)),
        ),
      ]);
      setExtraBrainIds([...nextSet]);
    }

    setSaving(false);
  };

  const handleShare = async (entryToShare: Entry) => {
    const phone = extractPhone(entryToShare);
    const text = [
      entryToShare.title,
      entryToShare.content,
      phone ? `📞 ${phone}` : null,
      Object.entries(entryToShare.metadata || {})
        .filter(([k]) => !["category", "workspace"].includes(k))
        .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
        .join("\n") || null,
      "— from OpenBrain",
    ]
      .filter(Boolean)
      .join("\n");

    if (navigator.share) {
      try {
        await navigator.share({ title: entryToShare.title, text });
      } catch (err) { console.error("[useEntryEdit]", err); }
    } else {
      await navigator.clipboard.writeText(text);
      setShareMsg("Copied to clipboard");
      setTimeout(() => setShareMsg(null), 2500);
    }
  };

  const toggleExtraBrain = (brainId: string, isPrimary: boolean) => {
    if (isPrimary) return;
    setEditExtraBrainIds((prev) =>
      prev.includes(brainId) ? prev.filter((id) => id !== brainId) : [...prev, brainId],
    );
  };

  return {
    saving,
    extraBrainIds,
    editExtraBrainIds,
    extraBrainsLoaded,
    shareMsg, setShareMsg,
    editBrainId,
    handleSave,
    handleShare,
    toggleExtraBrain,
  };
}
