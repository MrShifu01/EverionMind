import { useState } from "react";
import ProvidersTab from "./ProvidersTab";
import SettingsRow, { SettingsButton, SettingsExpand } from "./SettingsRow";
import type { Brain } from "../../types";

interface Props {
  activeBrain?: Brain;
  isAdmin?: boolean;
}

function StatusDot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: on ? "var(--moss)" : "var(--ink-ghost)",
        flexShrink: 0,
      }}
    />
  );
}

export default function AITab({ activeBrain }: Props) {
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<{ processed: number; remaining: number } | null>(null);
  const [byokOpen, setByokOpen] = useState(false);

  async function runEnrichNow() {
    if (!activeBrain?.id || enriching) return;
    setEnriching(true);
    setEnrichResult(null);
    try {
      const r = await fetch(`/api/entries?action=enrich-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brain_id: activeBrain.id, batch_size: 10 }),
      });
      if (r.ok) setEnrichResult(await r.json());
    } finally {
      setEnriching(false);
    }
  }

  return (
    <div>
      <SettingsRow
        label="Provider"
        hint="powers enrichment, chat, and parsing — managed by Everion."
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StatusDot on />
          <span className="f-sans" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            Google Gemini
          </span>
        </div>
      </SettingsRow>

      <SettingsRow
        label="Auto-enrichment"
        hint="entries are enriched automatically after capture. cards show a pulsing dot while processing."
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StatusDot on />
          <SettingsButton onClick={runEnrichNow} disabled={enriching || !activeBrain?.id}>
            {enriching ? "Running…" : "Run now"}
          </SettingsButton>
        </div>
      </SettingsRow>
      {enrichResult && (
        <SettingsExpand open>
          <p
            className="f-sans"
            style={{ fontSize: 13, color: "var(--ink-soft)", margin: 0, lineHeight: 1.5 }}
          >
            Processed {enrichResult.processed}
            {enrichResult.remaining > 0
              ? ` · ${enrichResult.remaining} remaining`
              : " · all up to date"}
          </p>
        </SettingsExpand>
      )}

      <SettingsRow
        label="Bring your own keys"
        hint="optional — connect anthropic, openai, gemini, or groq with your own api key."
        last={!byokOpen}
      >
        <SettingsButton onClick={() => setByokOpen((v) => !v)}>
          {byokOpen ? "Done" : "Manage"}
        </SettingsButton>
      </SettingsRow>
      <SettingsExpand open={byokOpen} last>
        <ProvidersTab activeBrain={activeBrain} />
      </SettingsExpand>
    </div>
  );
}
