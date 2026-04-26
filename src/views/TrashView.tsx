import { useState, useEffect } from "react";
import { entryRepo } from "../lib/entryRepo";
import { getTypeConfig } from "../data/constants";
import type { Entry } from "../types";

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

  const load = async () => {
    setLoading(true);
    const fetched = await entryRepo.list({ brainId, trash: true });
    setEntries(fetched);
    setLoading(false);
  };

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [brainId]);

  const restore = async (entry: Entry) => {
    setBusy(entry.id);
    if (await entryRepo.restore(entry.id)) {
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      onRestore?.(entry);
    }
    setBusy(null);
  };

  const deletePermanently = async (entry: Entry) => {
    if (!confirm(`Permanently delete "${entry.title}"? This cannot be undone.`)) return;
    setBusy(entry.id);
    if (await entryRepo.deletePermanent(entry.id)) {
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    }
    setBusy(null);
  };

  const restoreAll = async () => {
    await Promise.all(entries.map(restore));
  };

  const emptyTrash = async () => {
    if (!confirm("Permanently delete all trashed entries? This cannot be undone.")) return;
    await Promise.all(entries.map(deletePermanently));
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
            <button
              onClick={restoreAll}
              className="rounded-lg px-3 text-xs"
              style={{
                background: "var(--color-primary-container)",
                color: "var(--color-primary)",
              }}
            >
              Restore all
            </button>
            <button
              onClick={emptyTrash}
              className="rounded-lg px-3 text-xs"
              style={{
                background: "color-mix(in oklch, var(--color-error) 15%, transparent)",
                color: "var(--color-error)",
              }}
            >
              Empty trash
            </button>
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
          const deleted = (entry as any).deleted_at;
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
                <button
                  onClick={() => restore(entry)}
                  disabled={busy === entry.id}
                  className="rounded-lg px-3 text-xs disabled:opacity-40"
                  style={{
                    background: "var(--color-primary-container)",
                    color: "var(--color-primary)",
                  }}
                >
                  Restore
                </button>
                <button
                  onClick={() => deletePermanently(entry)}
                  disabled={busy === entry.id}
                  className="rounded-lg px-3 text-xs disabled:opacity-40"
                  style={{
                    background: "color-mix(in oklch, var(--color-error) 10%, transparent)",
                    color: "var(--color-error)",
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
