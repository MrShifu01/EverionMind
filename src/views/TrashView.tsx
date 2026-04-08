import { useState, useEffect } from "react";
import { authFetch } from "../lib/authFetch";
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
    const params = new URLSearchParams({ trash: "true" });
    if (brainId) params.set("brain_id", brainId);
    const res = await authFetch(`/api/entries?${params}`).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : data.entries ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [brainId]);

  const restore = async (entry: Entry) => {
    setBusy(entry.id);
    const res = await authFetch(`/api/entries?action=restore`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id }),
    }).catch(() => null);
    if (res?.ok) {
      setEntries(prev => prev.filter(e => e.id !== entry.id));
      onRestore?.(entry);
    }
    setBusy(null);
  };

  const deletePermanently = async (entry: Entry) => {
    if (!confirm(`Permanently delete "${entry.title}"? This cannot be undone.`)) return;
    setBusy(entry.id);
    const res = await authFetch(`/api/entries?permanent=true`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id }),
    }).catch(() => null);
    if (res?.ok) setEntries(prev => prev.filter(e => e.id !== entry.id));
    setBusy(null);
  };

  const restoreAll = async () => {
    for (const entry of entries) await restore(entry);
  };

  const emptyTrash = async () => {
    if (!confirm("Permanently delete all trashed entries? This cannot be undone.")) return;
    for (const entry of entries) await deletePermanently(entry);
  };

  if (loading) return <div className="flex items-center justify-center h-40 text-sm" style={{ color: "var(--color-on-surface-variant)" }}>Loading trash...</div>;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold" style={{ color: "var(--color-on-surface)" }}>Trash</p>
        {entries.length > 0 && (
          <div className="flex gap-2">
            <button onClick={restoreAll} className="rounded-lg px-3 text-xs" style={{ background: "var(--color-primary-container)", color: "var(--color-primary)", minHeight: 36 }}>
              Restore all
            </button>
            <button onClick={emptyTrash} className="rounded-lg px-3 text-xs" style={{ background: "color-mix(in oklch, var(--color-error) 15%, transparent)", color: "var(--color-error)", minHeight: 36 }}>
              Empty trash
            </button>
          </div>
        )}
      </div>
      <p className="text-xs mb-6" style={{ color: "var(--color-on-surface-variant)" }}>Entries deleted more than 30 days ago are gone forever.</p>
      {entries.length === 0 && (
        <p className="text-center text-sm py-12" style={{ color: "var(--color-on-surface-variant)" }}>Trash is empty</p>
      )}
      <div className="divide-y" style={{ borderColor: "var(--color-outline-variant)" }}>
        {entries.map(entry => {
          const tc = getTypeConfig(entry.type);
          const deleted = (entry as any).deleted_at;
          return (
            <div key={entry.id} className="py-3 flex items-center gap-3">
              <span className="text-lg">{tc.i}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" style={{ color: "var(--color-on-surface)" }}>{entry.title}</p>
                <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                  Deleted {deleted ? `${daysAgo(deleted)} day${daysAgo(deleted) !== 1 ? "s" : ""} ago` : "recently"}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => restore(entry)} disabled={busy === entry.id}
                  className="rounded-lg px-3 text-xs disabled:opacity-40"
                  style={{ background: "var(--color-primary-container)", color: "var(--color-primary)", minHeight: 36 }}>
                  Restore
                </button>
                <button onClick={() => deletePermanently(entry)} disabled={busy === entry.id}
                  className="rounded-lg px-3 text-xs disabled:opacity-40"
                  style={{ background: "color-mix(in oklch, var(--color-error) 10%, transparent)", color: "var(--color-error)", minHeight: 36 }}>
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
