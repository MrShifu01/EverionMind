import { useState, useEffect, useRef } from "react";
import { useTheme } from "../ThemeContext";
import { authFetch } from "../lib/authFetch";
import {
  aiFetch,
  getUserApiKey,
  getUserModel,
  setUserApiKey,
  setUserModel,
  getUserProvider,
  setUserProvider,
  getOpenRouterKey,
  setOpenRouterKey,
  getOpenRouterModel,
  setOpenRouterModel,
  getEmbedProvider,
  setEmbedProvider,
  getEmbedOpenAIKey,
  setEmbedOpenAIKey,
  getGeminiKey,
  setGeminiKey,
  getGroqKey,
  setGroqKey,
} from "../lib/aiFetch";
import { callAI } from "../lib/ai";
import { supabase } from "../lib/supabase";
import NotificationSettings from "../components/NotificationSettings";
import { PinGate, getStoredPinHash, removePin } from "../lib/pin";
import { MODELS } from "../config/models";
import { useBrain } from "../context/BrainContext";
import type { Brain } from "../types";

interface BrainMember {
  user_id: string;
  role: string;
}

interface ORModel {
  id: string;
  name: string;
  pricing?: { prompt?: string };
}

/* ─── Telegram Panel ─── */
function TelegramPanel({ activeBrain }: { activeBrain: Brain }) {
  const { t } = useTheme();
  const [code, setCode] = useState(null);
  const [generating, setGenerating] = useState(false);

  const generateCode = async () => {
    setGenerating(true);
    try {
      const res = await authFetch("/api/brains?action=telegram-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brain_id: activeBrain.id }),
      });
      if (res.ok) {
        const d = await res.json();
        setCode(d.code);
      }
    } catch {}
    setGenerating(false);
  };

  return (
    <div className="bg-ob-surface border-ob-border mt-4 rounded-[14px] border px-6 py-5">
      <p className="text-ob-text-soft m-0 mb-1 text-sm font-semibold">💬 Telegram</p>
      <p className="text-ob-text-dim m-0 mb-3 text-[11px]">
        Connect Telegram to save entries by sending messages to the bot.
      </p>
      {code ? (
        <div className="bg-ob-bg rounded-[10px] px-4 py-3">
          <p className="text-ob-text-muted m-0 mb-1.5 text-xs">
            Send this code to <strong>@TheOneAndOnlyOpenBrainBot</strong> on Telegram:
          </p>
          <p className="text-teal m-0 font-mono text-[22px] font-bold tracking-[4px]">{code}</p>
          <p className="text-ob-text-faint mt-1.5 mb-0 text-[11px]">Expires in 10 minutes</p>
        </div>
      ) : (
        <button
          onClick={generateCode}
          disabled={generating}
          className="bg-teal/10 border-ob-accent-border text-teal cursor-pointer rounded-lg border px-4 py-2 text-xs font-semibold"
        >
          {generating ? "Generating…" : "Connect Telegram"}
        </button>
      )}
    </div>
  );
}

/* ─── Memory Editor ─── */
function MemoryEditor({ activeBrain }: { activeBrain?: any }) {
  const { t } = useTheme();
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const MAX = 8000;
  useEffect(() => {
    authFetch("/api/memory")
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: any) => setContent(d.content || ""))
      .catch((err) =>
        console.error("[SettingsView:MemoryEditor] Failed to load memory content", err),
      );
  }, []);
  const save = async () => {
    setSaving(true);
    const res = await authFetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setStatus(res.ok ? "saved" : "error");
    setSaving(false);
    setTimeout(() => setStatus(null), 3000);
  };
  return (
    <div className="bg-ob-surface border-ob-border mt-4 rounded-[14px] border px-6 py-5">
      <p className="text-ob-text-soft m-0 mb-1 text-sm font-semibold">🧠 AI Memory Guide</p>
      <p style={{ margin: "0 0 10px", fontSize: 11, color: t.textDim }}>
        This Markdown guide is injected into every AI call so the model understands your context. Do
        not include passport numbers, IDs, or bank details.
      </p>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value.slice(0, MAX))}
        rows={8}
        className="bg-ob-bg border-ob-border text-ob-text-soft box-border w-full resize-y rounded-lg border px-3 py-2.5 font-mono text-xs leading-relaxed outline-none"
        placeholder={
          "# OpenBrain Classification Guide\n\n## Business Context\n- ...\n\n## Personal Context\n- ..."
        }
      />
      <div className="mt-2 flex items-center justify-between">
        <span
          className="text-[11px]"
          style={{ color: content.length > MAX * 0.9 ? "#FF6B35" : undefined }}
        >
          {content.length}/{MAX}
        </span>
        <button
          onClick={save}
          disabled={saving}
          className="bg-teal/10 border-ob-accent-border text-teal cursor-pointer rounded-lg border px-4 py-2 text-xs font-semibold"
        >
          {saving
            ? "Saving…"
            : status === "saved"
              ? "✓ Saved"
              : status === "error"
                ? "✗ Failed"
                : "Save"}
        </button>
      </div>
    </div>
  );
}

/* ─── Export / Import Panel ─── */
function ExportImportPanel({ activeBrain }: { activeBrain: Brain }) {
  const { t } = useTheme();
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const url = `/api/export?brain_id=${activeBrain.id}`;
    const a = document.createElement("a");
    a.href = url;
    a.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.entries || !Array.isArray(data.entries)) {
        setImportStatus("invalid");
        setTimeout(() => setImportStatus(null), 3000);
        return;
      }
      if (data.entries.length > 500) {
        setImportStatus("toobig");
        setTimeout(() => setImportStatus(null), 3000);
        return;
      }
      setImporting(true);
      const res = await authFetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brain_id: activeBrain.id,
          entries: data.entries,
          options: { skip_duplicates: true },
        }),
      });
      const result = res.ok ? await res.json() : null;
      setImportStatus(result ? `imported:${result.imported}:${result.skipped}` : "error");
    } catch {
      setImportStatus("error");
    }
    setImporting(false);
    setTimeout(() => setImportStatus(null), 5000);
  };

  const statusMsg = importStatus?.startsWith("imported:")
    ? (() => {
        const [, i, s] = importStatus.split(":");
        return `✓ Imported ${i}, skipped ${s} duplicates`;
      })()
    : importStatus === "invalid"
      ? "✗ Invalid file format"
      : importStatus === "toobig"
        ? "✗ Max 500 entries per import"
        : importStatus === "error"
          ? "✗ Import failed"
          : null;

  return (
    <div className="bg-ob-surface border-ob-border mt-4 rounded-[14px] border px-6 py-5">
      <p className="text-ob-text-soft m-0 mb-1 text-sm font-semibold">📦 Export / Import</p>
      <p className="text-ob-text-dim m-0 mb-3.5 text-[11px]">
        Export all entries from <strong>{activeBrain.name}</strong> as JSON, or import from a
        previous export.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleExport}
          className="bg-teal/10 border-ob-accent-border text-teal cursor-pointer rounded-lg border px-4 py-2 text-xs font-semibold"
        >
          ⬇ Export Brain
        </button>
        <input
          type="file"
          accept=".json"
          ref={fileRef}
          onChange={handleImportFile}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          style={{
            padding: "9px 16px",
            background: t.bg,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            color: t.textMuted,
            fontSize: 12,
            fontWeight: 600,
            cursor: importing ? "default" : "pointer",
          }}
        >
          {importing ? "Importing…" : "⬆ Import Entries"}
        </button>
      </div>
      {statusMsg && (
        <p
          className="mt-2 mb-0 text-xs"
          style={{ color: statusMsg.startsWith("✓") ? "#4ECDC4" : "#FF6B35" }}
        >
          {statusMsg}
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SETTINGS VIEW
   ═══════════════════════════════════════════════════════════════ */
export default function SettingsView() {
  const { t } = useTheme();
  const { activeBrain, canInvite, canManageMembers, refresh: onRefreshBrains } = useBrain();
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [byoKey, setByoKey] = useState(() => getUserApiKey() || "");
  const [byoProvider, setByoProvider] = useState(() => getUserProvider());
  const [byoModel, setByoModel] = useState(() => getUserModel());
  const [orKey, setOrKey] = useState(() => getOpenRouterKey() || "");
  const [orModel, setOrModel] = useState(
    () => getOpenRouterModel() || "google/gemini-2.0-flash-exp:free",
  );
  const [orModels, setOrModels] = useState<ORModel[]>([]);
  const [showKey, setShowKey] = useState(false);
  const [byoTestStatus, setByoTestStatus] = useState<string | null>(null);
  const [pinSet, setPinSet] = useState(() => !!getStoredPinHash());
  const [showPinModal, setShowPinModal] = useState(false);
  // Groq (voice transcription)
  const [groqKeyVal, setGroqKeyVal] = useState(() => getGroqKey() || "");
  const [showGroqKey, setShowGroqKey] = useState(false);
  // Embedding provider
  const [embedProvider, setEmbedProviderState] = useState(() => getEmbedProvider());
  const [embedOpenAIKey, setEmbedOpenAIKeyState] = useState(() => getEmbedOpenAIKey() || "");
  const [geminiKey, setGeminiKeyState] = useState(() => getGeminiKey() || "");
  const [embedStatus, setEmbedStatus] = useState<string | null>(null); // "running" | "done:N:M" | "error"
  const [showEmbedKey, setShowEmbedKey] = useState(false);
  // Advanced section toggle
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Brain members
  const [members, setMembers] = useState<BrainMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setEmail(user?.email || ""));
  }, []);
  useEffect(() => {
    if (!activeBrain?.id) return;
    authFetch(`/api/brains?action=members&brain_id=${activeBrain.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setMembers)
      .catch((err) =>
        console.error("[SettingsView:BrainMembers] Failed to fetch brain members", err),
      );
  }, [activeBrain?.id]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteStatus("sending");
    try {
      const res = await authFetch("/api/brains?action=invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brain_id: activeBrain.id,
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });
      if (res.ok) {
        setInviteStatus("sent");
        setInviteEmail("");
        setTimeout(() => setInviteStatus(null), 3000);
      } else {
        setInviteStatus("error");
        setTimeout(() => setInviteStatus(null), 3000);
      }
    } catch {
      setInviteStatus("error");
      setTimeout(() => setInviteStatus(null), 3000);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    const res = await authFetch("/api/brains?action=member-role", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brain_id: activeBrain.id, user_id: userId, role: newRole }),
    });
    if (res.ok)
      setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m)));
  };

  const handleRemoveMember = async (userId: string) => {
    const res = await authFetch("/api/brains?action=member", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brain_id: activeBrain.id, user_id: userId }),
    });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
      if (onRefreshBrains) onRefreshBrains();
    }
  };

  const ANTHROPIC_MODELS = MODELS.ANTHROPIC;
  const OPENAI_MODELS = MODELS.OPENAI;
  const OR_SHORTLIST = MODELS.OPENROUTER;
  const modelOptions = byoProvider === "openai" ? OPENAI_MODELS : ANTHROPIC_MODELS;

  const [keySaved, setKeySaved] = useState(false);
  const saveByoKey = (key: string) => {
    setByoKey(key);
    setKeySaved(false);
  };
  const handleSaveKey = () => {
    setUserApiKey(byoKey || null);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  };
  const saveByoProvider = (p: string) => {
    setByoProvider(p);
    setUserProvider(p);
    if (p === "openai") {
      if (!OPENAI_MODELS.includes(byoModel)) {
        setByoModel(OPENAI_MODELS[0]);
        setUserModel(OPENAI_MODELS[0]);
      }
    } else if (p === "anthropic") {
      if (!ANTHROPIC_MODELS.includes(byoModel)) {
        setByoModel(ANTHROPIC_MODELS[0]);
        setUserModel(ANTHROPIC_MODELS[0]);
      }
    } else if (p === "openrouter" && orKey) {
      fetchOrModels(orKey);
    }
  };
  const saveByoModel = (m: string) => {
    setByoModel(m);
    setUserModel(m);
  };
  const saveOrKey = (key: string) => {
    setOrKey(key);
    setOpenRouterKey(key || null);
    if (key) fetchOrModels(key);
  };
  const saveOrModel = (m: string) => {
    setOrModel(m);
    setOpenRouterModel(m);
  };

  const saveEmbedProvider = (p: string) => {
    setEmbedProviderState(p);
    setEmbedProvider(p);
  };
  const saveEmbedOpenAIKey = (k: string) => {
    setEmbedOpenAIKeyState(k);
    setEmbedOpenAIKey(k || null);
  };
  const saveGeminiKey = (k: string) => {
    setGeminiKeyState(k);
    setGeminiKey(k || null);
  };

  const handleReembed = async (force: boolean = false) => {
    if (!activeBrain?.id) return;
    const key = embedProvider === "google" ? geminiKey : embedOpenAIKey;
    if (!key) return;
    setEmbedStatus("running");
    let totalProcessed = 0,
      totalFailed = 0;
    try {
      // Process in small batches (5 entries per request) to avoid Vercel 10s timeout
      for (let i = 0; i < 100; i++) {
        const res = await authFetch("/api/embed", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Embed-Provider": embedProvider,
            "X-Embed-Key": key,
          },
          body: JSON.stringify({ brain_id: activeBrain.id, batch: true, force }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          if (totalProcessed === 0) {
            setEmbedStatus(`error:${errData?.error || res.status}`);
            setTimeout(() => setEmbedStatus(null), 10000);
            return;
          }
          break;
        }
        const data = await res.json();
        totalProcessed += data.processed;
        totalFailed += data.failed ?? 0;
        setEmbedStatus(`running:${totalProcessed}`);
        if ((data.remaining ?? 0) <= 0) break;
      }
      setEmbedStatus(`done:${totalProcessed}:${totalFailed}`);
    } catch (e: any) {
      if (totalProcessed === 0) {
        setEmbedStatus(`error:${e.message || "Network error"}`);
      } else {
        setEmbedStatus(`done:${totalProcessed}:${totalFailed}`);
      }
    }
    setTimeout(() => setEmbedStatus(null), 10000);
  };

  const fetchOrModels = async (key: string) => {
    const cached = sessionStorage.getItem("openbrain_or_models");
    if (cached) {
      try {
        setOrModels(JSON.parse(cached));
        return;
      } catch {}
    }
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        const data = await res.json();
        const models: ORModel[] = (data.data || []).map((m: any) => ({
          id: m.id,
          name: m.name || m.id,
          pricing: m.pricing,
        }));
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
      const endpoint =
        byoProvider === "openai"
          ? "/api/openai"
          : byoProvider === "openrouter"
            ? "/api/openrouter"
            : "/api/anthropic";
      const model = byoProvider === "openrouter" ? orModel : byoModel;
      const body = { model, max_tokens: 10, messages: [{ role: "user", content: "Say ok" }] };
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const authH: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Api-Key": key, ...authH },
        body: JSON.stringify(body),
      });
      setByoTestStatus(res.ok ? "ok" : "fail");
    } catch {
      setByoTestStatus("fail");
    }
    setTimeout(() => setByoTestStatus(null), 3000);
  };

  const testAI = async () => {
    setTestStatus("testing-ai");
    try {
      const res = await callAI({ max_tokens: 10, messages: [{ role: "user", content: "Say ok" }] });
      setTestStatus(res.ok ? "ai-success" : "ai-fail");
    } catch {
      setTestStatus("ai-fail");
    }
    setTimeout(() => setTestStatus(null), 3000);
  };
  const testDB = async () => {
    setTestStatus("testing");
    try {
      const res = await authFetch("/api/health");
      setTestStatus(res.ok ? "success" : "fail");
    } catch {
      setTestStatus("fail");
    }
    setTimeout(() => setTestStatus(null), 3000);
  };
  const btn = "px-5 py-2.5 border-0 rounded-[10px] text-[13px] font-semibold cursor-pointer";
  return (
    <div>
      <h2 className="text-ob-text m-0 mb-1 text-lg font-bold">Settings</h2>
      <p className="text-ob-text-dim m-0 mb-6 text-xs">All API keys are managed server-side.</p>
      <div className="bg-ob-surface border-ob-border mb-4 rounded-[14px] border px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-ob-text-soft m-0 text-sm font-semibold">Signed in as</p>
            <p className="text-ob-text-muted mt-1 mb-0 text-xs">{email}</p>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className={`${btn} bg-orange/10 text-orange`}
          >
            Sign out
          </button>
        </div>
      </div>
      <div className="bg-ob-surface border-ob-border mb-4 rounded-[14px] border px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-ob-text-soft m-0 text-sm font-semibold">Claude AI (Haiku)</p>
            <p className="text-ob-text-dim mt-1 mb-0 text-[11px]">AI parsing and chat</p>
          </div>
          <button onClick={testAI} className={`${btn} bg-teal/10 text-teal`}>
            {testStatus === "testing-ai"
              ? "Testing…"
              : testStatus === "ai-success"
                ? "✓ Connected"
                : testStatus === "ai-fail"
                  ? "✗ Failed"
                  : "Test"}
          </button>
        </div>
      </div>
      <div className="bg-ob-surface border-ob-border mb-4 rounded-[14px] border px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-ob-text-soft m-0 text-sm font-semibold">Supabase Database</p>
            <p className="text-ob-text-dim mt-1 mb-0 text-[11px]">Memory storage</p>
          </div>
          <button onClick={testDB} className={`${btn} bg-teal/10 text-teal`}>
            {testStatus === "testing"
              ? "Testing…"
              : testStatus === "success"
                ? "✓ Connected"
                : testStatus === "fail"
                  ? "✗ Failed"
                  : "Test"}
          </button>
        </div>
      </div>
      {/* Advanced toggle */}
      <button
        onClick={() => setShowAdvanced((s) => !s)}
        className="bg-ob-surface border-ob-border mb-4 flex w-full cursor-pointer items-center justify-between rounded-[14px] border px-6 py-4"
      >
        <div>
          <p className="text-ob-text-soft m-0 text-sm font-semibold">⚡ Advanced Settings</p>
          <p className="text-ob-text-dim m-0 mt-0.5 text-[11px]">
            AI provider, embeddings, voice, Telegram, memory guide
          </p>
        </div>
        <span className="text-ob-text-muted text-lg">{showAdvanced ? "▾" : "▸"}</span>
      </button>

      {showAdvanced && <>
      {/* AI Provider / BYO Key */}
      <div className="bg-ob-surface border-ob-border mb-4 rounded-[14px] border px-6 py-5">
        <p className="text-ob-text-soft m-0 mb-1 text-sm font-semibold">AI Provider</p>
        <p className="text-ob-text-dim m-0 mb-3.5 text-[11px]">
          Use your own API key — no OpenBrain credits deducted. Leave blank to use the shared key.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {["anthropic", "openrouter"].map((p) => (
            <button
              key={p}
              onClick={() => saveByoProvider(p)}
              style={{
                padding: "6px 16px",
                borderRadius: 20,
                border: byoProvider === p ? "1px solid #4ECDC4" : `1px solid ${t.border}`,
                background: byoProvider === p ? "#4ECDC420" : t.bg,
                color: byoProvider === p ? "#4ECDC4" : t.textDim,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {p === "openrouter" ? "OpenRouter" : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        {byoProvider === "openrouter" ? (
          <>
            <p className="text-ob-text-dim m-0 mb-1.5 text-[11px]">
              OpenRouter lets you use hundreds of models — including free ones — with one key.{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                style={{ color: "#4ECDC4" }}
              >
                Get a key →
              </a>
            </p>
            <div className="mb-3">
              <p className="text-ob-text-dim m-0 mb-1.5 text-[11px] font-semibold">
                OpenRouter API Key
              </p>
              <div className="flex gap-2">
                <input
                  type={showKey ? "text" : "password"}
                  value={orKey}
                  onChange={(e) => saveOrKey(e.target.value)}
                  placeholder="sk-or-..."
                  style={{
                    flex: 1,
                    padding: "9px 12px",
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    color: t.textSoft,
                    fontSize: 13,
                    fontFamily: "monospace",
                    outline: "none",
                  }}
                />
                <button
                  onClick={() => setShowKey((s) => !s)}
                  style={{
                    padding: "9px 12px",
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    color: t.textDim,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {showKey ? "Hide" : "Show"}
                </button>
                <button
                  onClick={testByoKey}
                  disabled={!orKey}
                  style={{
                    padding: "9px 14px",
                    background: orKey ? "#4ECDC420" : t.bg,
                    border: `1px solid ${orKey ? "#4ECDC440" : t.border}`,
                    borderRadius: 8,
                    color: orKey ? "#4ECDC4" : t.textFaint,
                    cursor: orKey ? "pointer" : "default",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {byoTestStatus === "testing"
                    ? "…"
                    : byoTestStatus === "ok"
                      ? "✓"
                      : byoTestStatus === "fail"
                        ? "✗"
                        : "Test"}
                </button>
              </div>
            </div>
            <div>
              <p className="text-ob-text-dim m-0 mb-1.5 text-[11px] font-semibold">
                Model{" "}
                {orModels.length > 0 && (
                  <span className="text-ob-text-faint font-normal">
                    ({orModels.length} available)
                  </span>
                )}
              </p>
              <select
                value={orModel}
                onChange={(e) => saveOrModel(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  background: t.bg,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  color: t.textSoft,
                  fontSize: 13,
                  outline: "none",
                }}
              >
                {(orModels.length > 0
                  ? orModels.map((m) => ({
                      id: m.id,
                      label: `${m.name}${m.pricing?.prompt ? ` — $${(+m.pricing.prompt * 1e6).toFixed(2)}/1M` : ""}`,
                    }))
                  : OR_SHORTLIST.map((id) => ({ id, label: id }))
                ).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="text-ob-text-faint mt-1.5 mb-0 text-[10px]">
                Tip: choose a model with ZDR (zero data retention) for sensitive entries.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="mb-3">
              <p className="text-ob-text-dim m-0 mb-1.5 text-[11px] font-semibold">API Key</p>
              <div className="flex gap-2">
                <input
                  type={showKey ? "text" : "password"}
                  value={byoKey}
                  onChange={(e) => saveByoKey(e.target.value)}
                  placeholder={byoProvider === "openai" ? "sk-..." : "sk-ant-..."}
                  style={{
                    flex: 1,
                    padding: "9px 12px",
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    color: t.textSoft,
                    fontSize: 13,
                    fontFamily: "monospace",
                    outline: "none",
                  }}
                />
                <button
                  onClick={() => setShowKey((s) => !s)}
                  style={{
                    padding: "9px 12px",
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    color: t.textDim,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {showKey ? "Hide" : "Show"}
                </button>
                <button
                  onClick={handleSaveKey}
                  disabled={!byoKey}
                  style={{
                    padding: "9px 14px",
                    background: keySaved ? "#25D36620" : byoKey ? "#4ECDC420" : t.bg,
                    border: `1px solid ${keySaved ? "#25D36640" : byoKey ? "#4ECDC440" : t.border}`,
                    borderRadius: 8,
                    color: keySaved ? "#25D366" : byoKey ? "#4ECDC4" : t.textFaint,
                    cursor: byoKey ? "pointer" : "default",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {keySaved ? "Saved!" : "Save"}
                </button>
                <button
                  onClick={testByoKey}
                  disabled={!byoKey}
                  style={{
                    padding: "9px 14px",
                    background: byoKey ? "#4ECDC420" : t.bg,
                    border: `1px solid ${byoKey ? "#4ECDC440" : t.border}`,
                    borderRadius: 8,
                    color: byoKey ? "#4ECDC4" : t.textFaint,
                    cursor: byoKey ? "pointer" : "default",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {byoTestStatus === "testing"
                    ? "…"
                    : byoTestStatus === "ok"
                      ? "✓"
                      : byoTestStatus === "fail"
                        ? "✗"
                        : "Test"}
                </button>
              </div>
            </div>
            <div>
              <p className="text-ob-text-dim m-0 mb-1.5 text-[11px] font-semibold">Model</p>
              <select
                value={byoModel}
                onChange={(e) => saveByoModel(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  background: t.bg,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  color: t.textSoft,
                  fontSize: 13,
                  outline: "none",
                }}
              >
                {modelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Embedding Provider */}
      <div className="bg-ob-surface border-ob-border mb-4 rounded-[14px] border px-6 py-5">
        <p className="text-ob-text-soft m-0 mb-1 text-sm font-semibold">Semantic Search & RAG</p>
        <p className="text-ob-text-dim m-0 mb-3.5 text-[11px]">
          Powers semantic search, RAG chat, and smarter connection discovery. Requires a separate
          embedding API key — does not use your AI generation key.
        </p>
        <div className="mb-3 flex gap-2">
          {["openai", "google"].map((p) => (
            <button
              key={p}
              onClick={() => saveEmbedProvider(p)}
              style={{
                padding: "6px 16px",
                borderRadius: 20,
                border: embedProvider === p ? "1px solid #A29BFE" : `1px solid ${t.border}`,
                background: embedProvider === p ? "#A29BFE20" : t.bg,
                color: embedProvider === p ? "#A29BFE" : t.textDim,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {p === "openai" ? "OpenAI" : "Google"}
            </button>
          ))}
        </div>
        {embedProvider === "openai" ? (
          <div className="mb-3">
            <p className="text-ob-text-dim m-0 mb-1.5 text-[11px] font-semibold">
              OpenAI API Key{" "}
              <span className="text-ob-text-faint font-normal">(text-embedding-3-small)</span>
            </p>
            <div className="flex gap-2">
              <input
                type={showEmbedKey ? "text" : "password"}
                value={embedOpenAIKey}
                onChange={(e) => saveEmbedOpenAIKey(e.target.value)}
                placeholder="sk-..."
                style={{
                  flex: 1,
                  padding: "9px 12px",
                  background: t.bg,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  color: t.textSoft,
                  fontSize: 13,
                  fontFamily: "monospace",
                  outline: "none",
                }}
              />
              <button
                onClick={() => setShowEmbedKey((s) => !s)}
                style={{
                  padding: "9px 12px",
                  background: t.bg,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  color: t.textDim,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {showEmbedKey ? "Hide" : "Show"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-3">
            <p className="text-ob-text-dim m-0 mb-1.5 text-[11px] font-semibold">
              Google Gemini API Key{" "}
              <span className="text-ob-text-faint font-normal">(text-embedding-004)</span>
            </p>
            <div className="flex gap-2">
              <input
                type={showEmbedKey ? "text" : "password"}
                value={geminiKey}
                onChange={(e) => saveGeminiKey(e.target.value)}
                placeholder="AIza..."
                style={{
                  flex: 1,
                  padding: "9px 12px",
                  background: t.bg,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  color: t.textSoft,
                  fontSize: 13,
                  fontFamily: "monospace",
                  outline: "none",
                }}
              />
              <button
                onClick={() => setShowEmbedKey((s) => !s)}
                style={{
                  padding: "9px 12px",
                  background: t.bg,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  color: t.textDim,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {showEmbedKey ? "Hide" : "Show"}
              </button>
            </div>
          </div>
        )}
        {activeBrain && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              onClick={() => handleReembed()}
              disabled={
                embedStatus === "running" ||
                !(embedProvider === "google" ? geminiKey : embedOpenAIKey)
              }
              style={{
                padding: "9px 16px",
                background: (embedProvider === "google" ? geminiKey : embedOpenAIKey)
                  ? "#A29BFE20"
                  : t.bg,
                border: `1px solid ${(embedProvider === "google" ? geminiKey : embedOpenAIKey) ? "#A29BFE40" : t.border}`,
                borderRadius: 8,
                color: (embedProvider === "google" ? geminiKey : embedOpenAIKey)
                  ? "#A29BFE"
                  : t.textFaint,
                fontSize: 12,
                fontWeight: 600,
                cursor: (embedProvider === "google" ? geminiKey : embedOpenAIKey)
                  ? "pointer"
                  : "default",
              }}
            >
              {embedStatus?.startsWith("running")
                ? `Embedding…${embedStatus.includes(":") ? ` (${embedStatus.split(":")[1]})` : ""}`
                : "Embed new"}
            </button>
            <button
              onClick={() => handleReembed(true)}
              disabled={
                embedStatus?.startsWith("running") ||
                !(embedProvider === "google" ? geminiKey : embedOpenAIKey)
              }
              style={{
                padding: "9px 16px",
                background: (embedProvider === "google" ? geminiKey : embedOpenAIKey)
                  ? "#FF6B3520"
                  : t.bg,
                border: `1px solid ${(embedProvider === "google" ? geminiKey : embedOpenAIKey) ? "#FF6B3540" : t.border}`,
                borderRadius: 8,
                color: (embedProvider === "google" ? geminiKey : embedOpenAIKey)
                  ? "#FF6B35"
                  : t.textFaint,
                fontSize: 12,
                fontWeight: 600,
                cursor: (embedProvider === "google" ? geminiKey : embedOpenAIKey)
                  ? "pointer"
                  : "default",
              }}
            >
              Re-embed all
            </button>
            {embedStatus && !embedStatus.startsWith("running") && (
              <span
                style={{
                  fontSize: 12,
                  color: embedStatus.startsWith("error") ? "#FF6B35" : "#A29BFE",
                }}
              >
                {embedStatus.startsWith("error")
                  ? `✗ ${embedStatus.split(":").slice(1).join(":") || "Failed"}`
                  : (() => {
                      const [, n, f] = embedStatus.split(":");
                      return `✓ ${n} embedded${+f > 0 ? `, ${f} failed` : ""}`;
                    })()}
              </span>
            )}
          </div>
        )}
        <p className="text-ob-text-faint mt-2.5 mb-0 text-[10px]">
          New entries are embedded automatically. Use "Embed all entries" to backfill existing ones
          or after switching providers.
        </p>
      </div>

      {/* Voice Transcription */}
      <div className="bg-ob-surface border-ob-border mb-4 rounded-[14px] border px-6 py-5">
        <p className="text-ob-text-soft m-0 mb-1 text-sm font-semibold">🎤 Voice Transcription</p>
        <p className="text-ob-text-dim m-0 mb-3.5 text-[11px]">
          Powers the microphone button in Quick Capture. Uses Groq's Whisper (fast, free tier
          available). Without a key, falls back to browser speech recognition.{" "}
          <a
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noreferrer"
            style={{ color: "#4ECDC4" }}
          >
            Get a free Groq key →
          </a>
        </p>
        <div>
          <p className="text-ob-text-dim m-0 mb-1.5 text-[11px] font-semibold">
            Groq API Key{" "}
            <span className="text-ob-text-faint font-normal">(whisper-large-v3-turbo)</span>
          </p>
          <div className="flex gap-2">
            <input
              type={showGroqKey ? "text" : "password"}
              value={groqKeyVal}
              onChange={(e) => {
                setGroqKeyVal(e.target.value);
                setGroqKey(e.target.value);
              }}
              placeholder="gsk_..."
              style={{
                flex: 1,
                padding: "9px 12px",
                background: t.bg,
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                color: t.textSoft,
                fontSize: 13,
                fontFamily: "monospace",
                outline: "none",
              }}
            />
            <button
              onClick={() => setShowGroqKey((s) => !s)}
              style={{
                padding: "9px 12px",
                background: t.bg,
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                color: t.textDim,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              {showGroqKey ? "Hide" : "Show"}
            </button>
          </div>
          <p className="text-ob-text-faint mt-2 mb-0 text-[10px]">
            Also works with an OpenAI key (set above) — but Groq is faster and free.
          </p>
        </div>
      </div>

      {/* Telegram */}
      {activeBrain && <TelegramPanel activeBrain={activeBrain} />}

      {/* AI Memory Guide */}
      <MemoryEditor activeBrain={activeBrain} />
      </>}

      {/* Brain Members */}
      {activeBrain && (
        <div className="bg-ob-surface border-ob-border mb-4 rounded-[14px] border px-6 py-5">
          <p className="text-ob-text-soft m-0 mb-1 text-sm font-semibold">
            🧠 {activeBrain.name} — Members
          </p>
          {members.length > 0 && (
            <div className="mb-3.5">
              {members.map((m) => (
                <div
                  key={m.user_id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 0",
                    borderBottom: `1px solid ${t.border}`,
                  }}
                >
                  <span
                    style={{ flex: 1, fontSize: 13, color: t.textSoft, fontFamily: "monospace" }}
                  >
                    {m.user_id.slice(0, 8)}…
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 8px",
                      borderRadius: 20,
                      background: m.role === "member" ? "#4ECDC420" : "#88888820",
                      color: m.role === "member" ? "#4ECDC4" : "#888",
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    {m.role}
                  </span>
                  {canManageMembers && (
                    <>
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.user_id, e.target.value)}
                        style={{
                          padding: "3px 6px",
                          background: t.bg,
                          border: `1px solid ${t.border}`,
                          borderRadius: 6,
                          color: t.textSoft,
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        onClick={() => handleRemoveMember(m.user_id)}
                        style={{
                          padding: "3px 8px",
                          background: "#FF6B3515",
                          border: "1px solid #FF6B3530",
                          borderRadius: 6,
                          color: "#FF6B35",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {canInvite && (
            <>
              <p className="text-ob-text-dim m-0 mb-2 text-xs">Invite someone to this brain</p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="their@email.com"
                  type="email"
                  style={{
                    flex: 2,
                    minWidth: 140,
                    padding: "9px 12px",
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    color: t.textSoft,
                    fontSize: 13,
                    outline: "none",
                  }}
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  style={{
                    padding: "9px 10px",
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    color: t.textSoft,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  <option value="member">Member (can edit)</option>
                  <option value="viewer">Viewer (read-only)</option>
                </select>
                <button
                  onClick={handleInvite}
                  disabled={!inviteEmail.trim() || inviteStatus === "sending"}
                  style={{
                    padding: "9px 16px",
                    background: inviteEmail.trim() ? "#4ECDC420" : t.bg,
                    border: `1px solid ${inviteEmail.trim() ? "#4ECDC440" : t.border}`,
                    borderRadius: 8,
                    color: inviteEmail.trim() ? "#4ECDC4" : t.textFaint,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: inviteEmail.trim() ? "pointer" : "default",
                  }}
                >
                  {inviteStatus === "sending"
                    ? "…"
                    : inviteStatus === "sent"
                      ? "✓ Sent"
                      : inviteStatus === "error"
                        ? "✗ Failed"
                        : "Invite"}
                </button>
              </div>
            </>
          )}
          {!canInvite && (
            <p className="text-ob-text-dim m-0 text-xs">Only the brain owner can invite members.</p>
          )}
        </div>
      )}

      <div className="bg-ob-surface border-ob-border rounded-[14px] border px-6 py-5">
        <NotificationSettings />
      </div>

      {/* Export / Import */}
      {activeBrain && <ExportImportPanel activeBrain={activeBrain} />}

      <div className="bg-ob-surface border-ob-border mt-4 rounded-[14px] border px-6 py-5">
        <p className="text-ob-text-soft m-0 mb-1 text-sm font-semibold">🔒 Security PIN</p>
        <p className="text-ob-text-dim m-0 mb-3.5 text-[11px]">
          {pinSet
            ? "PIN is active — sensitive AI responses require it before being revealed."
            : "No PIN set — AI responses with passwords or credentials are shown unguarded."}
        </p>
        <div className="flex gap-2">
          <button onClick={() => setShowPinModal(true)} className={`${btn} bg-teal/10 text-teal`}>
            {pinSet ? "Change PIN" : "Set PIN"}
          </button>
          {pinSet && (
            <button
              onClick={() => {
                removePin();
                setPinSet(false);
              }}
              className={`${btn} bg-orange/10 text-orange`}
            >
              Remove PIN
            </button>
          )}
        </div>
        {showPinModal && (
          <PinGate
            isSetup
            onSuccess={() => {
              setShowPinModal(false);
              setPinSet(!!getStoredPinHash());
            }}
            onCancel={() => setShowPinModal(false)}
          />
        )}
      </div>
    </div>
  );
}
