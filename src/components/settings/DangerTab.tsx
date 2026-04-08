import { useState } from "react";
import { authFetch } from "../../lib/authFetch";
import type { Brain } from "../../types";

interface Props {
  activeBrain: Brain;
  deleteBrain: (id: string) => Promise<void>;
  isOwner: boolean;
  deleteAccount: () => Promise<void>;
}

type ModalStep = "ask-export" | "exporting" | "deleting";

export default function DangerTab({ activeBrain, deleteBrain, isOwner, deleteAccount }: Props) {
  const [confirmDeleteBrain, setConfirmDeleteBrain] = useState(false);
  const [deletingBrain, setDeletingBrain] = useState(false);
  const [brainError, setBrainError] = useState<string | null>(null);

  const [modalStep, setModalStep] = useState<ModalStep | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  const handleDeleteBrain = async () => {
    if (!confirmDeleteBrain) {
      setConfirmDeleteBrain(true);
      setTimeout(() => setConfirmDeleteBrain(false), 5000);
      return;
    }
    setDeletingBrain(true);
    setBrainError(null);
    try {
      await deleteBrain(activeBrain.id);
    } catch (e: any) {
      setBrainError(e.message || "Failed to delete brain");
      setDeletingBrain(false);
      setConfirmDeleteBrain(false);
    }
  };

  const exportAllData = async () => {
    // Fetch all brains the user has access to
    const brainsRes = await authFetch("/api/brains");
    const brainsData = brainsRes.ok ? await brainsRes.json() : { brains: [] };
    const allBrains: Brain[] = brainsData.brains || brainsData || [];

    const result: Record<string, any> = { exported_at: new Date().toISOString(), brains: [] };

    for (const brain of allBrains) {
      const r = await authFetch(`/api/export?brain_id=${brain.id}`);
      if (r.ok) {
        const data = await r.json().catch(() => null);
        if (data) result.brains.push({ brain_id: brain.id, brain_name: brain.name, ...data });
      }
    }

    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `openbrain-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportThenDelete = async () => {
    setModalStep("exporting");
    setAccountError(null);
    try {
      await exportAllData();
      setModalStep("deleting");
      await deleteAccount();
    } catch (e: any) {
      setAccountError(e.message || "Failed");
      setModalStep("ask-export");
    }
  };

  const handleDeleteOnly = async () => {
    setModalStep("deleting");
    setAccountError(null);
    try {
      await deleteAccount();
    } catch (e: any) {
      setAccountError(e.message || "Failed to delete account");
      setModalStep("ask-export");
    }
  };

  return (
    <>
      {/* Export/Delete modal */}
      {modalStep && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: "var(--color-surface-container-high)", border: "1px solid var(--color-outline-variant)" }}
          >
            {modalStep === "ask-export" && (
              <>
                <p className="text-base font-bold text-on-surface">Export your data first?</p>
                <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
                  Download all your entries across every brain as a JSON file before permanently deleting your account.
                </p>
                {accountError && (
                  <p className="text-xs font-mono break-all" style={{ color: "var(--color-error)" }}>{accountError}</p>
                )}
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    onClick={handleExportThenDelete}
                    className="w-full rounded-xl py-3 text-sm font-bold transition-opacity hover:opacity-90"
                    style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
                  >
                    Export then Delete
                  </button>
                  <button
                    onClick={handleDeleteOnly}
                    className="w-full rounded-xl py-3 text-sm font-bold transition-all"
                    style={{
                      background: "color-mix(in oklch, var(--color-error) 15%, var(--color-surface-container))",
                      color: "var(--color-error)",
                      border: "1px solid color-mix(in oklch, var(--color-error) 30%, transparent)",
                    }}
                  >
                    Delete without Export
                  </button>
                  <button
                    onClick={() => { setModalStep(null); setAccountError(null); }}
                    className="w-full rounded-xl py-3 text-sm transition-colors hover:bg-white/5"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
            {modalStep === "exporting" && (
              <>
                <p className="text-base font-bold text-on-surface">Exporting your data…</p>
                <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
                  Downloading all entries. Your account will be deleted once complete.
                </p>
                <div className="flex justify-center pt-2">
                  <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
                </div>
              </>
            )}
            {modalStep === "deleting" && (
              <>
                <p className="text-base font-bold text-on-surface">Deleting account…</p>
                <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
                  Permanently removing your account and all data.
                </p>
                <div className="flex justify-center pt-2">
                  <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--color-error)", borderTopColor: "transparent" }} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div
        className="rounded-2xl border p-4 space-y-4"
        style={{ background: "color-mix(in oklch, var(--color-error) 5%, transparent)", borderColor: "color-mix(in oklch, var(--color-error) 20%, transparent)" }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-error)" }}>Danger Zone</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>Irreversible actions. Proceed with care.</p>
        </div>

        {isOwner && (
          <div className="space-y-2">
            <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
              Delete brain <strong className="text-on-surface">{activeBrain.name}</strong> and all its entries permanently. This cannot be undone.
            </p>
            {brainError && <p className="text-xs" style={{ color: "var(--color-error)" }}>{brainError}</p>}
            <button
              disabled={deletingBrain}
              onClick={handleDeleteBrain}
              className="rounded-xl px-4 py-2 text-xs font-bold transition-all disabled:opacity-40"
              style={{
                background: confirmDeleteBrain
                  ? "color-mix(in oklch, var(--color-error) 25%, var(--color-surface-container))"
                  : "color-mix(in oklch, var(--color-error) 10%, var(--color-surface-container))",
                color: "var(--color-error)",
                border: "1px solid color-mix(in oklch, var(--color-error) 30%, transparent)",
                minHeight: 44,
              }}
            >
              {deletingBrain ? "Deleting…" : confirmDeleteBrain ? "Tap again to confirm — this is permanent" : "Delete this Brain"}
            </button>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
            Permanently delete your account and all associated data. This cannot be undone.
          </p>
          <button
            onClick={() => setModalStep("ask-export")}
            className="rounded-xl px-4 py-2 text-xs font-bold transition-all"
            style={{
              background: "color-mix(in oklch, var(--color-error) 10%, var(--color-surface-container))",
              color: "var(--color-error)",
              border: "1px solid color-mix(in oklch, var(--color-error) 30%, transparent)",
              minHeight: 44,
            }}
          >
            Delete Account
          </button>
        </div>
      </div>
    </>
  );
}
