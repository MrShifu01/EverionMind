import { useState } from "react";
import { authFetch } from "../../lib/authFetch";
import type { Brain } from "../../types";
import SettingsRow, { SettingsButton } from "./SettingsRow";

const DELETE_BRAIN_CONFIRM_WINDOW_MS = 5000;

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

  const [clearingTrash, setClearingTrash] = useState(false);
  const [trashMsg, setTrashMsg] = useState<string | null>(null);

  const [resettingGraph, setResettingGraph] = useState(false);
  const [graphMsg, setGraphMsg] = useState<string | null>(null);

  const handleClearTrash = async () => {
    setClearingTrash(true);
    setTrashMsg(null);
    try {
      const r = await authFetch("/api/entries?action=empty-trash", { method: "POST" });
      setTrashMsg(r.ok ? "trash cleared." : "could not clear trash right now.");
    } catch {
      setTrashMsg("could not clear trash right now.");
    }
    setClearingTrash(false);
    setTimeout(() => setTrashMsg(null), 4000);
  };

  const handleResetGraph = async () => {
    setResettingGraph(true);
    setGraphMsg(null);
    try {
      // Clear local concept caches — the graph rebuilds from entries on next load.
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("ob:graph:") || k.startsWith("openbrain:concepts:")) {
          localStorage.removeItem(k);
        }
      }
      window.dispatchEvent(new CustomEvent("openbrain:reset-graph"));
      setGraphMsg("graph reset. concepts re-extract on next load.");
    } catch {
      setGraphMsg("could not reset graph.");
    }
    setResettingGraph(false);
    setTimeout(() => setGraphMsg(null), 4000);
  };

  const handleDeleteBrain = async () => {
    if (!confirmDeleteBrain) {
      setConfirmDeleteBrain(true);
      setTimeout(() => setConfirmDeleteBrain(false), DELETE_BRAIN_CONFIRM_WINDOW_MS);
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
    a.download = `everion-export-${new Date().toISOString().slice(0, 10)}.json`;
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
      {modalStep && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--scrim)" }}
        >
          <div
            className="anim-scale-in-design"
            style={{
              width: "100%",
              maxWidth: 420,
              padding: 28,
              background: "var(--surface-high)",
              border: "1px solid var(--line)",
              borderRadius: 18,
              boxShadow: "var(--lift-3)",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {modalStep === "ask-export" && (
              <>
                <h3
                  className="f-serif"
                  style={{ fontSize: 22, fontWeight: 450, color: "var(--ink)", margin: 0 }}
                >
                  export your data first?
                </h3>
                <p
                  className="f-serif"
                  style={{
                    fontSize: 15,
                    color: "var(--ink-soft)",
                    fontStyle: "italic",
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  download all your entries across every brain as a JSON file before permanently
                  deleting your account.
                </p>
                {accountError && (
                  <p
                    className="f-sans"
                    style={{
                      fontSize: 12,
                      color: "var(--blood)",
                      fontFamily: "var(--f-mono)",
                      wordBreak: "break-all",
                      margin: 0,
                    }}
                  >
                    {accountError}
                  </p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
                  <button
                    className="design-btn-primary press"
                    style={{ width: "100%" }}
                    onClick={handleExportThenDelete}
                  >
                    Export then delete
                  </button>
                  <SettingsButton danger onClick={handleDeleteOnly}>
                    Delete without export
                  </SettingsButton>
                  <SettingsButton
                    onClick={() => {
                      setModalStep(null);
                      setAccountError(null);
                    }}
                  >
                    Cancel
                  </SettingsButton>
                </div>
              </>
            )}
            {modalStep === "exporting" && (
              <>
                <h3
                  className="f-serif"
                  style={{ fontSize: 22, fontWeight: 450, color: "var(--ink)", margin: 0 }}
                >
                  exporting your data…
                </h3>
                <p
                  className="f-serif"
                  style={{
                    fontSize: 14,
                    color: "var(--ink-soft)",
                    fontStyle: "italic",
                    margin: 0,
                  }}
                >
                  your account will be deleted once the download completes.
                </p>
              </>
            )}
            {modalStep === "deleting" && (
              <>
                <h3
                  className="f-serif"
                  style={{ fontSize: 22, fontWeight: 450, color: "var(--blood)", margin: 0 }}
                >
                  deleting account…
                </h3>
                <p
                  className="f-serif"
                  style={{
                    fontSize: 14,
                    color: "var(--ink-soft)",
                    fontStyle: "italic",
                    margin: 0,
                  }}
                >
                  removing your account and all data.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <div>
        <SettingsRow label="Clear trash now">
          <SettingsButton onClick={handleClearTrash} disabled={clearingTrash}>
            {clearingTrash ? "Clearing…" : "Clear"}
          </SettingsButton>
        </SettingsRow>
        {trashMsg && (
          <p
            className="f-sans"
            style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: -10, marginBottom: 8 }}
          >
            {trashMsg}
          </p>
        )}

        <SettingsRow label="Reset concept graph" hint="we'll re-extract from all entries.">
          <SettingsButton onClick={handleResetGraph} disabled={resettingGraph}>
            {resettingGraph ? "Resetting…" : "Reset"}
          </SettingsButton>
        </SettingsRow>
        {graphMsg && (
          <p
            className="f-sans"
            style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: -10, marginBottom: 8 }}
          >
            {graphMsg}
          </p>
        )}

        {isOwner && (
          <SettingsRow
            label={`Delete this brain`}
            hint={
              <>
                permanently remove <strong style={{ color: "var(--ink-soft)" }}>{activeBrain.name}</strong>{" "}
                and all its entries.
              </>
            }
          >
            <SettingsButton
              onClick={handleDeleteBrain}
              disabled={deletingBrain}
              danger
            >
              {deletingBrain
                ? "Deleting…"
                : confirmDeleteBrain
                  ? "Tap to confirm"
                  : "Delete brain"}
            </SettingsButton>
          </SettingsRow>
        )}
        {brainError && (
          <p
            className="f-sans"
            style={{ fontSize: 12, color: "var(--blood)", marginTop: -10, marginBottom: 8 }}
          >
            {brainError}
          </p>
        )}

        <SettingsRow
          label="Export & delete account"
          hint="we email you a zip of everything, then scrub you within 48 hours."
          last
        >
          <SettingsButton onClick={() => setModalStep("ask-export")} danger>
            Export & delete
          </SettingsButton>
        </SettingsRow>
      </div>
    </>
  );
}
