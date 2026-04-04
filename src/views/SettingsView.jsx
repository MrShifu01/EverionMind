import { useState, useEffect, useRef } from "react";
import { useTheme } from "../ThemeContext";
import { authFetch } from "../lib/authFetch";
import { aiFetch, getUserApiKey, getUserModel, setUserApiKey, setUserModel, getUserProvider, setUserProvider, getOpenRouterKey, setOpenRouterKey, getOpenRouterModel, setOpenRouterModel, getEmbedProvider, setEmbedProvider, getEmbedOpenAIKey, setEmbedOpenAIKey, getGeminiKey, setGeminiKey, getGroqKey, setGroqKey } from "../lib/aiFetch";
import { callAI } from "../lib/ai";
import { supabase } from "../lib/supabase";
import NotificationSettings from "../components/NotificationSettings";
import { PinGate, getStoredPinHash, removePin } from "../lib/pin";
import { MODELS } from "../config/models";
import { useBrain } from "../context/BrainContext";

/* ─── Telegram Panel ─── */
function TelegramPanel({ activeBrain }) {
  const { t } = useTheme();
  const [code, setCode] = useState(null);
  const [generating, setGenerating] = useState(false);

  const generateCode = async () => {
    setGenerating(true);
    try {
      const res = await authFetch("/api/brains?action=telegram-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brain_id: activeBrain.id }) });
      if (res.ok) { const d = await res.json(); setCode(d.code); }
    } catch {}
    setGenerating(false);
  };

  return (
    <div style={{ background: t.surface, borderRadius: 14, padding: "20px 24px", marginTop: 16, border: `1px solid ${t.border}` }}>
      <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: t.textSoft }}>💬 Telegram</p>
      <p style={{ margin: "0 0 12px", fontSize: 11, color: t.textDim }}>Connect Telegram to save entries by sending messages to the bot.</p>
      {code ? (
        <div style={{ background: t.bg, borderRadius: 10, padding: "12px 16px" }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: t.textMuted }}>Send this code to <strong>@TheOneAndOnlyOpenBrainBot</strong> on Telegram:</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, fontFamily: "monospace", color: "#4ECDC4", letterSpacing: 4 }}>{code}</p>
          <p style={{ margin: "6px 0 0", fontSize: 11, color: t.textFaint }}>Expires in 10 minutes</p>
        </div>
      ) : (
        <button onClick={generateCode} disabled={generating} style={{ padding: "9px 16px", background: "#4ECDC420", border: "1px solid #4ECDC440", borderRadius: 8, color: "#4ECDC4", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{generating ? "Generating…" : "Connect Telegram"}</button>
      )}
    </div>
  );
}

/* ─── Memory Editor ─── */
function MemoryEditor() {
  const { t } = useTheme();
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const MAX = 8000;
  useEffect(() => {
    authFetch("/api/memory").then(r => r.ok ? r.json() : {}).then(d => setContent(d.content || "")).catch(err => console.error('[SettingsView:MemoryEditor] Failed to load memory content', err));
  }, []);
  const save = async () => {
    setSaving(true);
    const res = await authFetch("/api/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
    setStatus(res.ok ? "saved" : "error");
    setSaving(false);
    setTimeout(() => setStatus(null), 3000);
  };
  return (
    <div style={{ background: t.surface, borderRadius: 14, padding: "20px 24px", marginTop: 16, border: `1px solid ${t.border}` }}>
      <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: t.textSoft }}>🧠 AI Memory Guide</p>
      <p style={{ margin: "0 0 10px", fontSize: 11, color: t.textDim }}>This Markdown guide is injected into every AI call so the model understands your context. Do not include passport numbers, IDs, or bank details.</p>
      <textarea value={content} onChange={e => setContent(e.target.value.slice(0, MAX))} rows={8} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textSoft, fontSize: 12, fontFamily: "monospace", lineHeight: 1.6, outline: "none", resize: "vertical" }} placeholder={"# OpenBrain Classification Guide\n\n## Business Context\n- ...\n\n## Personal Context\n- ..."} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ fontSize: 11, color: content.length > MAX * 0.9 ? "#FF6B35" : t.textFaint }}>{content.length}/{MAX}</span>
        <button onClick={save} disabled={saving} style={{ padding: "8px 16px", background: "#4ECDC420", border: "1px solid #4ECDC440", borderRadius: 8, color: "#4ECDC4", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          {saving ? "Saving…" : status === "saved" ? "✓ Saved" : status === "error" ? "✗ Failed" : "Save"}
        </button>
      </div>
    </div>
  );
}

/* ─── Export / Import Panel ─── */
function ExportImportPanel({ activeBrain }) {
  const { t } = useTheme();
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState(null);
  const fileRef = useRef(null);

  const handleExport = () => {
    const url = `/api/export?brain_id=${activeBrain.id}`;
    const a = document.createElement("a"); a.href = url; a.click();
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = "";
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.entries || !Array.isArray(data.entries)) { setImportStatus("invalid"); setTimeout(() => setImportStatus(null), 3000); return; }
      if (data.entries.length > 500) { setImportStatus("toobig"); setTimeout(() => setImportStatus(null), 3000); return; }
      setImporting(true);
      const res = await authFetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brain_id: activeBrain.id, entries: data.entries, options: { skip_duplicates: true } }) });
      const result = res.ok ? await res.json() : null;
      setImportStatus(result ? `imported:${result.imported}:${result.skipped}` : "error");
    } catch { setImportStatus("error"); }
    setImporting(false);
    setTimeout(() => setImportStatus(null), 5000);
  };

  const statusMsg = importStatus?.startsWith("imported:") ? (() => { const [,i,s] = importStatus.split(":"); return `✓ Imported ${i}, skipped ${s} duplicates`; })()
    : importStatus === "invalid" ? "✗ Invalid file format"
    : importStatus === "toobig" ? "✗ Max 500 entries per import"
    : importStatus === "error" ? "✗ Import failed" : null;

  return (
    <div style={{ background: t.surface, borderRadius: 14, padding: "20px 24px", marginTop: 16, border: `1px solid ${t.border}` }}>
      <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: t.textSoft }}>📦 Export / Import</p>
      <p style={{ margin: "0 0 14px", fontSize: 11, color: t.textDim }}>Export all entries from <strong>{activeBrain.name}</strong> as JSON, or import from a previous export.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={handleExport} style={{ padding: "9px 16px", background: "#4ECDC420", border: "1px solid #4ECDC440", borderRadius: 8, color: "#4ECDC4", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>⬇ Export Brain</button>
        <input type="file" accept=".json" ref={fileRef} onChange={handleImportFile} style={{ display: "none" }} />
        <button onClick={() => fileRef.current?.click()} disabled={importing} style={{ padding: "9px 16px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textMuted, fontSize: 12, fontWeight: 600, cursor: importing ? "default" : "pointer" }}>{importing ? "Importing…" : "⬆ Import Entries"}</button>
      </div>
      {statusMsg && <p style={{ margin: "8px 0 0", fontSize: 12, color: statusMsg.startsWith("✓") ? "#4ECDC4" : "#FF6B35" }}>{statusMsg}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SETTINGS VIEW
   ═══════════════════════════════════════════════════════════════ */
/* ─── Brain API Keys Panel ─── */
function BrainApiKeysPanel({ activeBrain }) {
  const { t } = useTheme();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [label, setLabel] = useState("");
  const [newKey, setNewKey] = useState(null); // shown once after generation
  const [copied, setCopied] = useState(false);

  const fetchKeys = async () => {
    if (!activeBrain?.id) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/brains?action=api-keys&brain_id=${activeBrain.id}`);
      if (res.ok) setKeys(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchKeys(); }, [activeBrain?.id]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await authFetch("/api/brains?action=generate-api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brain_id: activeBrain.id, label: label || "Default" }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data.api_key);
        setLabel("");
        fetchKeys();
      }
    } catch {}
    setGenerating(false);
  };

  const handleRevoke = async (keyId) => {
    try {
      await authFetch("/api/brains?action=api-key", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key_id: keyId, brain_id: activeBrain.id }),
      });
      setKeys(prev => prev.filter(k => k.id !== keyId));
    } catch {}
  };

  const copyKey = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!activeBrain) return null;
  const isOwner = activeBrain.myRole === "owner";
  if (!isOwner) {
    return (
      <div style={{ background: t.surface, borderRadius: 14, padding: "20px 24px", border: `1px solid ${t.border}` }}>
        <p style={{ margin: 0, fontSize: 13, color: t.textDim }}>Only the brain owner can manage API keys.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ background: t.surface, borderRadius: 14, padding: "20px 24px", marginBottom: 16, border: `1px solid ${t.border}` }}>
        <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: t.textSoft }}>🔑 API Keys — {activeBrain.name}</p>
        <p style={{ margin: "0 0 14px", fontSize: 11, color: t.textDim }}>
          Generate API keys to access this brain's data from external apps (calendar, to-do list, dashboards). Each key gives read access to entries and links.
        </p>

        {/* New key banner — shown once */}
        {newKey && (
          <div style={{ background: "#4ECDC410", border: "1px solid #4ECDC430", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
            <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: "#4ECDC4" }}>Key created — copy it now, it won't be shown again</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <code style={{ flex: 1, padding: "8px 12px", background: t.bg, borderRadius: 6, fontSize: 12, color: t.textSoft, fontFamily: "monospace", wordBreak: "break-all", border: `1px solid ${t.border}` }}>{newKey}</code>
              <button onClick={() => copyKey(newKey)} style={{ padding: "8px 14px", background: "#4ECDC420", border: "1px solid #4ECDC440", borderRadius: 8, color: "#4ECDC4", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>{copied ? "Copied!" : "Copy"}</button>
            </div>
            <button onClick={() => setNewKey(null)} style={{ marginTop: 8, padding: "4px 10px", background: "none", border: "none", color: t.textFaint, fontSize: 11, cursor: "pointer" }}>Dismiss</button>
          </div>
        )}

        {/* Generate new key */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Key label (e.g. Calendar App)"
            maxLength={100}
            style={{ flex: 1, minWidth: 140, padding: "9px 12px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textSoft, fontSize: 13, outline: "none" }}
          />
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{ padding: "9px 16px", background: "#4ECDC420", border: "1px solid #4ECDC440", borderRadius: 8, color: "#4ECDC4", fontSize: 12, fontWeight: 600, cursor: generating ? "default" : "pointer", flexShrink: 0 }}
          >
            {generating ? "Generating…" : "+ Generate Key"}
          </button>
        </div>

        {/* Existing keys */}
        {loading && <p style={{ fontSize: 12, color: t.textDim }}>Loading keys…</p>}
        {!loading && keys.length === 0 && (
          <p style={{ fontSize: 12, color: t.textFaint, margin: 0, fontStyle: "italic" }}>No API keys yet. Generate one to get started.</p>
        )}
        {keys.map(k => (
          <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${t.border}` }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: t.textSoft }}>{k.label}</p>
              <p style={{ margin: "2px 0 0", fontSize: 10, color: t.textFaint }}>
                Created {new Date(k.created_at).toLocaleDateString()}
                {k.last_used_at && ` · Last used ${new Date(k.last_used_at).toLocaleDateString()}`}
              </p>
            </div>
            <button onClick={() => handleRevoke(k.id)} style={{ padding: "5px 12px", background: "#FF6B3515", border: "1px solid #FF6B3530", borderRadius: 6, color: "#FF6B35", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Revoke</button>
          </div>
        ))}
      </div>

      {/* Usage examples */}
      <div style={{ background: t.surface, borderRadius: 14, padding: "20px 24px", border: `1px solid ${t.border}` }}>
        <p style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600, color: t.textSoft }}>Usage</p>
        <p style={{ margin: "0 0 8px", fontSize: 11, color: t.textDim }}>Use the API key to fetch data from your brain in external apps:</p>
        <div style={{ background: t.bg, borderRadius: 8, padding: "12px 14px", border: `1px solid ${t.border}` }}>
          <code style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.8, whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
{`# Get all entries
GET /api/external?action=entries
Header: X-Brain-Api-Key: ob_...

# Filter by type
GET /api/external?action=entries&type=reminder

# Entries since a date
GET /api/external?action=entries&since=2024-01-01

# Get relationships
GET /api/external?action=links

# Brain metadata
GET /api/external?action=brain`}
          </code>
        </div>
      </div>
    </div>
  );
}

export default function SettingsView() {
  const { t } = useTheme();
  const { activeBrain, canInvite, canManageMembers, refresh: onRefreshBrains } = useBrain();
  const [settingsTab, setSettingsTab] = useState("general");
  const [testStatus, setTestStatus] = useState(null);
  const [email, setEmail] = useState("");
  const [byoKey, setByoKey] = useState(() => getUserApiKey() || "");
  const [byoProvider, setByoProvider] = useState(() => getUserProvider());
  const [byoModel, setByoModel] = useState(() => getUserModel());
  const [orKey, setOrKey] = useState(() => getOpenRouterKey() || "");
  const [orModel, setOrModel] = useState(() => getOpenRouterModel() || "google/gemini-2.0-flash-exp:free");
  const [orModels, setOrModels] = useState([]);
  const [showKey, setShowKey] = useState(false);
  const [byoTestStatus, setByoTestStatus] = useState(null);
  const [pinSet, setPinSet] = useState(() => !!getStoredPinHash());
  const [showPinModal, setShowPinModal] = useState(false);
  // Groq (voice transcription)
  const [groqKeyVal, setGroqKeyVal] = useState(() => getGroqKey() || "");
  const [showGroqKey, setShowGroqKey] = useState(false);
  // Embedding provider
  const [embedProvider, setEmbedProviderState] = useState(() => getEmbedProvider());
  const [embedOpenAIKey, setEmbedOpenAIKeyState] = useState(() => getEmbedOpenAIKey() || "");
  const [geminiKey, setGeminiKeyState] = useState(() => getGeminiKey() || "");
  const [embedStatus, setEmbedStatus] = useState(null); // "running" | "done:N:M" | "error"
  const [showEmbedKey, setShowEmbedKey] = useState(false);
  // Brain members
  const [members, setMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteStatus, setInviteStatus] = useState(null);
  useEffect(() => { supabase.auth.getUser().then(({ data: { user } }) => setEmail(user?.email || "")); }, []);
  useEffect(() => {
    if (!activeBrain?.id) return;
    authFetch(`/api/brains?action=members&brain_id=${activeBrain.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(setMembers)
      .catch(err => console.error('[SettingsView:BrainMembers] Failed to fetch brain members', err));
  }, [activeBrain?.id]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteStatus("sending");
    try {
      const res = await authFetch("/api/brains?action=invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brain_id: activeBrain.id, email: inviteEmail.trim(), role: inviteRole }) });
      if (res.ok) { setInviteStatus("sent"); setInviteEmail(""); setTimeout(() => setInviteStatus(null), 3000); }
      else { setInviteStatus("error"); setTimeout(() => setInviteStatus(null), 3000); }
    } catch { setInviteStatus("error"); setTimeout(() => setInviteStatus(null), 3000); }
  };

  const handleRoleChange = async (userId, newRole) => {
    const res = await authFetch("/api/brains?action=member-role", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brain_id: activeBrain.id, user_id: userId, role: newRole }) });
    if (res.ok) setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role: newRole } : m));
  };

  const handleRemoveMember = async (userId) => {
    const res = await authFetch("/api/brains?action=member", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brain_id: activeBrain.id, user_id: userId }) });
    if (res.ok) { setMembers(prev => prev.filter(m => m.user_id !== userId)); if (onRefreshBrains) onRefreshBrains(); }
  };

  const ANTHROPIC_MODELS = MODELS.ANTHROPIC;
  const OPENAI_MODELS = MODELS.OPENAI;
  const OR_SHORTLIST = MODELS.OPENROUTER;
  const modelOptions = byoProvider === "openai" ? OPENAI_MODELS : ANTHROPIC_MODELS;

  const [keySaved, setKeySaved] = useState(false);
  const saveByoKey = (key) => { setByoKey(key); setKeySaved(false); };
  const handleSaveKey = () => {
    setUserApiKey(byoKey || null);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  };
  const saveByoProvider = (p) => {
    setByoProvider(p); setUserProvider(p);
    if (p === "openai") { if (!OPENAI_MODELS.includes(byoModel)) { setByoModel(OPENAI_MODELS[0]); setUserModel(OPENAI_MODELS[0]); } }
    else if (p === "anthropic") { if (!ANTHROPIC_MODELS.includes(byoModel)) { setByoModel(ANTHROPIC_MODELS[0]); setUserModel(ANTHROPIC_MODELS[0]); } }
    else if (p === "openrouter" && orKey) { fetchOrModels(orKey); }
  };
  const saveByoModel = (m) => { setByoModel(m); setUserModel(m); };
  const saveOrKey = (key) => { setOrKey(key); setOpenRouterKey(key || null); if (key) fetchOrModels(key); };
  const saveOrModel = (m) => { setOrModel(m); setOpenRouterModel(m); };

  const saveEmbedProvider = (p) => { setEmbedProviderState(p); setEmbedProvider(p); };
  const saveEmbedOpenAIKey = (k) => { setEmbedOpenAIKeyState(k); setEmbedOpenAIKey(k || null); };
  const saveGeminiKey = (k) => { setGeminiKeyState(k); setGeminiKey(k || null); };

  const handleReembed = async (force = false) => {
    if (!activeBrain?.id) return;
    const key = embedProvider === "google" ? geminiKey : embedOpenAIKey;
    if (!key) return;
    setEmbedStatus("running");
    let totalProcessed = 0, totalFailed = 0;
    try {
      // Process in small batches (5 entries per request) to avoid Vercel 10s timeout
      for (let i = 0; i < 100; i++) {
        const res = await authFetch("/api/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Embed-Provider": embedProvider, "X-Embed-Key": key },
          body: JSON.stringify({ brain_id: activeBrain.id, batch: true, force }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          if (totalProcessed === 0) { setEmbedStatus(`error:${errData?.error || res.status}`); setTimeout(() => setEmbedStatus(null), 10000); return; }
          break;
        }
        const data = await res.json();
        totalProcessed += data.processed;
        totalFailed += data.failed ?? 0;
        setEmbedStatus(`running:${totalProcessed}`);
        if ((data.remaining ?? 0) <= 0) break;
      }
      setEmbedStatus(`done:${totalProcessed}:${totalFailed}`);
    } catch (e) {
      if (totalProcessed === 0) { setEmbedStatus(`error:${e.message || "Network error"}`); }
      else { setEmbedStatus(`done:${totalProcessed}:${totalFailed}`); }
    }
    setTimeout(() => setEmbedStatus(null), 10000);
  };

  const fetchOrModels = async (key) => {
    const cached = sessionStorage.getItem("openbrain_or_models");
    if (cached) { try { setOrModels(JSON.parse(cached)); return; } catch {} }
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models", { headers: { Authorization: `Bearer ${key}` } });
      if (res.ok) {
        const data = await res.json();
        const models = (data.data || []).map(m => ({ id: m.id, name: m.name || m.id, pricing: m.pricing }));
        setOrModels(models);
        sessionStorage.setItem("openbrain_or_models", JSON.stringify(models));
      }
    } catch {}
  };

  const testByoKey = async () => {
    const key = byoProvider === "openrouter" ? orKey : byoKey;
    if (!key) return;
    setByoTestStatus("testing");
    try {
      const endpoint = byoProvider === "openai" ? "/api/openai" : byoProvider === "openrouter" ? "/api/openrouter" : "/api/anthropic";
      const model = byoProvider === "openrouter" ? orModel : byoModel;
      const body = { model, max_tokens: 10, messages: [{ role: "user", content: "Say ok" }] };
      const { data: { session } } = await supabase.auth.getSession();
      const authH = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "X-User-Api-Key": key, ...authH }, body: JSON.stringify(body) });
      setByoTestStatus(res.ok ? "ok" : "fail");
    } catch { setByoTestStatus("fail"); }
    setTimeout(() => setByoTestStatus(null), 3000);
  };

  const testAI = async () => {
    setTestStatus("testing-ai");
    try {
      const res = await callAI({ max_tokens: 10, messages: [{ role: "user", content: "Say ok" }] });
      setTestStatus(res.ok ? "ai-success" : "ai-fail");
    }
    catch { setTestStatus("ai-fail"); }
    setTimeout(() => setTestStatus(null), 3000);
  };
  const testDB = async () => {
    setTestStatus("testing");
    try { const res = await authFetch("/api/health"); setTestStatus(res.ok ? "success" : "fail"); }
    catch { setTestStatus("fail"); }
    setTimeout(() => setTestStatus(null), 3000);
  };
  const TABS = [
    { id: "general",      label: "General",       icon: "⚙" },
    { id: "ai",           label: "AI Keys",       icon: "🤖" },
    { id: "brain-api",    label: "Brain API",     icon: "🔑" },
    { id: "integrations", label: "Integrations",  icon: "🔗" },
    { id: "security",     label: "Security",      icon: "🔒" },
  ];

  const btn = { padding: "10px 20px", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" };
  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px", color: t.text }}>Settings</h2>
      <p style={{ fontSize: 12, color: t.textDim, margin: "0 0 16px" }}>Manage your account, keys, and integrations.</p>

      {/* ── Tab Navigation ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSettingsTab(tab.id)}
            style={{
              padding: "8px 14px", borderRadius: 20, border: settingsTab === tab.id ? `1px solid ${t.accent}` : `1px solid ${t.border}`,
              background: settingsTab === tab.id ? `${t.accent}20` : t.surface,
              color: settingsTab === tab.id ? t.accent : t.textDim,
              fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
              display: "flex", alignItems: "center", gap: 5, minHeight: 40,
            }}
          >
            <span style={{ fontSize: 13 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════
          GENERAL TAB
          ══════════════════════════════════════════════ */}
      {settingsTab === "general" && <>
      <div style={{ background: t.surface, borderRadius: 14, padding: "20px 24px", marginBottom: 16, border: `1px solid ${t.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div><p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: t.textSoft }}>Signed in as</p><p style={{ margin: "4px 0 0", fontSize: 12, color: t.textMuted }}>{email}</p></div>
          <button onClick={() => supabase.auth.signOut()} style={{ ...btn, background: "#FF6B3520", color: "#FF6B35" }}>Sign out</button>
        </div>
      </div>
      <div style={{ background: t.surface, borderRadius: 14, padding: "20px 24px", marginBottom: 16, border: `1px solid ${t.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div><p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: t.textSoft }}>Claude AI (Haiku)</p><p style={{ margin: "4px 0 0", fontSize: 11, color: t.textDim }}>AI parsing and chat</p></div>
          <button onClick={testAI} style={{ ...btn, background: "#4ECDC420", color: "#4ECDC4" }}>{testStatus === "testing-ai" ? "Testing…" : testStatus === "ai-success" ? "✓ Connected" : testStatus === "ai-fail" ? "✗ Failed" : "Test"}</button>
        </div>
      </div>
      <div style={{ background: t.surface, borderRadius: 14, padding: "20px 24px", marginBottom: 16, border: `1px solid ${t.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div><p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: t.textSoft }}>Supabase Database</p><p style={{ margin: "4px 0 0", fontSize: 11, color: t.textDim }}>Memory storage</p></div>
          <button onClick={testDB} style={{ ...btn, background: "#4ECDC420", color: "#4ECDC4" }}>{testStatus === "testing" ? "Testing…" : testStatus === "success" ? "✓ Connected" : testStatus === "fail" ? "✗ Failed" : "Test"}</button>
        </div>
      </div>

      {/* Brain Members */}
      {activeBrain && (
        <div style={{ background: t.surface, borderRadius: 14, padding: "20px 24px", marginBottom: 16, border: `1px solid ${t.border}` }}>
          <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: t.textSoft }}>🧠 {activeBrain.name} — Members</p>
          {members.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              {members.map(m => (
                <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${t.border}` }}>
                  <span style={{ flex: 1, fontSize: 13, color: t.textSoft, fontFamily: "monospace" }}>{m.user_id.slice(0, 8)}…</span>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: m.role === "member" ? "#4ECDC420" : "#88888820", color: m.role === "member" ? "#4ECDC4" : "#888", fontWeight: 700, textTransform: "uppercase" }}>{m.role}</span>
                  {canManageMembers && (
                    <>
                      <select value={m.role} onChange={e => handleRoleChange(m.user_id, e.target.value)} style={{ padding: "3px 6px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 6, color: t.textSoft, fontSize: 11, cursor: "pointer" }}>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button onClick={() => handleRemoveMember(m.user_id)} style={{ padding: "3px 8px", background: "#FF6B3515", border: "1px solid #FF6B3530", borderRadius: 6, color: "#FF6B35", fontSize: 11, cursor: "pointer" }}>Remove</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {canInvite && (
            <>
              <p style={{ margin: "0 0 8px", fontSize: 12, color: t.textDim }}>Invite someone to this brain</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="their@email.com" type="email" style={{ flex: 2, minWidth: 140, padding: "9px 12px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textSoft, fontSize: 13, outline: "none" }} />
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ padding: "9px 10px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textSoft, fontSize: 12, cursor: "pointer" }}>
                  <option value="member">Member (can edit)</option>
                  <option value="viewer">Viewer (read-only)</option>
                </select>
                <button onClick={handleInvite} disabled={!inviteEmail.trim() || inviteStatus === "sending"} style={{ padding: "9px 16px", background: inviteEmail.trim() ? "#4ECDC420" : t.bg, border: `1px solid ${inviteEmail.trim() ? "#4ECDC440" : t.border}`, borderRadius: 8, color: inviteEmail.trim() ? "#4ECDC4" : t.textFaint, fontSize: 12, fontWeight: 600, cursor: inviteEmail.trim() ? "pointer" : "default" }}>
                  {inviteStatus === "sending" ? "…" : inviteStatus === "sent" ? "✓ Sent" : inviteStatus === "error" ? "✗ Failed" : "Invite"}
                </button>
              </div>
            </>
          )}
          {!canInvite && <p style={{ fontSize: 12, color: t.textDim, margin: 0 }}>Only the brain owner can invite members.</p>}
        </div>
      )}

      <div style={{ background: t.surface, borderRadius: 14, padding: "20px 24px", marginBottom: 16, border: `1px solid ${t.border}` }}>
        <NotificationSettings />
      </div>

      {/* AI Memory Guide */}
      <MemoryEditor activeBrain={activeBrain} />

      {/* Export / Import */}
      {activeBrain && <ExportImportPanel activeBrain={activeBrain} />}
      </>}

      {/* ══════════════════════════════════════════════
          AI KEYS TAB
          ══════════════════════════════════════════════ */}
      {settingsTab === "ai" && <>
      <div style={{ background: t.surface, borderRadius: 14, padding: "20px 24px", marginBottom: 16, border: `1px solid ${t.border}` }}>
        <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: t.textSoft }}>AI Provider</p>
        <p style={{ margin: "0 0 14px", fontSize: 11, color: t.textDim }}>Use your own API key — no OpenBrain credits deducted. Leave blank to use the shared key.</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {["anthropic", "openai", "openrouter"].map(p => (
            <button key={p} onClick={() => saveByoProvider(p)} style={{ padding: "6px 16px", borderRadius: 20, border: byoProvider === p ? "1px solid #4ECDC4" : `1px solid ${t.border}`, background: byoProvider === p ? "#4ECDC420" : t.bg, color: byoProvider === p ? "#4ECDC4" : t.textDim, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{p === "openrouter" ? "OpenRouter" : p.charAt(0).toUpperCase() + p.slice(1)}</button>
          ))}
        </div>
        {byoProvider === "openrouter" ? (
          <>
            <p style={{ margin: "0 0 6px", fontSize: 11, color: t.textDim }}>OpenRouter lets you use hundreds of models — including free ones — with one key. <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" style={{ color: "#4ECDC4" }}>Get a key →</a></p>
            <div style={{ marginBottom: 12 }}>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: t.textDim, fontWeight: 600 }}>OpenRouter API Key</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input type={showKey ? "text" : "password"} value={orKey} onChange={e => saveOrKey(e.target.value)} placeholder="sk-or-..." style={{ flex: 1, padding: "9px 12px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textSoft, fontSize: 13, fontFamily: "monospace", outline: "none" }} />
                <button onClick={() => setShowKey(s => !s)} style={{ padding: "9px 12px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textDim, cursor: "pointer", fontSize: 12 }}>{showKey ? "Hide" : "Show"}</button>
                <button onClick={testByoKey} disabled={!orKey} style={{ padding: "9px 14px", background: orKey ? "#4ECDC420" : t.bg, border: `1px solid ${orKey ? "#4ECDC440" : t.border}`, borderRadius: 8, color: orKey ? "#4ECDC4" : t.textFaint, cursor: orKey ? "pointer" : "default", fontSize: 12, fontWeight: 600 }}>{byoTestStatus === "testing" ? "…" : byoTestStatus === "ok" ? "✓" : byoTestStatus === "fail" ? "✗" : "Test"}</button>
              </div>
            </div>
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: t.textDim, fontWeight: 600 }}>Model {orModels.length > 0 && <span style={{ fontWeight: 400, color: t.textFaint }}>({orModels.length} available)</span>}</p>
              <select value={orModel} onChange={e => saveOrModel(e.target.value)} style={{ width: "100%", padding: "9px 12px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textSoft, fontSize: 13, outline: "none" }}>
                {(orModels.length > 0 ? orModels.map(m => ({ id: m.id, label: `${m.name}${m.pricing?.prompt ? ` — $${(+m.pricing.prompt * 1e6).toFixed(2)}/1M` : ""}` })) : OR_SHORTLIST.map(id => ({ id, label: id }))).map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              <p style={{ margin: "6px 0 0", fontSize: 10, color: t.textFaint }}>Tip: choose a model with ZDR (zero data retention) for sensitive entries.</p>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: t.textDim, fontWeight: 600 }}>API Key</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input type={showKey ? "text" : "password"} value={byoKey} onChange={e => saveByoKey(e.target.value)} placeholder={byoProvider === "openai" ? "sk-..." : "sk-ant-..."} style={{ flex: 1, padding: "9px 12px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textSoft, fontSize: 13, fontFamily: "monospace", outline: "none" }} />
                <button onClick={() => setShowKey(s => !s)} style={{ padding: "9px 12px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textDim, cursor: "pointer", fontSize: 12 }}>{showKey ? "Hide" : "Show"}</button>
                <button onClick={handleSaveKey} disabled={!byoKey} style={{ padding: "9px 14px", background: keySaved ? "#25D36620" : byoKey ? "#4ECDC420" : t.bg, border: `1px solid ${keySaved ? "#25D36640" : byoKey ? "#4ECDC440" : t.border}`, borderRadius: 8, color: keySaved ? "#25D366" : byoKey ? "#4ECDC4" : t.textFaint, cursor: byoKey ? "pointer" : "default", fontSize: 12, fontWeight: 600 }}>{keySaved ? "Saved!" : "Save"}</button>
                <button onClick={testByoKey} disabled={!byoKey} style={{ padding: "9px 14px", background: byoKey ? "#4ECDC420" : t.bg, border: `1px solid ${byoKey ? "#4ECDC440" : t.border}`, borderRadius: 8, color: byoKey ? "#4ECDC4" : t.textFaint, cursor: byoKey ? "pointer" : "default", fontSize: 12, fontWeight: 600 }}>{byoTestStatus === "testing" ? "…" : byoTestStatus === "ok" ? "✓" : byoTestStatus === "fail" ? "✗" : "Test"}</button>
              </div>
            </div>
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: t.textDim, fontWeight: 600 }}>Model</p>
              <select value={byoModel} onChange={e => saveByoModel(e.target.value)} style={{ width: "100%", padding: "9px 12px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textSoft, fontSize: 13, outline: "none" }}>
                {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Embedding Provider */}
      <div style={{ background: t.surface, borderRadius: 14, padding: "20px 24px", marginBottom: 16, border: `1px solid ${t.border}` }}>
        <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: t.textSoft }}>Semantic Search & RAG</p>
        <p style={{ margin: "0 0 14px", fontSize: 11, color: t.textDim }}>Powers semantic search, RAG chat, and smarter connection discovery. Requires a separate embedding API key — does not use your AI generation key.</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {["openai", "google"].map(p => (
            <button key={p} onClick={() => saveEmbedProvider(p)} style={{ padding: "6px 16px", borderRadius: 20, border: embedProvider === p ? "1px solid #A29BFE" : `1px solid ${t.border}`, background: embedProvider === p ? "#A29BFE20" : t.bg, color: embedProvider === p ? "#A29BFE" : t.textDim, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              {p === "openai" ? "OpenAI" : "Google"}
            </button>
          ))}
        </div>
        {embedProvider === "openai" ? (
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: "0 0 6px", fontSize: 11, color: t.textDim, fontWeight: 600 }}>OpenAI API Key <span style={{ fontWeight: 400, color: t.textFaint }}>(text-embedding-3-small)</span></p>
            <div style={{ display: "flex", gap: 8 }}>
              <input type={showEmbedKey ? "text" : "password"} value={embedOpenAIKey} onChange={e => saveEmbedOpenAIKey(e.target.value)} placeholder="sk-..." style={{ flex: 1, padding: "9px 12px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textSoft, fontSize: 13, fontFamily: "monospace", outline: "none" }} />
              <button onClick={() => setShowEmbedKey(s => !s)} style={{ padding: "9px 12px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textDim, cursor: "pointer", fontSize: 12 }}>{showEmbedKey ? "Hide" : "Show"}</button>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: "0 0 6px", fontSize: 11, color: t.textDim, fontWeight: 600 }}>Google Gemini API Key <span style={{ fontWeight: 400, color: t.textFaint }}>(text-embedding-004)</span></p>
            <div style={{ display: "flex", gap: 8 }}>
              <input type={showEmbedKey ? "text" : "password"} value={geminiKey} onChange={e => saveGeminiKey(e.target.value)} placeholder="AIza..." style={{ flex: 1, padding: "9px 12px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textSoft, fontSize: 13, fontFamily: "monospace", outline: "none" }} />
              <button onClick={() => setShowEmbedKey(s => !s)} style={{ padding: "9px 12px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textDim, cursor: "pointer", fontSize: 12 }}>{showEmbedKey ? "Hide" : "Show"}</button>
            </div>
          </div>
        )}
        {activeBrain && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              onClick={handleReembed}
              disabled={embedStatus === "running" || !(embedProvider === "google" ? geminiKey : embedOpenAIKey)}
              style={{ padding: "9px 16px", background: (embedProvider === "google" ? geminiKey : embedOpenAIKey) ? "#A29BFE20" : t.bg, border: `1px solid ${(embedProvider === "google" ? geminiKey : embedOpenAIKey) ? "#A29BFE40" : t.border}`, borderRadius: 8, color: (embedProvider === "google" ? geminiKey : embedOpenAIKey) ? "#A29BFE" : t.textFaint, fontSize: 12, fontWeight: 600, cursor: (embedProvider === "google" ? geminiKey : embedOpenAIKey) ? "pointer" : "default" }}
            >
              {embedStatus?.startsWith("running") ? `Embedding…${embedStatus.includes(":") ? ` (${embedStatus.split(":")[1]})` : ""}` : "Embed new"}
            </button>
            <button
              onClick={() => handleReembed(true)}
              disabled={embedStatus?.startsWith("running") || !(embedProvider === "google" ? geminiKey : embedOpenAIKey)}
              style={{ padding: "9px 16px", background: (embedProvider === "google" ? geminiKey : embedOpenAIKey) ? "#FF6B3520" : t.bg, border: `1px solid ${(embedProvider === "google" ? geminiKey : embedOpenAIKey) ? "#FF6B3540" : t.border}`, borderRadius: 8, color: (embedProvider === "google" ? geminiKey : embedOpenAIKey) ? "#FF6B35" : t.textFaint, fontSize: 12, fontWeight: 600, cursor: (embedProvider === "google" ? geminiKey : embedOpenAIKey) ? "pointer" : "default" }}
            >
              Re-embed all
            </button>
            {embedStatus && !embedStatus.startsWith("running") && (
              <span style={{ fontSize: 12, color: embedStatus.startsWith("error") ? "#FF6B35" : "#A29BFE" }}>
                {embedStatus.startsWith("error") ? `✗ ${embedStatus.split(":").slice(1).join(":") || "Failed"}` : (() => { const [, n, f] = embedStatus.split(":"); return `✓ ${n} embedded${+f > 0 ? `, ${f} failed` : ""}`; })()}
              </span>
            )}
          </div>
        )}
        <p style={{ margin: "10px 0 0", fontSize: 10, color: t.textFaint }}>New entries are embedded automatically. Use "Embed all entries" to backfill existing ones or after switching providers.</p>
      </div>

      {/* Voice Transcription */}
      <div style={{ background: t.surface, borderRadius: 14, padding: "20px 24px", marginBottom: 16, border: `1px solid ${t.border}` }}>
        <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: t.textSoft }}>🎤 Voice Transcription</p>
        <p style={{ margin: "0 0 14px", fontSize: 11, color: t.textDim }}>Powers the microphone button in Quick Capture. Uses Groq's Whisper (fast, free tier available). Without a key, falls back to browser speech recognition. <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{ color: "#4ECDC4" }}>Get a free Groq key →</a></p>
        <div>
          <p style={{ margin: "0 0 6px", fontSize: 11, color: t.textDim, fontWeight: 600 }}>Groq API Key <span style={{ fontWeight: 400, color: t.textFaint }}>(whisper-large-v3-turbo)</span></p>
          <div style={{ display: "flex", gap: 8 }}>
            <input type={showGroqKey ? "text" : "password"} value={groqKeyVal} onChange={e => { setGroqKeyVal(e.target.value); setGroqKey(e.target.value); }} placeholder="gsk_..." style={{ flex: 1, padding: "9px 12px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textSoft, fontSize: 13, fontFamily: "monospace", outline: "none" }} />
            <button onClick={() => setShowGroqKey(s => !s)} style={{ padding: "9px 12px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textDim, cursor: "pointer", fontSize: 12 }}>{showGroqKey ? "Hide" : "Show"}</button>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 10, color: t.textFaint }}>Also works with an OpenAI key (set above) — but Groq is faster and free.</p>
        </div>
      </div>

      </>}

      {/* ══════════════════════════════════════════════
          BRAIN API TAB
          ══════════════════════════════════════════════ */}
      {settingsTab === "brain-api" && <BrainApiKeysPanel activeBrain={activeBrain} />}

      {/* ══════════════════════════════════════════════
          INTEGRATIONS TAB
          ══════════════════════════════════════════════ */}
      {settingsTab === "integrations" && <>
        {activeBrain && <TelegramPanel activeBrain={activeBrain} />}
        {!activeBrain && <p style={{ fontSize: 13, color: t.textDim, padding: 20 }}>Select a brain to configure integrations.</p>}
      </>}

      {/* ══════════════════════════════════════════════
          SECURITY TAB
          ══════════════════════════════════════════════ */}
      {settingsTab === "security" && <>
        <div style={{ background: t.surface, borderRadius: 14, padding: "20px 24px", border: `1px solid ${t.border}` }}>
          <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: t.textSoft }}>🔒 Security PIN</p>
          <p style={{ margin: "0 0 14px", fontSize: 11, color: t.textDim }}>
            {pinSet ? "PIN is active — sensitive AI responses require it before being revealed." : "No PIN set — AI responses with passwords or credentials are shown unguarded."}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowPinModal(true)} style={{ ...btn, background: "#4ECDC420", color: "#4ECDC4" }}>{pinSet ? "Change PIN" : "Set PIN"}</button>
            {pinSet && <button onClick={() => { removePin(); setPinSet(false); }} style={{ ...btn, background: "#FF6B3520", color: "#FF6B35" }}>Remove PIN</button>}
          </div>
          {showPinModal && <PinGate isSetup onSuccess={() => { setShowPinModal(false); setPinSet(!!getStoredPinHash()); }} onCancel={() => setShowPinModal(false)} />}
        </div>
      </>}
    </div>
  );
}
