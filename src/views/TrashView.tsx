import { useState, useEffect } from "react";
import { entryRepo } from "../lib/entryRepo";
import { getTypeConfig } from "../data/constants";
import type { Entry } from "../types";
import { Button } from "../components/ui/button";
import { ConfirmDialog } from "../components/ConfirmDialog";

function daysAgo(isoDate: string): number {
  const ms = Date.now() - new Date(isoDate).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

interface TrashViewProps {
  brainId?: string;
  onRestore?: (entry: Entry) => void;
}

export default function TrashView({ brainId, onRestore }: TrashViewProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<
    { type: "entry"; entry: Entry } | { type: "all" } | null
  >(null);

  const load = async () => {
    setLoading(true);
    const fetched = await entryRepo.list({ brainId, trash: true });
    setEntries(fetched);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load() reads brainId via closure; including it as a dep adds nothing since the brain change already retriggers.
  }, [brainId]);

  const restore = async (entry: Entry) => {
    setBusy(entry.id);
    if (await entryRepo.restore(entry.id)) {
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      onRestore?.(entry);
    }
    setBusy(null);
  };

  const performDelete = async (entry: Entry) => {
    setBusy(entry.id);
    if (await entryRepo.deletePermanent(entry.id)) {
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    }
    setBusy(null);
  };

  const restoreAll = async () => {
    await Promise.all(entries.map(restore));
  };

  const performEmptyTrash = async () => {
    const targets = [...entries];
    for (const entry of targets) {
      await performDelete(entry);
    }
  };

  if (loading)
    return (
      <div
        className="flex h-40 items-center justify-center text-sm"
        style={{ color: "var(--color-on-surface-variant)" }}
      >
        Loading trash...
      </div>
    );

  return (
    <div className="p-4">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: "var(--color-on-surface)" }}>
          Trash
        </p>
        {entries.length > 0 && (
          <div className="flex gap-2">
            <Button variant="outline" size="xs" onClick={restoreAll}>
              Restore all
            </Button>
            <Button variant="destructive" size="xs" onClick={() => setConfirming({ type: "all" })}>
              Empty trash
            </Button>
          </div>
        )}
      </div>
      <p className="mb-6 text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
        Entries deleted more than 30 days ago are gone forever.
      </p>
      {entries.length === 0 && (
        <p
          className="py-12 text-center text-sm"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          Trash is empty
        </p>
      )}
      <div className="divide-y" style={{ borderColor: "var(--color-outline-variant)" }}>
        {entries.map((entry) => {
          const tc = getTypeConfig(entry.type);
          const deleted = entry.deleted_at;
          const age = deleted ? daysAgo(deleted) : null;
          return (
            <div key={entry.id} className="flex items-center gap-3 py-3">
              <span className="text-lg">{tc.i}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm" style={{ color: "var(--color-on-surface)" }}>
                  {entry.title}
                </p>
                <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                  Deleted {age !== null ? `${age} day${age !== 1 ? "s" : ""} ago` : "recently"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => restore(entry)}
                  disabled={busy === entry.id}
                >
                  Restore
                </Button>
                <Button
                  variant="destructive"
                  size="xs"
                  onClick={() => setConfirming({ type: "entry", entry })}
                  disabled={busy === entry.id}
                >
                  Delete
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {confirming?.type === "entry" && (
        <ConfirmDialog
          title="Delete forever?"
          body={`Permanently delete "${confirming.entry.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirming(null)}
          onConfirm={() => performDelete(confirming.entry)}
        />
      )}
      {confirming?.type === "all" && (
        <ConfirmDialog
          title="Empty trash?"
          body="Permanently delete all trashed entries? This cannot be undone."
          confirmLabel="Empty trash"
          danger
          onCancel={() => setConfirming(null)}
          onConfirm={performEmptyTrash}
        />
      )}
    </div>
  );
}
