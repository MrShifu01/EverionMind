import { useState, useMemo, useEffect } from "react";
import { authFetch } from "../../lib/authFetch";
import { callAI } from "../../lib/ai";
import {
  getUserApiKey, setUserApiKey,
  getUserModel, setUserModel,
  getUserProvider, setUserProvider,
  getOpenRouterKey, setOpenRouterKey,
  getOpenRouterModel, setOpenRouterModel,
  getGroqKey, setGroqKey,
  getEmbedProvider, setEmbedProvider,
  getEmbedOpenAIKey, setEmbedOpenAIKey,
  getGeminiKey, setGeminiKey,
  getModelForTask, setModelForTask,
} from "../../lib/aiSettings";
import { supabase } from "../../lib/supabase";
import { MODELS } from "../../config/models";
import { countEmbedMismatches } from "../../lib/embedMismatch";
import { getPriceTier, filterByTier, sortWithRecommended, modelLabel, TIER_RECOMMENDED } from "../../lib/orModelFilter";
import type { ORModel, FilterTier } from "../../lib/orModelFilter";
import type { Brain } from "../../types";

const TIER_OPTIONS: { value: FilterTier; label: string }[] = [
  { value: "all",      label: "All" },
  { value: "free",     label: "Free" },
  { value: "cheap",    label: "Cheap" },
  { value: "good",     label: "Good" },
  { value: "frontier", label: "Frontier" },
];

interface Props {
  activeBrain?: Brain;
}

export default function ProvidersTab({ activeBrain }: Props) {
  const [byoKey, setByoKey] = useState(() => getUserApiKey() || "");
  const [byoProvider, setByoProvider] = useState(() => getUserProvider());
  const [byoModel, setByoModel] = useState(() => getUserModel());
  const [orKey, setOrKey] = useState(() => getOpenRouterKey() || "");
  const [orModel, setOrModel] = useState(() => getOpenRouterModel() || "google/gemini-2.0-flash-lite:free");
  const [orModels, setOrModels] = useState<ORModel[]>([]);
  const [orFilter, setOrFilter] = useState<FilterTier>("all");
  const [showKey, setShowKey] = useState(false);
  const [byoTestStatus, setByoTestStatus] = useState<string | null>(null);
  const [keySaved, setKeySaved] = useState(false);
  const [keySaveStatus, setKeySaveStatus] = useState<string | null>(null);
  const [groqKeyVal, setGroqKeyVal] = useState(() => getGroqKey() || "");
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [embedProvider, setEmbedProviderState] = useState(() => getEmbedProvider());
  const [embedOpenAIKey, setEmbedOpenAIKeyState] = useState(() => getEmbedOpenAIKey() || "");
  const [geminiKey, setGeminiKeyState] = useState(() => getGeminiKey() || "");
  const [embedStatus, setEmbedStatus] = useState<string | null>(null);
  const [showEmbedKey, setShowEmbedKey] = useState(false);
  const [embedMismatchCount, setEmbedMismatchCount] = useState(0);
  const [pendingEmbedProvider, setPendingEmbedProvider] = useState<string | null>(null);
  const [taskModels, setTaskModels] = useState<Record<string, string | null>>(() => {
    const tasks = ["capture", "questions", "refine", "chat", "vision"];
    const result: Record<string, string | null> = {};
    for (const t of tasks) result[t] = getModelForTask(t);
    return result;
  });

  const [aiTestStatus, setAiTestStatus] = useState<string | null>(null);
  const [dbTestStatus, setDbTestStatus] = useState<string | null>(null);

  const ANTHROPIC_MODELS = MODELS.ANTHROPIC;
  const OPENAI_MODELS = MODELS.OPENAI;
  const OR_SHORTLIST = MODELS.OPENROUTER;
  const modelOptions = byoProvider === "openai" ? OPENAI_MODELS : ANTHROPIC_MODELS;

  const globalModelDisplay = byoProvider === "openrouter"
    ? `OpenRouter · ${orModel}`
    : byoProvider === "openai"
    ? `OpenAI · ${byoModel}`
    : `Anthropic · ${byoModel}`;

  const filteredOrModels = useMemo(
    () => sortWithRecommended(filterByTier(orModels, orFilter), orFilter),
    [orModels, orFilter],
  );

  const recommendedId = orFilter !== "all" ? TIER_RECOMMENDED[orFilter] : undefined;

  useEffect(() => {
    if (byoProvider === "openrouter" && orKey) fetchOrModels(orKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchOrModels = async (key: string) => {
    const cached = sessionStorage.getItem("openbrain_or_models_v2");
    if (cached) {
      try { setOrModels(JSON.parse(cached)); return; } catch {}
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
          architecture: m.architecture,
          modality: m.modality,
        }));
        setOrModels(models);
        sessionStorage.setItem("openbrain_or_models_v2", JSON.stringify(models));
      }
    } catch {}
  };

  const testByoKey = async () => {
    const key = byoProvider === "openrouter" ? orKey : byoKey;
    if (!key) return;
    setByoTestStatus("testing");
    try {
      const endpoint =
        byoProvider === "openai" ? "/api/openai"
        : byoProvider === "openrouter" ? "/api/openrouter"
        : "/api/anthropic";
      const model = byoProvider === "openrouter" ? orModel : byoModel;
      const { data: { session } } = await supabase.auth.getSession();
      const authH: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` } : {};
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Api-Key": key, ...authH },
        body: JSON.stringify({ model, max_tokens: 10, messages: [{ role: "user", content: "Say ok" }] }),
      });
      setByoTestStatus(res.ok ? "ok" : "fail");
    } catch {
      setByoTestStatus("fail");
    }
    setTimeout(() => setByoTestStatus(null), 3000);
  };

  const handleSaveKey = () => {
    setUserApiKey(byoKey || null);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  };

  const saveByoProvider = (p: string) => {
    setByoProvider(p);
    setUserProvider(p);
    if (p === "openai" && !OPENAI_MODELS.includes(byoModel)) {
      setByoModel(OPENAI_MODELS[0]);
      setUserModel(OPENAI_MODELS[0]);
    } else if (p === "anthropic" && !ANTHROPIC_MODELS.includes(byoModel)) {
      setByoModel(ANTHROPIC_MODELS[0]);
      setUserModel(ANTHROPIC_MODELS[0]);
    } else if (p === "openrouter" && orKey) {
      fetchOrModels(orKey);
    }
  };

  const saveOrKey = (key: string) => {
    setOrKey(key);
    setOpenRouterKey(key || null);
    if (key) fetchOrModels(key);
    setKeySaveStatus("saving");
    setTimeout(() => { setKeySaveStatus("saved"); setTimeout(() => setKeySaveStatus(null), 2000); }, 300);
  };

  const saveEmbedProvider = (p: string) => {
    setEmbedProviderState(p);
    setEmbedProvider(p);
  };

  const handleEmbedProviderClick = (p: string) => {
    if (p === embedProvider) { saveEmbedProvider(p); return; }
    setPendingEmbedProvider(p);
    if (activeBrain?.id) {
      authFetch(`/api/entries?brain_id=${activeBrain.id}&select=id,embedding_provider&limit=500`)
        .then(r => r.ok ? r.json() : [])
        .then((rows: Array<{ id: string; embedding_provider?: string | null }>) => {
          setEmbedMismatchCount(countEmbedMismatches(rows, p));
        })
        .catch(() => setEmbedMismatchCount(1));
    } else {
      setEmbedMismatchCount(0);
    }
  };

  const handleReembed = async (force = false) => {
    if (!activeBrain?.id) return;
    const key = embedProvider === "google" ? geminiKey : embedOpenAIKey;
    if (!key) return;
    setEmbedStatus("running");
    let totalProcessed = 0, totalFailed = 0;
    try {
      for (let i = 0; i < 100; i++) {
        const res = await authFetch("/api/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Embed-Provider": embedProvider, "X-Embed-Key": key },
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
      setEmbedStatus(totalProcessed === 0 ? `error:${e.message || "Network error"}` : `done:${totalProcessed}:${totalFailed}`);
    }
    setTimeout(() => setEmbedStatus(null), 10000);
  };

  return (
    <>
      {/* AI Provider / BYO Key */}
      <div className="rounded-2xl border p-4 space-y-3" style={{ background: "var(--color-surface-container-high)", borderColor: "var(--color-outline-variant)" }}>
        <p className="text-sm font-semibold text-on-surface">AI Provider</p>
        <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
          Use your own API key — no Everion credits deducted. Leave blank to use the shared key.
        </p>
        <div className="flex items-center gap-2">
          {["anthropic", "openrouter"].map((p) => (
            <button
              key={p}
              onClick={() => saveByoProvider(p)}
              className="rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors"
              style={{
                color: byoProvider === p ? "var(--color-on-primary)" : "var(--color-on-surface-variant)",
                borderColor: byoProvider === p ? "transparent" : "var(--color-outline-variant)",
                background: byoProvider === p ? "var(--color-primary)" : "transparent",
              }}
            >
              {p === "openrouter" ? "OpenRouter" : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        {byoProvider === "openrouter" ? (
          <>
            <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
              OpenRouter lets you use hundreds of models with one key.{" "}
              <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" style={{ color: "var(--color-primary)" }}>Get a key →</a>
            </p>
            <div className="space-y-1">
              <p className="text-xs font-medium" style={{ color: "var(--color-on-surface-variant)" }}>OpenRouter API Key</p>
              <div className="flex items-center gap-2">
                <input
                  type={showKey ? "text" : "password"}
                  value={orKey}
                  onChange={e => saveOrKey(e.target.value)}
                  placeholder="sk-or-..."
                  className="flex-1 rounded-xl px-3 py-2 text-xs bg-transparent border outline-none text-on-surface placeholder:text-on-surface-variant/40"
                  style={{ borderColor: "var(--color-outline-variant)" }}
                  onFocus={e => (e.target.style.borderColor = "var(--color-primary)")}
                  onBlur={e => (e.target.style.borderColor = "var(--color-outline-variant)")}
                />
                <button onClick={() => setShowKey(s => !s)} className="rounded-xl px-2 py-2 text-xs border transition-colors hover:bg-white/5" style={{ color: "var(--color-on-surface-variant)", borderColor: "var(--color-outline-variant)" }}>
                  {showKey ? "Hide" : "Show"}
                </button>
                <button onClick={testByoKey} disabled={!orKey} className="rounded-xl px-2 py-2 text-xs border transition-colors hover:bg-white/5 disabled:opacity-40" style={{ color: "var(--color-on-surface-variant)", borderColor: "var(--color-outline-variant)" }}>
                  {byoTestStatus === "testing" ? "…" : byoTestStatus === "ok" ? "✓" : byoTestStatus === "fail" ? "✗" : "Test"}
                </button>
              </div>
              {keySaveStatus && (
                <p className="text-xs" style={{ color: keySaveStatus === "saving" ? "var(--color-on-surface-variant)" : "var(--color-primary)" }}>
                  {keySaveStatus === "saving" ? "Saving…" : "✓ Saved"}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium" style={{ color: "var(--color-on-surface-variant)" }}>
                  Model{orModels.length > 0 && <span style={{ color: "var(--color-outline)" }}> ({filteredOrModels.length}/{orModels.length})</span>}
                </p>
                {orModels.length > 0 && (
                  <div className="flex items-center gap-1">
                    {TIER_OPTIONS.map(t => (
                      <button
                        key={t.value}
                        onClick={() => setOrFilter(t.value)}
                        className="rounded-lg px-2 py-0.5 text-[10px] font-medium border transition-colors"
                        style={{
                          background: orFilter === t.value ? "var(--color-primary)" : "transparent",
                          color: orFilter === t.value ? "var(--color-on-primary)" : "var(--color-on-surface-variant)",
                          borderColor: orFilter === t.value ? "transparent" : "var(--color-outline-variant)",
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <select
                value={orModel}
                onChange={e => { setOrModel(e.target.value); setOpenRouterModel(e.target.value); }}
                className="w-full rounded-xl px-3 py-2 text-xs bg-transparent border outline-none text-on-surface"
                style={{ borderColor: "var(--color-outline-variant)" }}
              >
                {(filteredOrModels.length > 0
                  ? filteredOrModels.map(m => ({ id: m.id, label: modelLabel(m, recommendedId) }))
                  : orModels.length === 0
                    ? OR_SHORTLIST.map(id => ({ id, label: id }))
                    : [{ id: orModel, label: orModel }]
                ).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <p className="text-[10px]" style={{ color: "var(--color-outline)" }}>Tip: choose a model with ZDR (zero data retention) for sensitive entries.</p>
            </div>
            {orModels.length > 0 && (
              <div className="space-y-3 pt-2 border-t" style={{ borderColor: "var(--color-outline-variant)" }}>
                <p className="text-xs font-semibold" style={{ color: "var(--color-on-surface-variant)" }}>
                  Per-task models
                  <span className="font-normal ml-1" style={{ color: "var(--color-outline)" }}>(filter above applies)</span>
                </p>
                {([
                  ["Entry capture", "capture"],
                  ["Fill Brain questions", "questions"],
                  ["Refine collection", "refine"],
                  ["Brain chat", "chat"],
                ] as [string, string][]).map(([label, task]) => (
                  <div key={task} className="flex items-center gap-2">
                    <span className="text-xs w-36 shrink-0" style={{ color: "var(--color-on-surface-variant)" }}>{label}</span>
                    <select
                      value={taskModels[task] ?? "default"}
                      onChange={e => {
                        const v = e.target.value === "default" ? null : e.target.value;
                        setModelForTask(task, v);
                        setTaskModels(prev => ({ ...prev, [task]: v }));
                      }}
                      className="flex-1 rounded-lg px-2 text-xs"
                      style={{ background: "var(--color-surface-container)", color: "var(--color-on-surface)", border: "1px solid var(--color-outline-variant)", height: 44 }}
                    >
                      <option value="default">Same as global default</option>
                      {filteredOrModels.map(m => (
                        <option key={m.id} value={m.id}>
                          {modelLabel(m, recommendedId)} [{getPriceTier(m.pricing)}]
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <span className="text-xs w-36 shrink-0" style={{ color: "var(--color-on-surface-variant)" }}>Image reading</span>
                  <select
                    value={taskModels["vision"] ?? "default"}
                    onChange={e => {
                      const v = e.target.value === "default" ? null : e.target.value;
                      setModelForTask("vision", v);
                      setTaskModels(prev => ({ ...prev, vision: v }));
                    }}
                    className="flex-1 rounded-lg px-2 text-xs"
                    style={{ background: "var(--color-surface-container)", color: "var(--color-on-surface)", border: "1px solid var(--color-outline-variant)", height: 44 }}
                  >
                    <option value="default">Same as global default</option>
                    {filteredOrModels
                      .filter(m => m.modality?.includes?.("image") || m.architecture?.modality?.includes?.("image"))
                      .map(m => (
                        <option key={m.id} value={m.id}>
                          {modelLabel(m, recommendedId)} [{getPriceTier(m.pricing)}]
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="space-y-1">
              <p className="text-xs font-medium" style={{ color: "var(--color-on-surface-variant)" }}>API Key</p>
              <div className="flex items-center gap-2">
                <input
                  type={showKey ? "text" : "password"}
                  value={byoKey}
                  onChange={e => { setByoKey(e.target.value); setKeySaved(false); }}
                  placeholder={byoProvider === "openai" ? "sk-..." : "sk-ant-..."}
                  className="flex-1 rounded-xl px-3 py-2 text-xs bg-transparent border outline-none text-on-surface placeholder:text-on-surface-variant/40"
                  style={{ borderColor: "var(--color-outline-variant)" }}
                  onFocus={e => (e.target.style.borderColor = "var(--color-primary)")}
                  onBlur={e => (e.target.style.borderColor = "var(--color-outline-variant)")}
                />
                <button onClick={() => setShowKey(s => !s)} className="rounded-xl px-2 py-2 text-xs border transition-colors hover:bg-white/5" style={{ color: "var(--color-on-surface-variant)", borderColor: "var(--color-outline-variant)" }}>
                  {showKey ? "Hide" : "Show"}
                </button>
                <button onClick={handleSaveKey} disabled={!byoKey} className="rounded-xl px-2 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40" style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}>
                  {keySaved ? "Saved!" : "Save"}
                </button>
                <button onClick={testByoKey} disabled={!byoKey} className="rounded-xl px-2 py-2 text-xs border transition-colors hover:bg-white/5 disabled:opacity-40" style={{ color: "var(--color-on-surface-variant)", borderColor: "var(--color-outline-variant)" }}>
                  {byoTestStatus === "testing" ? "…" : byoTestStatus === "ok" ? "✓" : byoTestStatus === "fail" ? "✗" : "Test"}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium" style={{ color: "var(--color-on-surface-variant)" }}>Model</p>
              <select
                value={byoModel}
                onChange={e => { setByoModel(e.target.value); setUserModel(e.target.value); }}
                className="w-full rounded-xl px-3 py-2 text-xs bg-transparent border outline-none text-on-surface"
                style={{ borderColor: "var(--color-outline-variant)" }}
              >
                {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Embedding Provider */}
      <div className="rounded-2xl border p-4 space-y-3" style={{ background: "var(--color-surface-container-high)", borderColor: "var(--color-outline-variant)" }}>
        <p className="text-sm font-semibold text-on-surface">Semantic Search & RAG</p>
        <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
          Powers semantic search, RAG chat, and smarter connection discovery. Requires a separate embedding API key.
        </p>
        <div className="flex items-center gap-2">
          {["openai", "google"].map(p => (
            <button
              key={p}
              onClick={() => handleEmbedProviderClick(p)}
              className="rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors"
              style={{
                color: embedProvider === p ? "var(--color-on-primary)" : "var(--color-on-surface-variant)",
                borderColor: embedProvider === p ? "transparent" : "var(--color-outline-variant)",
                background: embedProvider === p ? "var(--color-primary)" : "transparent",
              }}
            >
              {p === "openai" ? "OpenAI" : "Google"}
            </button>
          ))}
        </div>
        {pendingEmbedProvider && (
          <div className="rounded-xl p-3 text-xs space-y-2" style={{ background: "color-mix(in oklch, var(--color-error) 8%, var(--color-surface-container))", border: "1px solid color-mix(in oklch, var(--color-error) 25%, transparent)" }}>
            <p style={{ color: "var(--color-error)" }}>
              {embedMismatchCount > 0
                ? `${embedMismatchCount} entr${embedMismatchCount === 1 ? "y has" : "ies have"} embeddings from a different provider. Search will be inconsistent until you re-embed.`
                : "Switching providers may make search inconsistent until you re-embed."}
            </p>
            <div className="flex gap-2">
              <button onClick={() => { saveEmbedProvider(pendingEmbedProvider!); setPendingEmbedProvider(null); }} className="rounded-lg px-3 text-xs font-semibold" style={{ background: "color-mix(in oklch, var(--color-error) 15%, var(--color-surface-container))", color: "var(--color-error)", minHeight: 36 }}>
                Switch anyway
              </button>
              <button onClick={() => setPendingEmbedProvider(null)} className="rounded-lg px-3 text-xs" style={{ color: "var(--color-on-surface-variant)", minHeight: 36 }}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {embedProvider === "openai" ? (
          <div className="space-y-1">
            <p className="text-xs font-medium" style={{ color: "var(--color-on-surface-variant)" }}>OpenAI API Key <span style={{ color: "var(--color-outline)" }}>(text-embedding-3-small)</span></p>
            <div className="flex items-center gap-2">
              <input type={showEmbedKey ? "text" : "password"} value={embedOpenAIKey} onChange={e => { setEmbedOpenAIKeyState(e.target.value); setEmbedOpenAIKey(e.target.value || null); }} placeholder="sk-..." className="flex-1 rounded-xl px-3 py-2 text-xs bg-transparent border outline-none text-on-surface placeholder:text-on-surface-variant/40" style={{ borderColor: "var(--color-outline-variant)" }} onFocus={e => (e.target.style.borderColor = "var(--color-primary)")} onBlur={e => (e.target.style.borderColor = "var(--color-outline-variant)")} />
              <button onClick={() => setShowEmbedKey(s => !s)} className="rounded-xl px-2 py-2 text-xs border transition-colors hover:bg-white/5" style={{ color: "var(--color-on-surface-variant)", borderColor: "var(--color-outline-variant)" }}>{showEmbedKey ? "Hide" : "Show"}</button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-xs font-medium" style={{ color: "var(--color-on-surface-variant)" }}>
              Google Gemini API Key <span style={{ color: "var(--color-outline)" }}>(text-embedding-004)</span>{" "}
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: "var(--color-primary)" }}>Get key →</a>
            </p>
            <div className="flex items-center gap-2">
              <input type={showEmbedKey ? "text" : "password"} value={geminiKey} onChange={e => { setGeminiKeyState(e.target.value); setGeminiKey(e.target.value || null); }} placeholder="AIza..." className="flex-1 rounded-xl px-3 py-2 text-xs bg-transparent border outline-none text-on-surface placeholder:text-on-surface-variant/40" style={{ borderColor: "var(--color-outline-variant)" }} onFocus={e => (e.target.style.borderColor = "var(--color-primary)")} onBlur={e => (e.target.style.borderColor = "var(--color-outline-variant)")} />
              <button onClick={() => setShowEmbedKey(s => !s)} className="rounded-xl px-2 py-2 text-xs border transition-colors hover:bg-white/5" style={{ color: "var(--color-on-surface-variant)", borderColor: "var(--color-outline-variant)" }}>{showEmbedKey ? "Hide" : "Show"}</button>
            </div>
          </div>
        )}
        {activeBrain && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleReembed()}
              disabled={embedStatus === "running" || !(embedProvider === "google" ? geminiKey : embedOpenAIKey)}
              className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
            >
              {embedStatus?.startsWith("running") ? `Embedding…${embedStatus.includes(":") ? ` (${embedStatus.split(":")[1]})` : ""}` : "Embed new"}
            </button>
            <button
              onClick={() => handleReembed(true)}
              disabled={!!embedStatus?.startsWith("running") || !(embedProvider === "google" ? geminiKey : embedOpenAIKey)}
              className="rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors hover:bg-white/5 disabled:opacity-40"
              style={{ color: "var(--color-on-surface-variant)", borderColor: "var(--color-outline-variant)" }}
            >
              Re-embed all
            </button>
            {embedStatus && !embedStatus.startsWith("running") && (
              <span className="text-xs" style={{ color: embedStatus.startsWith("error") ? "var(--color-error)" : "var(--color-primary)" }}>
                {embedStatus.startsWith("error")
                  ? `✗ ${embedStatus.split(":").slice(1).join(":") || "Failed"}`
                  : (() => { const [, n, f] = embedStatus.split(":"); return `✓ ${n} embedded${+f > 0 ? `, ${f} failed` : ""}`; })()}
              </span>
            )}
          </div>
        )}
        <p className="text-[10px]" style={{ color: "var(--color-outline)" }}>New entries are embedded automatically. Use "Embed all" to backfill or after switching providers.</p>
      </div>

      {/* Voice Transcription */}
      <div className="rounded-2xl border p-4 space-y-3" style={{ background: "var(--color-surface-container-high)", borderColor: "var(--color-outline-variant)" }}>
        <p className="text-sm font-semibold text-on-surface">Voice Transcription</p>
        <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
          Powers the mic button in Quick Capture. Uses Groq Whisper (fast, free tier).{" "}
          <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{ color: "var(--color-primary)" }}>Get a free key →</a>
        </p>
        <div className="space-y-1">
          <p className="text-xs font-medium" style={{ color: "var(--color-on-surface-variant)" }}>Groq API Key <span style={{ color: "var(--color-outline)" }}>(whisper-large-v3-turbo)</span></p>
          <div className="flex items-center gap-2">
            <input
              type={showGroqKey ? "text" : "password"}
              value={groqKeyVal}
              onChange={e => { setGroqKeyVal(e.target.value); setGroqKey(e.target.value || null); }}
              placeholder="gsk_..."
              className="flex-1 rounded-xl px-3 py-2 text-xs bg-transparent border outline-none text-on-surface placeholder:text-on-surface-variant/40"
              style={{ borderColor: "var(--color-outline-variant)" }}
              onFocus={e => (e.target.style.borderColor = "var(--color-primary)")}
              onBlur={e => (e.target.style.borderColor = "var(--color-outline-variant)")}
            />
            <button onClick={() => setShowGroqKey(s => !s)} className="rounded-xl px-2 py-2 text-xs border transition-colors hover:bg-white/5" style={{ color: "var(--color-on-surface-variant)", borderColor: "var(--color-outline-variant)" }}>
              {showGroqKey ? "Hide" : "Show"}
            </button>
          </div>
          <p className="text-[10px]" style={{ color: "var(--color-outline)" }}>Also works with an OpenAI key (set above) — but Groq is faster and free.</p>
        </div>
      </div>

      {/* System Health */}
      <div className="rounded-2xl border p-4 space-y-3" style={{ background: "var(--color-surface-container-high)", borderColor: "var(--color-outline-variant)" }}>
        <p className="text-sm font-semibold text-on-surface">System Health</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-on-surface">AI</p>
            <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>{globalModelDisplay}</p>
          </div>
          <button
            onClick={async () => {
              setAiTestStatus("testing");
              try {
                const res = await callAI({ max_tokens: 10, messages: [{ role: "user", content: "Say ok" }] });
                setAiTestStatus(res.ok ? "ok" : "fail");
              } catch {
                setAiTestStatus("fail");
              }
              setTimeout(() => setAiTestStatus(null), 3000);
            }}
            className="rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors hover:bg-white/5"
            style={{ color: "var(--color-on-surface-variant)", borderColor: "var(--color-outline-variant)" }}
          >
            {aiTestStatus === "testing" ? "Testing…" : aiTestStatus === "ok" ? "✓ Connected" : aiTestStatus === "fail" ? "✗ Failed" : "Test"}
          </button>
        </div>
        <div className="border-t" style={{ borderColor: "var(--color-outline-variant)" }} />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-on-surface">Database</p>
            <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>Supabase</p>
          </div>
          <button
            onClick={async () => {
              setDbTestStatus("testing");
              try {
                const res = await authFetch("/api/health");
                setDbTestStatus(res.ok ? "ok" : "fail");
              } catch {
                setDbTestStatus("fail");
              }
              setTimeout(() => setDbTestStatus(null), 3000);
            }}
            className="rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors hover:bg-white/5"
            style={{ color: "var(--color-on-surface-variant)", borderColor: "var(--color-outline-variant)" }}
          >
            {dbTestStatus === "testing" ? "Testing…" : dbTestStatus === "ok" ? "✓ Connected" : dbTestStatus === "fail" ? "✗ Failed" : "Test"}
          </button>
        </div>
      </div>
    </>
  );
}
