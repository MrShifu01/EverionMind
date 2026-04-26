import { useState } from "react";
import type { Brain } from "../../types";
import SettingsRow, { SettingsToggle, SettingsValue } from "./SettingsRow";

const CONCEPT_KEY = "everion:brain:concept_extraction";
const EMBEDDINGS_KEY = "everion:brain:embeddings";

interface Props {
  activeBrain: Brain;
  onRefreshBrains?: () => void;
}

function loadPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === "true") return true;
    if (v === "false") return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

function savePref(key: string, value: boolean) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

export default function BrainTab({ activeBrain }: Props) {
  const [conceptOn, setConceptOn] = useState(() => loadPref(CONCEPT_KEY, true));
  const [embedOn, setEmbedOn] = useState(() => loadPref(EMBEDDINGS_KEY, true));

  return (
    <div>
      <SettingsRow label="Name">
        <SettingsValue>{activeBrain.name}</SettingsValue>
      </SettingsRow>

      <SettingsRow
        label="Concept extraction"
        hint="extract concepts from new entries automatically."
      >
        <SettingsToggle
          value={conceptOn}
          onChange={(v) => {
            setConceptOn(v);
            savePref(CONCEPT_KEY, v);
          }}
          ariaLabel="Concept extraction"
        />
      </SettingsRow>

      <SettingsRow label="Embeddings" hint="used for semantic search. stored on device." last>
        <SettingsToggle
          value={embedOn}
          onChange={(v) => {
            setEmbedOn(v);
            savePref(EMBEDDINGS_KEY, v);
          }}
          ariaLabel="Embeddings"
        />
      </SettingsRow>
    </div>
  );
}
