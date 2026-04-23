import { useState } from "react";
import { updateProviderSettings, getAnthropicKey, getAnthropicModel, getOpenAIKey, getOpenAIModel, getGeminiKey, getGeminiByokModel, getGroqKey } from "../../lib/aiSettings";
import SettingsRow, { SettingsButton } from "./SettingsRow";

const ANTHROPIC_MODELS = [
  { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];
const OPENAI_MODELS = [
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
  { id: "o3-mini", label: "o3-mini" },
  { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
];
const GEMINI_MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
];

function StatusDot({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: on ? "var(--moss)" : "var(--ink-ghost)", flexShrink: 0 }} />
  );
}

const selectStyle: React.CSSProperties = {
  height: 32, padding: "0 10px", borderRadius: 8, fontSize: 13,
  background: "var(--surface)", border: "1px solid var(--line)",
  color: "var(--ink)", cursor: "pointer", outline: "none", maxWidth: 200,
};

const inputStyle: React.CSSProperties = {
  flex: 1, height: 36, padding: "0 12px", borderRadius: 8, fontSize: 13,
  background: "var(--surface)", border: "1px solid var(--line)",
  color: "var(--ink)", outline: "none", fontFamily: "var(--f-mono)",
};

interface ProviderCardProps {
  label: string;
  description: string;
  currentKey: string | null;
  currentModel: string;
  models: { id: string; label: string }[];
  keyField: string;
  modelField: string;
  last?: boolean;
}

function ProviderCard({ label, description, currentKey, currentModel, models, keyField, modelField, last }: ProviderCardProps) {
  const [editing, setEditing] = useState(false);
  const [draftKey, setDraftKey] = useState("");
  const [draftModel, setDraftModel] = useState(currentModel);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const masked = currentKey ? `${currentKey.slice(0, 8)}…${currentKey.slice(-4)}` : null;
  const showInput = !currentKey || editing;
  const modelChanged = draftModel !== currentModel;

  async function save() {
    setSaving(true);
    setMsg(null);
    const payload: Record<string, string | null> = { [modelField]: draftModel };
    if (showInput && draftKey.trim()) payload[keyField] = draftKey.trim();
    const { error } = await updateProviderSettings(payload as any);
    setSaving(false);
    if (error) { setMsg(`Error: ${error}`); return; }
    setMsg("Saved.");
    setEditing(false);
    setDraftKey("");
  }

  async function remove() {
    setSaving(true);
    setMsg(null);
    const { error } = await updateProviderSettings({ [keyField]: null } as any);
    setSaving(false);
    if (error) { setMsg(`Error: ${error}`); return; }
    setMsg("Key removed.");
  }

  return (
    <div style={{ borderBottom: last ? "none" : "1px solid var(--line-soft)", padding: "18px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 12 }}>
        <div>
          <div className="f-serif" style={{ fontSize: 16, fontWeight: 450, color: "var(--ink)" }}>{label}</div>
          <div className="f-serif" style={{ fontSize: 13, color: "var(--ink-faint)", fontStyle: "italic", marginTop: 2 }}>{description}</div>
        </div>
        <StatusDot on={!!currentKey} />
      </div>

      {/* Model selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span className="f-sans" style={{ fontSize: 12, color: "var(--ink-ghost)", minWidth: 42 }}>Model</span>
        <select value={draftModel} onChange={(e) => setDraftModel(e.target.value)} style={selectStyle}>
          {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        {!showInput && modelChanged && (
          <SettingsButton onClick={save} disabled={saving}>{saving ? "Saving…" : "Save model"}</SettingsButton>
        )}
      </div>

      {/* Key area */}
      {showInput ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="password"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            placeholder={editing ? "enter new key" : "paste API key"}
            style={inputStyle}
            autoComplete="off"
          />
          {editing && (
            <SettingsButton onClick={() => { setEditing(false); setDraftKey(""); }}>Cancel</SettingsButton>
          )}
          <SettingsButton onClick={save} disabled={saving || !draftKey.trim()}>
            {saving ? "Saving…" : "Save"}
          </SettingsButton>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <code className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)", flex: 1 }}>{masked}</code>
          <SettingsButton onClick={() => { setEditing(true); setDraftKey(""); }}>Change</SettingsButton>
          <SettingsButton onClick={remove} danger disabled={saving}>Remove</SettingsButton>
        </div>
      )}

      {msg && (
        <p className="f-sans" style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("Error") ? "var(--blood)" : "var(--moss)" }}>
          {msg}
        </p>
      )}
    </div>
  );
}

export default function ProvidersTab(_props?: { activeBrain?: any }) {
  const [groqDraft, setGroqDraft] = useState("");
  const [groqSaving, setGroqSaving] = useState(false);
  const [groqMsg, setGroqMsg] = useState<string | null>(null);
  const groqKey = getGroqKey();

  async function saveGroq() {
    if (!groqDraft.trim()) return;
    setGroqSaving(true);
    setGroqMsg(null);
    const { error } = await updateProviderSettings({ groq_key: groqDraft.trim() } as any);
    setGroqSaving(false);
    if (error) { setGroqMsg(`Error: ${error}`); return; }
    setGroqMsg("Saved.");
    setGroqDraft("");
  }

  return (
    <div>
      <ProviderCard
        label="Claude"
        description="bring your own Anthropic key to use Claude models."
        currentKey={getAnthropicKey()}
        currentModel={getAnthropicModel()}
        models={ANTHROPIC_MODELS}
        keyField="anthropic_key"
        modelField="anthropic_model"
      />
      <ProviderCard
        label="OpenAI"
        description="bring your own OpenAI key to use GPT models."
        currentKey={getOpenAIKey()}
        currentModel={getOpenAIModel()}
        models={OPENAI_MODELS}
        keyField="openai_key"
        modelField="openai_model"
      />
      <ProviderCard
        label="Google Gemini"
        description="bring your own Gemini key to override Everion's managed model."
        currentKey={getGeminiKey()}
        currentModel={getGeminiByokModel()}
        models={GEMINI_MODELS}
        keyField="gemini_key"
        modelField="gemini_byok_model"
      />

      {/* Groq — transcription only, no model selector */}
      <div style={{ paddingTop: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div className="f-serif" style={{ fontSize: 16, fontWeight: 450, color: "var(--ink)" }}>Groq</div>
            <div className="f-serif" style={{ fontSize: 13, color: "var(--ink-faint)", fontStyle: "italic", marginTop: 2 }}>bring your own Groq key for fast voice transcription.</div>
          </div>
          <StatusDot on={!!groqKey} />
        </div>
        {groqKey ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <code className="f-sans" style={{ fontSize: 12, color: "var(--ink-faint)", flex: 1 }}>
              {groqKey.slice(0, 8)}…{groqKey.slice(-4)}
            </code>
            <SettingsButton onClick={() => setGroqDraft("")}>Change</SettingsButton>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="password" value={groqDraft} onChange={(e) => setGroqDraft(e.target.value)} placeholder="paste Groq API key" style={inputStyle} autoComplete="off" />
            <SettingsButton onClick={saveGroq} disabled={groqSaving || !groqDraft.trim()}>{groqSaving ? "Saving…" : "Save"}</SettingsButton>
          </div>
        )}
        {groqMsg && <p className="f-sans" style={{ fontSize: 12, marginTop: 8, color: groqMsg.startsWith("Error") ? "var(--blood)" : "var(--moss)" }}>{groqMsg}</p>}
      </div>
    </div>
  );
}
