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
    const res = await authFetch(`/api/entries?id=${entry.id}&action=restore`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
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
    const res = await authFetch(`/api/entries?id=${entry.id}&permanent=true`, {
      method: "DELETE",
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

  if (loading) return <div className="flex items-center justify-center h-40 text-sm" style={{ color: "#aaa" }}>Loading trash...</div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Trash ({entries.length})</p>
        {entries.length > 0 && (
          <div className="flex gap-2">
            <button onClick={restoreAll} className="rounded-lg px-3 text-xs" style={{ background: "rgba(114,239,245,0.15)", color: "#72eff5", minHeight: 36 }}>
              Restore all
            </button>
            <button onClick={emptyTrash} className="rounded-lg px-3 text-xs" style={{ background: "rgba(255,71,87,0.15)", color: "#FF4757", minHeight: 36 }}>
              Empty trash
            </button>
          </div>
        )}
      </div>
      <p className="text-xs" style={{ color: "#555" }}>Entries deleted more than 30 days ago are gone forever.</p>
      {entries.length === 0 && (
        <p className="text-center text-sm py-12" style={{ color: "#555" }}>Trash is empty</p>
      )}
      <div className="space-y-2">
        {entries.map(entry => {
          const tc = getTypeConfig(entry.type);
          const deleted = (entry as any).deleted_at;
          return (
            <div key={entry.id} className="rounded-xl border p-3 flex items-center gap-3"
              style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}>
              <span className="text-xl">{tc.i}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{entry.title}</p>
                <p className="text-xs" style={{ color: "#555" }}>
                  Deleted {deleted ? `${daysAgo(deleted)} day${daysAgo(deleted) !== 1 ? "s" : ""} ago` : "recently"}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => restore(entry)} disabled={busy === entry.id}
                  className="rounded-lg px-3 text-xs disabled:opacity-40"
                  style={{ background: "rgba(114,239,245,0.15)", color: "#72eff5", minHeight: 36 }}>
                  Restore
                </button>
                <button onClick={() => deletePermanently(entry)} disabled={busy === entry.id}
                  className="rounded-lg px-3 text-xs disabled:opacity-40"
                  style={{ background: "rgba(255,71,87,0.1)", color: "#FF4757", minHeight: 36 }}>
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
