import { useState } from "react";
import type { Brain } from "../../types";

interface Props {
  activeBrain: Brain;
  deleteBrain: (id: string) => Promise<void>;
}

export default function DangerTab({ activeBrain, deleteBrain }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 5000);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteBrain(activeBrain.id);
    } catch (e: any) {
      setError(e.message || "Failed to delete brain");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div
      className="rounded-2xl border p-4 space-y-3"
      style={{ background: "color-mix(in oklch, var(--color-error) 5%, transparent)", borderColor: "color-mix(in oklch, var(--color-error) 20%, transparent)" }}
    >
      <div>
        <p className="text-sm font-semibold" style={{ color: "var(--color-error)" }}>Danger Zone</p>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>Irreversible actions. Proceed with care.</p>
      </div>
      <div className="space-y-2">
        <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
          Delete brain <strong className="text-on-surface">{activeBrain.name}</strong> and all its entries permanently. This cannot be undone.
        </p>
        {error && <p className="text-xs" style={{ color: "var(--color-error)" }}>{error}</p>}
        <button
          disabled={deleting}
          onClick={handleDelete}
          className="rounded-xl px-4 py-2 text-xs font-bold transition-all disabled:opacity-40"
          style={{
            background: confirmDelete
              ? "color-mix(in oklch, var(--color-error) 25%, var(--color-surface-container))"
              : "color-mix(in oklch, var(--color-error) 10%, var(--color-surface-container))",
            color: "var(--color-error)",
            border: "1px solid color-mix(in oklch, var(--color-error) 30%, transparent)",
            minHeight: 44,
          }}
        >
          {deleting ? "Deleting..." : confirmDelete ? "Tap again to confirm — this is permanent" : "Delete this Brain"}
        </button>
      </div>
    </div>
  );
}
