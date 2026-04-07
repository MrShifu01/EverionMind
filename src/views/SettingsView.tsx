import { useState, useEffect, useRef } from "react";
import { useTheme } from "../ThemeContext";
import { authFetch } from "../lib/authFetch";
import { aiFetch } from "../lib/aiFetch";
import {
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
  getModelForTask,
  setModelForTask,
} from "../lib/aiSettings";
import { callAI } from "../lib/ai";
import { supabase } from "../lib/supabase";
import NotificationSettings from "../components/NotificationSettings";
import { PinGate, getStoredPinHash, removePin } from "../lib/pin";
import { MODELS } from "../config/models";
import { useBrain } from "../context/BrainContext";
import type { Brain, Entry } from "../types";
import TrashView from "./TrashView";

function priceTier(pricing?: { prompt?: string }): { label: string; color: string } {
  const p = parseFloat(pricing?.prompt ?? "1");
  if (p === 0) return { label: "Free", color: "#22c55e" };
  if (p < 0.000001) return { label: "Cheap", color: "#4ECDC4" };
  if (p < 0.000010) return { label: "Normal", color: "#888" };
  return { label: "Expensive", color: "#FF6B35" };
}

function UsagePanel() {
  const [usage, setUsage] = useState({ inputTokens: 0, outputTokens: 0, estimatedUsd: 0 });
  useEffect(() => {
    import("../lib/usageTracker").then(m => setUsage(m.getMonthlyUsage()));
  }, []);

  return (
    <div className="rounded-2xl border p-4 space-y-3" style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}>
      <p className="text-sm font-semibold text-white">Usage this month</p>
      <div className="space-y-1 text-xs" style={{ color: "#aaa" }}>
        <p>Input tokens: <span className="text-white">{usage.inputTokens.toLocaleString()}</span></p>
        <p>Output tokens: <span className="text-white">{usage.outputTokens.toLocaleString()}</span></p>
        <p>Est. cost: <span className="text-white">${usage.estimatedUsd.toFixed(4)}</span> <span style={{ color: "#555" }}>(estimate only)</span></p>
      </div>
      <button
        onClick={() => { import("../lib/usageTracker").then(m => { m.clearUsage(); setUsage({ inputTokens: 0, outputTokens: 0, estimatedUsd: 0 }); }); }}
        className="rounded-lg px-3 text-xs"
        style={{ color: "#888", border: "1px solid rgba(72,72,71,0.3)", minHeight: 36 }}
      >
        Clear history
      </button>
    </div>
  );
}

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
    <div className="rounded-2xl border p-4 space-y-3" style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}>
      <p className="text-sm font-semibold text-white">Telegram</p>
      <p className="text-xs" style={{ color: "#aaa" }}>
        Connect Telegram to save entries by messaging the bot.
      </p>
      {code ? (
        <div className="space-y-2">
          <p className="text-xs" style={{ color: "#aaa" }}>
            Send this code to <strong className="text-white">@TheOneAndOnlyOpenBrainBot</strong> on Telegram:
          </p>
          <p className="text-lg font-mono font-bold tracking-widest text-center py-2" style={{ color: "#72eff5" }}>{code}</p>
          <p className="text-[10px] text-center" style={{ color: "#555" }}>Expires in 10 minutes</p>
        </div>
      ) : (
        <button
          onClick={generateCode}
          disabled={generating}
          className="rounded-xl px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{
            background: "linear-gradient(135deg, #72eff5, #1fb1b7)",
            color: "#0a0a0a",
          }}
        >
          {generating ? "Generating…" : "Connect Telegram"}
        </button>
      )}
    </div>
  );
}

/* ─── Memory Editor ─── */
function MemoryEditor({ activeBrain }: { activeBrain?: any }) {
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
    <div className="rounded-2xl border p-4 space-y-3" style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}>
      <p className="text-sm font-semibold text-white">AI Memory Guide</p>
      <p className="text-xs" style={{ color: "#aaa" }}>
        Markdown guide injected into every AI call for context. Do not include IDs or bank details.
      </p>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value.slice(0, MAX))}
        rows={8}
        placeholder={
          "# OpenBrain Classification Guide\n\n## Business Context\n- ...\n\n## Personal Context\n- ..."
        }
        className="w-full rounded-xl px-3 py-2.5 text-xs bg-transparent border outline-none text-white placeholder:text-[#555] resize-y"
        style={{ borderColor: "rgba(72,72,71,0.3)" }}
        onFocus={(e) => (e.target.style.borderColor = "rgba(114,239,245,0.5)")}
        onBlur={(e) => (e.target.style.borderColor = "rgba(72,72,71,0.3)")}
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px]" style={{ color: "#555" }}>
          {content.length}/{MAX}
        </span>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{
            background: "linear-gradient(135deg, #72eff5, #1fb1b7)",
            color: "#0a0a0a",
          }}
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
    <div className="rounded-2xl border p-4 space-y-3" style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}>
      <p className="text-sm font-semibold text-white">Export / Import</p>
      <p className="text-xs" style={{ color: "#aaa" }}>
        Export all entries from <strong className="text-white">{activeBrain.name}</strong> as JSON, or import from a
        previous export.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={handleExport}
          className="rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors hover:bg-white/5"
          style={{ color: "#aaa", borderColor: "rgba(72,72,71,0.3)" }}
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
          className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{
            background: "linear-gradient(135deg, #72eff5, #1fb1b7)",
            color: "#0a0a0a",
          }}
        >
          {importing ? "Importing…" : "⬆ Import"}
        </button>
      </div>
      {statusMsg && (
        <p
          className="text-xs"
          style={{ color: statusMsg.startsWith("✓") ? "#72eff5" : "#ff6e84" }}
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
  const { activeBrain, canInvite, canManageMembers, refresh: onRefreshBrains, deleteBrain } = useBrain();
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [byoKey, setByoKey] = useState(() => getUserApiKey() || "");
  const [byoProvider, setByoProvider] = useState(() => getUserProvider());
  const [byoModel, setByoModel] = useState(() => getUserModel());
  const [orKey, setOrKey] = useState(() => getOpenRouterKey() || "");
  const [orModel, setOrModel] = useState(
    () => getOpenRouterModel() || "google/gemini-2.0-flash-lite:free",
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
  // Embed mismatch warning
  const [embedMismatchCount, setEmbedMismatchCount] = useState(0);
  const [pendingEmbedProvider, setPendingEmbedProvider] = useState<string | null>(null);
  // Per-task model overrides
  const [taskModels, setTaskModels] = useState<Record<string, string | null>>(() => {
    const tasks = ["capture", "questions", "refine", "chat", "vision"];
    const result: Record<string, string | null> = {};
    for (const t of tasks) result[t] = getModelForTask(t);
    return result;
  });
  // Trash view
  const [showTrash, setShowTrash] = useState(false);
  // Danger zone — brain deletion
  const [confirmDeleteBrain, setConfirmDeleteBrain] = useState(false);
  const [deletingBrain, setDeletingBrain] = useState(false);
  const [deleteBrainError, setDeleteBrainError] = useState<string | null>(null);
  // Brain members
  const [members, setMembers] = useState<BrainMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [platformInviteEmail, setPlatformInviteEmail] = useState("");
  const [platformInviteStatus, setPlatformInviteStatus] = useState<string | null>(null);
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
        const errData = await res.json().catch(() => ({}));
        console.error("[invite] failed:", res.status, errData);
        setInviteStatus("error");
        setTimeout(() => setInviteStatus(null), 4000);
      }
    } catch (e) {
      console.error("[invite] exception:", e);
      setInviteStatus("error");
      setTimeout(() => setInviteStatus(null), 4000);
    }
  };

  const handlePlatformInvite = async () => {
    if (!platformInviteEmail.trim()) return;
    setPlatformInviteStatus("sending");
    try {
      const res = await authFetch("/api/brains?action=invite-platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: platformInviteEmail.trim() }),
      });
      if (res.ok) {
        setPlatformInviteStatus("sent");
        setPlatformInviteEmail("");
        setTimeout(() => setPlatformInviteStatus(null), 3000);
      } else {
        setPlatformInviteStatus("error");
        setTimeout(() => setPlatformInviteStatus(null), 3000);
      }
    } catch {
      setPlatformInviteStatus("error");
      setTimeout(() => setPlatformInviteStatus(null), 3000);
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
  const handleEmbedProviderClick = (p: string) => {
    if (p === embedProvider) {
      saveEmbedProvider(p);
      return;
    }
    // Show warning when switching providers — entries with old embeddings will be mismatched
    setPendingEmbedProvider(p);
    setEmbedMismatchCount(1); // conservative: at least some entries may be embedded
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

  return (
    <div className="px-4 py-4 space-y-4" style={{ background: "#0e0e0e", fontFamily: "'Manrope', sans-serif" }}>
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Settings</h2>
        <p className="text-sm" style={{ color: "#777" }}>Manage your account and preferences</p>
      </div>

      {/* ── Account ── */}
      <div className="rounded-2xl border p-4" style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Account</p>
            <p className="text-xs" style={{ color: "#aaa" }}>{email}</p>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors hover:bg-white/5"
            style={{ color: "#ff6e84", borderColor: "rgba(255,110,132,0.3)" }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* ── Connection Status ── */}
      <div className="rounded-2xl border p-4 space-y-3" style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">AI Status</p>
            <p className="text-xs" style={{ color: "#777" }}>Claude AI (Haiku)</p>
          </div>
          <button
            onClick={testAI}
            className="rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors hover:bg-white/5"
            style={{ color: "#aaa", borderColor: "rgba(72,72,71,0.3)" }}
          >
            {testStatus === "testing-ai"
              ? "Testing…"
              : testStatus === "ai-success"
                ? "✓ Connected"
                : testStatus === "ai-fail"
                  ? "✗ Failed"
                  : "Test"}
          </button>
        </div>
        <div className="border-t" style={{ borderColor: "rgba(72,72,71,0.2)" }} />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Database</p>
            <p className="text-xs" style={{ color: "#777" }}>Supabase</p>
          </div>
          <button
            onClick={testDB}
            className="rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors hover:bg-white/5"
            style={{ color: "#aaa", borderColor: "rgba(72,72,71,0.3)" }}
          >
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

      {/* Security PIN section removed */}

      {/* ── Notifications ── */}
      <div className="rounded-2xl border p-4" style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}>
        <NotificationSettings />
      </div>

      {/* ── Export / Import ── */}
      {activeBrain && <ExportImportPanel activeBrain={activeBrain} />}

      {/* ── Brain Members (shared brains only) ── */}
      {activeBrain && activeBrain.type !== "personal" && (
        <div className="rounded-2xl border p-4 space-y-3" style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}>
          <p className="text-sm font-semibold text-white">
            {activeBrain.name} — Members
          </p>
          {members.length > 0 && (
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.user_id} className="flex items-center gap-2 text-xs">
                  <span className="font-mono" style={{ color: "#aaa" }}>
                    {m.user_id.slice(0, 8)}…
                  </span>
                  <span className="rounded-full px-2 py-0.5" style={{ color: "#72eff5", background: "rgba(114,239,245,0.1)" }}>
                    {m.role}
                  </span>
                  {canManageMembers && (
                    <>
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.user_id, e.target.value)}
                        className="rounded-xl px-2 py-1 text-xs bg-transparent border outline-none text-white"
                        style={{ borderColor: "rgba(72,72,71,0.3)" }}
                      >
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        onClick={() => handleRemoveMember(m.user_id)}
                        className="text-xs transition-colors hover:underline"
                        style={{ color: "#ff6e84" }}
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
            <div className="space-y-2 pt-2 border-t" style={{ borderColor: "rgba(72,72,71,0.2)" }}>
              <p className="text-xs font-medium" style={{ color: "#777" }}>Invite someone to this brain</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="their@email.com"
                  type="email"
                  className="flex-1 rounded-xl px-3 py-2 text-xs bg-transparent border outline-none text-white placeholder:text-[#555]"
                  style={{ borderColor: "rgba(72,72,71,0.3)" }}
                  onFocus={(e) => (e.target.style.borderColor = "rgba(114,239,245,0.5)")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(72,72,71,0.3)")}
                />
                <div className="flex gap-2">
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="flex-1 rounded-xl px-2 py-2 text-xs bg-transparent border outline-none text-white"
                    style={{ borderColor: "rgba(72,72,71,0.3)" }}
                  >
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    onClick={handleInvite}
                    disabled={!inviteEmail.trim() || inviteStatus === "sending"}
                    className="rounded-xl px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 whitespace-nowrap"
                    style={{
                      background: "linear-gradient(135deg, #72eff5, #1fb1b7)",
                      color: "#0a0a0a",
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
              </div>
            </div>
          )}
          {!canInvite && (
            <p className="text-xs" style={{ color: "#555" }}>Only the brain owner can invite members.</p>
          )}
        </div>
      )}

      {/* ── Invite to OpenBrain platform ── */}
      <div className="rounded-2xl border p-4 space-y-3" style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}>
        <div>
          <p className="text-sm font-semibold text-white">Invite to OpenBrain</p>
          <p className="text-xs mt-0.5" style={{ color: "#777" }}>Send someone an invite to join the platform</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={platformInviteEmail}
            onChange={(e) => setPlatformInviteEmail(e.target.value)}
            placeholder="their@email.com"
            type="email"
            className="flex-1 rounded-xl px-3 py-2 text-xs bg-transparent border outline-none text-white placeholder:text-[#555]"
            style={{ borderColor: "rgba(72,72,71,0.3)" }}
            onFocus={(e) => (e.target.style.borderColor = "rgba(114,239,245,0.5)")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(72,72,71,0.3)")}
          />
          <button
            onClick={handlePlatformInvite}
            disabled={!platformInviteEmail.trim() || platformInviteStatus === "sending"}
            className="rounded-xl px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 whitespace-nowrap"
            style={{
              background: "linear-gradient(135deg, #72eff5, #1fb1b7)",
              color: "#0a0a0a",
            }}
          >
            {platformInviteStatus === "sending"
              ? "…"
              : platformInviteStatus === "sent"
                ? "✓ Invite sent"
                : platformInviteStatus === "error"
                  ? "✗ Failed"
                  : "Send invite"}
          </button>
        </div>
      </div>

      {/* ── Advanced toggle ── */}
      <button
        onClick={() => setShowAdvanced((s) => !s)}
        className="w-full rounded-2xl border p-4 flex items-center justify-between transition-colors hover:bg-white/5"
        style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}
      >
        <div className="text-left">
          <p className="text-sm font-semibold text-white">Advanced</p>
          <p className="text-xs" style={{ color: "#777" }}>
            AI provider, embeddings, voice, Telegram
          </p>
        </div>
        <span style={{ color: "#555" }}>{showAdvanced ? "▾" : "▸"}</span>
      </button>

      {showAdvanced && <>
      {/* AI Provider / BYO Key */}
      <div className="rounded-2xl border p-4 space-y-3" style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}>
        <p className="text-sm font-semibold text-white">AI Provider</p>
        <p className="text-xs" style={{ color: "#aaa" }}>
          Use your own API key — no OpenBrain credits deducted. Leave blank to use the shared key.
        </p>
        <div className="flex items-center gap-2">
          {["anthropic", "openrouter"].map((p) => (
            <button
              key={p}
              onClick={() => saveByoProvider(p)}
              className="rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors"
              style={{
                color: byoProvider === p ? "#0a0a0a" : "#aaa",
                borderColor: byoProvider === p ? "transparent" : "rgba(72,72,71,0.3)",
                background: byoProvider === p ? "linear-gradient(135deg, #72eff5, #1fb1b7)" : "transparent",
              }}
            >
              {p === "openrouter" ? "OpenRouter" : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        {byoProvider === "openrouter" ? (
          <>
            <p className="text-xs" style={{ color: "#777" }}>
              OpenRouter lets you use hundreds of models with one key.{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                style={{ color: "#72eff5" }}
              >
                Get a key →
              </a>
            </p>
            <div className="space-y-1">
              <p className="text-xs font-medium" style={{ color: "#777" }}>
                OpenRouter API Key
              </p>
              <div className="flex items-center gap-2">
                <input
                  type={showKey ? "text" : "password"}
                  value={orKey}
                  onChange={(e) => saveOrKey(e.target.value)}
                  placeholder="sk-or-..."
                  className="flex-1 rounded-xl px-3 py-2 text-xs bg-transparent border outline-none text-white placeholder:text-[#555]"
                  style={{ borderColor: "rgba(72,72,71,0.3)" }}
                  onFocus={(e) => (e.target.style.borderColor = "rgba(114,239,245,0.5)")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(72,72,71,0.3)")}
                />
                <button
                  onClick={() => setShowKey((s) => !s)}
                  className="rounded-xl px-2 py-2 text-xs border transition-colors hover:bg-white/5"
                  style={{ color: "#777", borderColor: "rgba(72,72,71,0.3)" }}
                >
                  {showKey ? "Hide" : "Show"}
                </button>
                <button
                  onClick={testByoKey}
                  disabled={!orKey}
                  className="rounded-xl px-2 py-2 text-xs border transition-colors hover:bg-white/5 disabled:opacity-40"
                  style={{ color: "#aaa", borderColor: "rgba(72,72,71,0.3)" }}
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
            <div className="space-y-1">
              <p className="text-xs font-medium" style={{ color: "#777" }}>
                Model{" "}
                {orModels.length > 0 && (
                  <span style={{ color: "#555" }}>
                    ({orModels.length} available)
                  </span>
                )}
              </p>
              <select
                value={orModel}
                onChange={(e) => saveOrModel(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-xs bg-transparent border outline-none text-white"
                style={{ borderColor: "rgba(72,72,71,0.3)" }}
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
              <p className="text-[10px]" style={{ color: "#555" }}>
                Tip: choose a model with ZDR (zero data retention) for sensitive entries.
              </p>
            </div>
            {orModels.length > 0 && (
              <div className="space-y-3 pt-2 border-t" style={{ borderColor: "rgba(72,72,71,0.2)" }}>
                <p className="text-xs font-semibold" style={{ color: "#aaa" }}>Per-task models</p>
                {([
                  ["Entry capture", "capture"],
                  ["Fill Brain questions", "questions"],
                  ["Refine collection", "refine"],
                  ["Brain chat", "chat"],
                ] as [string, string][]).map(([label, task]) => (
                  <div key={task} className="flex items-center gap-2">
                    <span className="text-xs w-36 shrink-0" style={{ color: "#aaa" }}>{label}</span>
                    <select
                      value={taskModels[task] ?? "default"}
                      onChange={e => {
                        const v = e.target.value;
                        setModelForTask(task, v === "default" ? null : v);
                        setTaskModels(prev => ({ ...prev, [task]: v === "default" ? null : v }));
                      }}
                      className="flex-1 rounded-lg px-2 text-xs"
                      style={{ background: "rgba(255,255,255,0.05)", color: "#fff", border: "1px solid rgba(72,72,71,0.3)", height: 44 }}
                    >
                      <option value="default">Same as global default</option>
                      {orModels.map(m => {
                        const tier = priceTier(m.pricing);
                        return (
                          <option key={m.id} value={m.id}>
                            {m.name ?? m.id} [{tier.label}]
                          </option>
                        );
                      })}
                    </select>
                  </div>
                ))}
                {/* Vision model picker */}
                <div className="flex items-center gap-2">
                  <span className="text-xs w-36 shrink-0" style={{ color: "#aaa" }}>Image reading</span>
                  <select
                    value={taskModels["vision"] ?? "default"}
                    onChange={e => {
                      const v = e.target.value;
                      setModelForTask("vision", v === "default" ? null : v);
                      setTaskModels(prev => ({ ...prev, vision: v === "default" ? null : v }));
                    }}
                    className="flex-1 rounded-lg px-2 text-xs"
                    style={{ background: "rgba(255,255,255,0.05)", color: "#fff", border: "1px solid rgba(72,72,71,0.3)", height: 44 }}
                  >
                    <option value="default">Same as global default</option>
                    {orModels
                      .filter(m => (m as any).modality?.includes?.("image") || (m as any).architecture?.modality?.includes?.("image"))
                      .map(m => {
                        const tier = priceTier(m.pricing);
                        return <option key={m.id} value={m.id}>{m.name ?? m.id} [{tier.label}]</option>;
                      })}
                  </select>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="space-y-1">
              <p className="text-xs font-medium" style={{ color: "#777" }}>API Key</p>
              <div className="flex items-center gap-2">
                <input
                  type={showKey ? "text" : "password"}
                  value={byoKey}
                  onChange={(e) => saveByoKey(e.target.value)}
                  placeholder={byoProvider === "openai" ? "sk-..." : "sk-ant-..."}
                  className="flex-1 rounded-xl px-3 py-2 text-xs bg-transparent border outline-none text-white placeholder:text-[#555]"
                  style={{ borderColor: "rgba(72,72,71,0.3)" }}
                  onFocus={(e) => (e.target.style.borderColor = "rgba(114,239,245,0.5)")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(72,72,71,0.3)")}
                />
                <button
                  onClick={() => setShowKey((s) => !s)}
                  className="rounded-xl px-2 py-2 text-xs border transition-colors hover:bg-white/5"
                  style={{ color: "#777", borderColor: "rgba(72,72,71,0.3)" }}
                >
                  {showKey ? "Hide" : "Show"}
                </button>
                <button
                  onClick={handleSaveKey}
                  disabled={!byoKey}
                  className="rounded-xl px-2 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{
                    background: "linear-gradient(135deg, #72eff5, #1fb1b7)",
                    color: "#0a0a0a",
                  }}
                >
                  {keySaved ? "Saved!" : "Save"}
                </button>
                <button
                  onClick={testByoKey}
                  disabled={!byoKey}
                  className="rounded-xl px-2 py-2 text-xs border transition-colors hover:bg-white/5 disabled:opacity-40"
                  style={{ color: "#aaa", borderColor: "rgba(72,72,71,0.3)" }}
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
            <div className="space-y-1">
              <p className="text-xs font-medium" style={{ color: "#777" }}>Model</p>
              <select
                value={byoModel}
                onChange={(e) => saveByoModel(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-xs bg-transparent border outline-none text-white"
                style={{ borderColor: "rgba(72,72,71,0.3)" }}
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
      <div className="rounded-2xl border p-4 space-y-3" style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}>
        <p className="text-sm font-semibold text-white">Semantic Search & RAG</p>
        <p className="text-xs" style={{ color: "#aaa" }}>
          Powers semantic search, RAG chat, and smarter connection discovery. Requires a separate
          embedding API key.
        </p>
        <div className="flex items-center gap-2">
          {["openai", "google"].map((p) => (
            <button
              key={p}
              onClick={() => handleEmbedProviderClick(p)}
              className="rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors"
              style={{
                color: embedProvider === p ? "#0a0a0a" : "#aaa",
                borderColor: embedProvider === p ? "transparent" : "rgba(72,72,71,0.3)",
                background: embedProvider === p ? "linear-gradient(135deg, #72eff5, #1fb1b7)" : "transparent",
              }}
            >
              {p === "openai" ? "OpenAI" : "Google"}
            </button>
          ))}
        </div>
        {pendingEmbedProvider && (
          <div className="rounded-xl p-3 text-xs space-y-2" style={{ background: "rgba(255,107,53,0.1)", border: "1px solid rgba(255,107,53,0.3)" }}>
            <p style={{ color: "#FF6B35" }}>
              Switching providers may make search inconsistent until you re-embed. Existing embeddings were created with a different provider.
            </p>
            <div className="flex gap-2">
              <button onClick={() => { saveEmbedProvider(pendingEmbedProvider!); setPendingEmbedProvider(null); }}
                className="rounded-lg px-3 text-xs font-semibold" style={{ background: "rgba(255,107,53,0.2)", color: "#FF6B35", minHeight: 36 }}>
                Switch anyway
              </button>
              <button onClick={() => setPendingEmbedProvider(null)}
                className="rounded-lg px-3 text-xs" style={{ color: "#888", minHeight: 36 }}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {embedProvider === "openai" ? (
          <div className="space-y-1">
            <p className="text-xs font-medium" style={{ color: "#777" }}>
              OpenAI API Key{" "}
              <span style={{ color: "#555" }}>(text-embedding-3-small)</span>
            </p>
            <div className="flex items-center gap-2">
              <input
                type={showEmbedKey ? "text" : "password"}
                value={embedOpenAIKey}
                onChange={(e) => saveEmbedOpenAIKey(e.target.value)}
                placeholder="sk-..."
                className="flex-1 rounded-xl px-3 py-2 text-xs bg-transparent border outline-none text-white placeholder:text-[#555]"
                style={{ borderColor: "rgba(72,72,71,0.3)" }}
                onFocus={(e) => (e.target.style.borderColor = "rgba(114,239,245,0.5)")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(72,72,71,0.3)")}
              />
              <button
                onClick={() => setShowEmbedKey((s) => !s)}
                className="rounded-xl px-2 py-2 text-xs border transition-colors hover:bg-white/5"
                style={{ color: "#777", borderColor: "rgba(72,72,71,0.3)" }}
              >
                {showEmbedKey ? "Hide" : "Show"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-xs font-medium" style={{ color: "#777" }}>
              Google Gemini API Key{" "}
              <span style={{ color: "#555" }}>(text-embedding-004)</span>
            </p>
            <div className="flex items-center gap-2">
              <input
                type={showEmbedKey ? "text" : "password"}
                value={geminiKey}
                onChange={(e) => saveGeminiKey(e.target.value)}
                placeholder="AIza..."
                className="flex-1 rounded-xl px-3 py-2 text-xs bg-transparent border outline-none text-white placeholder:text-[#555]"
                style={{ borderColor: "rgba(72,72,71,0.3)" }}
                onFocus={(e) => (e.target.style.borderColor = "rgba(114,239,245,0.5)")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(72,72,71,0.3)")}
              />
              <button
                onClick={() => setShowEmbedKey((s) => !s)}
                className="rounded-xl px-2 py-2 text-xs border transition-colors hover:bg-white/5"
                style={{ color: "#777", borderColor: "rgba(72,72,71,0.3)" }}
              >
                {showEmbedKey ? "Hide" : "Show"}
              </button>
            </div>
          </div>
        )}
        {activeBrain && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleReembed()}
              disabled={
                embedStatus === "running" ||
                !(embedProvider === "google" ? geminiKey : embedOpenAIKey)
              }
              className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{
                background: "linear-gradient(135deg, #72eff5, #1fb1b7)",
                color: "#0a0a0a",
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
              className="rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors hover:bg-white/5 disabled:opacity-40"
              style={{ color: "#aaa", borderColor: "rgba(72,72,71,0.3)" }}
            >
              Re-embed all
            </button>
            {embedStatus && !embedStatus.startsWith("running") && (
              <span className="text-xs" style={{ color: embedStatus.startsWith("error") ? "#ff6e84" : "#72eff5" }}>
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
        <p className="text-[10px]" style={{ color: "#555" }}>
          New entries are embedded automatically. Use "Embed all" to backfill or after switching providers.
        </p>
      </div>

      {/* Voice Transcription */}
      <div className="rounded-2xl border p-4 space-y-3" style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}>
        <p className="text-sm font-semibold text-white">Voice Transcription</p>
        <p className="text-xs" style={{ color: "#aaa" }}>
          Powers the mic button in Quick Capture. Uses Groq Whisper (fast, free tier).{" "}
          <a
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noreferrer"
            style={{ color: "#72eff5" }}
          >
            Get a free key →
          </a>
        </p>
        <div className="space-y-1">
          <p className="text-xs font-medium" style={{ color: "#777" }}>
            Groq API Key{" "}
            <span style={{ color: "#555" }}>(whisper-large-v3-turbo)</span>
          </p>
          <div className="flex items-center gap-2">
            <input
              type={showGroqKey ? "text" : "password"}
              value={groqKeyVal}
              onChange={(e) => {
                setGroqKeyVal(e.target.value);
                setGroqKey(e.target.value);
              }}
              placeholder="gsk_..."
              className="flex-1 rounded-xl px-3 py-2 text-xs bg-transparent border outline-none text-white placeholder:text-[#555]"
              style={{ borderColor: "rgba(72,72,71,0.3)" }}
              onFocus={(e) => (e.target.style.borderColor = "rgba(114,239,245,0.5)")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(72,72,71,0.3)")}
            />
            <button
              onClick={() => setShowGroqKey((s) => !s)}
              className="rounded-xl px-2 py-2 text-xs border transition-colors hover:bg-white/5"
              style={{ color: "#777", borderColor: "rgba(72,72,71,0.3)" }}
            >
              {showGroqKey ? "Hide" : "Show"}
            </button>
          </div>
          <p className="text-[10px]" style={{ color: "#555" }}>
            Also works with an OpenAI key (set above) — but Groq is faster and free.
          </p>
        </div>
      </div>

      {/* Telegram */}
      {activeBrain && <TelegramPanel activeBrain={activeBrain} />}

      {/* AI Memory Guide */}
      <MemoryEditor activeBrain={activeBrain} />
      </>}

      {/* ─── Usage Tracking ─── */}
      <UsagePanel />

      {/* ─── Data & Storage ─── */}
      <div className="rounded-2xl border p-4 space-y-3" style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}>
        <p className="text-sm font-semibold text-white">Data & Storage</p>
        <button
          onClick={() => setShowTrash(s => !s)}
          className="rounded-xl px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90"
          style={{ background: "rgba(255,71,87,0.1)", color: "#FF4757", minHeight: 44 }}
        >
          {showTrash ? "Hide Trash" : "View Trash"}
        </button>
        {showTrash && activeBrain && (
          <div className="mt-2">
            <TrashView brainId={activeBrain.id} />
          </div>
        )}
      </div>

      {/* ─── Onboarding ─── */}
      <div className="rounded-2xl border p-4 space-y-3" style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}>
        <p className="text-sm font-semibold text-white">Help & Onboarding</p>
        <button
          onClick={() => {
            localStorage.removeItem("openbrain_onboarded");
            window.dispatchEvent(new CustomEvent("openbrain:restart-onboarding"));
          }}
          className="rounded-xl px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90"
          style={{ background: "rgba(114,239,245,0.15)", color: "#72eff5", minHeight: 44 }}
        >
          Restart Onboarding
        </button>
      </div>

      {/* ─── Danger Zone ─── */}
      {activeBrain && activeBrain.myRole === "owner" && (
        <div className="rounded-2xl border p-4 space-y-3" style={{ background: "rgba(220,38,38,0.05)", borderColor: "rgba(220,38,38,0.2)" }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: "#ef4444" }}>Danger Zone</p>
            <p className="text-xs mt-0.5" style={{ color: "#777" }}>Irreversible actions. Proceed with care.</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs" style={{ color: "#aaa" }}>
              Delete brain <strong className="text-white">{activeBrain.name}</strong> and all its entries permanently. This cannot be undone.
            </p>
            {deleteBrainError && (
              <p className="text-xs" style={{ color: "#ef4444" }}>{deleteBrainError}</p>
            )}
            <button
              disabled={deletingBrain}
              onClick={async () => {
                if (!confirmDeleteBrain) {
                  setConfirmDeleteBrain(true);
                  setTimeout(() => setConfirmDeleteBrain(false), 5000);
                  return;
                }
                setDeletingBrain(true);
                setDeleteBrainError(null);
                try {
                  await deleteBrain(activeBrain.id);
                } catch (e: any) {
                  setDeleteBrainError(e.message || "Failed to delete brain");
                  setDeletingBrain(false);
                  setConfirmDeleteBrain(false);
                }
              }}
              className="rounded-xl px-4 py-2 text-xs font-bold transition-all disabled:opacity-40"
              style={{
                background: confirmDeleteBrain ? "rgba(220,38,38,0.25)" : "rgba(220,38,38,0.1)",
                color: confirmDeleteBrain ? "#fca5a5" : "#ef4444",
                border: "1px solid rgba(220,38,38,0.3)",
                minHeight: 44,
              }}
            >
              {deletingBrain ? "Deleting..." : confirmDeleteBrain ? "Tap again to confirm — this is permanent" : "Delete this Brain"}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
