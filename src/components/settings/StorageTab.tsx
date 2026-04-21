import { useState, useEffect } from "react";
import TrashView from "../../views/TrashView";
import type { Brain } from "../../types";
import { KEYS } from "../../lib/storageKeys";
import SettingsRow, { SettingsButton } from "./SettingsRow";

function fmt(n: number) {
  return n.toLocaleString();
}
function fmtBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

interface Props {
  activeBrain?: Brain;
}

export default function StorageTab({ activeBrain }: Props) {
  const [showTrash, setShowTrash] = useState(false);
  const [entryCount, setEntryCount] = useState(0);
  const [entriesThisMonth, setEntriesThisMonth] = useState(0);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(KEYS.ENTRIES_CACHE);
      if (cached) {
        const arr = JSON.parse(cached);
        if (Array.isArray(arr)) {
          setEntryCount(arr.length);
          const month = new Date().toISOString().slice(0, 7);
          setEntriesThisMonth(arr.filter((e: any) => e.created_at?.startsWith(month)).length);
        }
      }
    } catch (err) {
      console.error("[StorageTab]", err);
    }
  }, []);

  const supabaseEstimateBytes = entryCount * 5 * 1024;

  return (
    <div>
      <SettingsRow
        label="Entries"
        hint={`${fmt(entryCount)} entries · ${fmtBytes(supabaseEstimateBytes)} on device · ${fmt(entriesThisMonth)} added this month`}
      >
        <SettingsButton
          onClick={() => {
            const a = document.createElement("a");
            a.href = `/api/export${activeBrain?.id ? `?brain_id=${activeBrain.id}` : ""}`;
            a.click();
          }}
        >
          Export all
        </SettingsButton>
      </SettingsRow>

      <SettingsRow label="Trash" hint="deleted entries clear automatically after 30 days.">
        <SettingsButton onClick={() => setShowTrash((s) => !s)}>
          {showTrash ? "Hide" : "View"}
        </SettingsButton>
      </SettingsRow>
      {showTrash && (
        <div
          style={{
            padding: "0 0 18px",
            borderBottom: "1px solid var(--line-soft)",
          }}
        >
          <TrashView brainId={activeBrain?.id} />
        </div>
      )}

      <SettingsRow label="Onboarding" hint="see the welcome flow again." last>
        <SettingsButton
          onClick={() => {
            localStorage.removeItem("openbrain_onboarded");
            window.dispatchEvent(new CustomEvent("openbrain:restart-onboarding"));
          }}
        >
          Restart
        </SettingsButton>
      </SettingsRow>
    </div>
  );
}
