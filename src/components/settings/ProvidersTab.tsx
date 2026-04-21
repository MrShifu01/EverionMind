import { useState } from "react";
import {
  clearAISettingsCache,
  persistKeyToDb,
  getGroqKey,
  getGeminiKey,
} from "../../lib/aiSettings";
import SettingsRow, { SettingsButton } from "./SettingsRow";

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

export default function ProvidersTab(_props?: { activeBrain?: any }) {
  const groqKey = getGroqKey();
  const geminiKey = getGeminiKey();
  const hasStoredKeys = !!(groqKey || geminiKey);
  const [clearing, setClearing] = useState(false);
  const [clearMsg, setClearMsg] = useState<string | null>(null);

  async function clearAllKeys() {
    setClearing(true);
    setClearMsg(null);
    const { error } = await persistKeyToDb({ groq_key: null, gemini_key: null });
    clearAISettingsCache();
    setClearMsg(error ? `error: ${error}` : "all stored keys removed.");
    setClearing(false);
  }

  const maskKey = (k?: string | null) =>
    k && k.length > 6 ? `${k.slice(0, 6)}…${k.slice(-4)}` : k ?? "";

  // Server-managed providers surface as "routed via server" rather than a
  // user-editable key. Stored legacy keys show their mask + a Remove button.
  const providers: {
    label: string;
    connected: boolean;
    hint: string;
    button: { label: string; onClick?: () => void; disabled?: boolean };
  }[] = [
    {
      label: "Anthropic",
      connected: true,
      hint: "managed by everion — routed via our server.",
      button: { label: "Managed", disabled: true },
    },
    {
      label: "OpenAI",
      connected: true,
      hint: "managed by everion — routed via our server.",
      button: { label: "Managed", disabled: true },
    },
    {
      label: "Groq",
      connected: !!groqKey,
      hint: groqKey ? maskKey(groqKey) : "not set",
      button: { label: groqKey ? "Rotate" : "Add key" },
    },
    {
      label: "Google Gemini",
      connected: !!geminiKey,
      hint: geminiKey ? maskKey(geminiKey) : "not set",
      button: { label: geminiKey ? "Rotate" : "Add key" },
    },
  ];

  return (
    <div>
      {providers.map((p, idx) => (
        <SettingsRow
          key={p.label}
          label={p.label}
          hint={p.hint}
          last={idx === providers.length - 1 && !hasStoredKeys}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <StatusDot on={p.connected} />
            <SettingsButton onClick={p.button.onClick} disabled={p.button.disabled}>
              {p.button.label}
            </SettingsButton>
          </div>
        </SettingsRow>
      ))}

      {hasStoredKeys && (
        <SettingsRow
          label="Stored keys"
          hint="legacy keys from a previous configuration. safe to remove."
          last
        >
          <SettingsButton onClick={clearAllKeys} danger disabled={clearing}>
            {clearing ? "Clearing…" : "Remove all"}
          </SettingsButton>
        </SettingsRow>
      )}
      {clearMsg && (
        <p
          className="f-sans"
          style={{
            fontSize: 12,
            color: clearMsg.startsWith("error") ? "var(--blood)" : "var(--moss)",
            marginTop: 8,
          }}
        >
          {clearMsg}
        </p>
      )}
    </div>
  );
}
