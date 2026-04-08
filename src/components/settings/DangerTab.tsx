import { useState } from "react";
import type { Brain } from "../../types";

interface Props {
  activeBrain: Brain;
  deleteBrain: (id: string) => Promise<void>;
  isOwner: boolean;
  deleteAccount: () => Promise<void>;
}

export default function DangerTab({ activeBrain, deleteBrain, isOwner, deleteAccount }: Props) {
  const [confirmDeleteBrain, setConfirmDeleteBrain] = useState(false);
  const [deletingBrain, setDeletingBrain] = useState(false);
  const [brainError, setBrainError] = useState<string | null>(null);

  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
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

  const handleDeleteAccount = async () => {
    if (!confirmDeleteAccount) {
      setConfirmDeleteAccount(true);
      setTimeout(() => setConfirmDeleteAccount(false), 5000);
      return;
    }
    setDeletingAccount(true);
    setAccountError(null);
    try {
      await deleteAccount();
    } catch (e: any) {
      setAccountError(e.message || "Failed to delete account");
      setDeletingAccount(false);
      setConfirmDeleteAccount(false);
    }
  };

  return (
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
        {accountError && <p className="text-xs" style={{ color: "var(--color-error)" }}>{accountError}</p>}
        <button
          disabled={deletingAccount}
          onClick={handleDeleteAccount}
          className="rounded-xl px-4 py-2 text-xs font-bold transition-all disabled:opacity-40"
          style={{
            background: confirmDeleteAccount
              ? "color-mix(in oklch, var(--color-error) 25%, var(--color-surface-container))"
              : "color-mix(in oklch, var(--color-error) 10%, var(--color-surface-container))",
            color: "var(--color-error)",
            border: "1px solid color-mix(in oklch, var(--color-error) 30%, transparent)",
            minHeight: 44,
          }}
        >
          {deletingAccount ? "Deleting…" : confirmDeleteAccount ? "Tap again to confirm — this is permanent" : "Delete Account"}
        </button>
      </div>
    </div>
  );
}
