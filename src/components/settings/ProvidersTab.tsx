import { useState, useMemo, useEffect, useRef } from "react";
import { authFetch } from "../../lib/authFetch";
import { callAI } from "../../lib/ai";
import {
  getUserApiKey,
  setUserApiKey,
  getUserModel,
  setUserModel,
  getUserProvider,
  setUserProvider,
  getOpenRouterKey,
  setOpenRouterKey,
  getOpenRouterModel,
  setOpenRouterModel,
  getGroqKey,
  setGroqKey,
  getEmbedProvider,
  setEmbedProvider,
  getEmbedOpenAIKey,
  setEmbedOpenAIKey,
  getGeminiKey,
  setGeminiKey,
  getModelForTask,
  setModelForTask,
  persistKeyToDb,
  isAISettingsLoaded,
  getSimpleMode,
  setUiSimpleMode,
  getEmbedOrModel,
  setEmbedOrModel,
  SIMPLE_AI_MODEL,
  SIMPLE_EMBED_MODEL,
  SIMPLE_VOICE_MODEL,
} from "../../lib/aiSettings";

import { supabase } from "../../lib/supabase";
import { MODELS } from "../../config/models";
import { countEmbedMismatches } from "../../lib/embedMismatch";
import {
  getPriceTier,
  filterByTier,
  sortWithRecommended,
  modelLabel,
  TIER_RECOMMENDED,
  CURATED_OR_MODELS,
} from "../../lib/orModelFilter";
import type { FilterTier } from "../../lib/orModelFilter";
import type { Brain } from "../../types";

const TIER_OPTIONS: { value: FilterTier; label: string }[] = [
  { value: "all", label: "All" },
  { value: "free", label: "Free" },
  { value: "cheap", label: "Cheap" },
  { value: "good", label: "Good" },
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
  const [orModel, setOrModel] = useState(
    () => getOpenRouterModel() || "google/gemma-4-31b-it:free",
  );
  const [orFilter, setOrFilter] = useState<FilterTier>("free");
  const [editingOrKey, setEditingOrKey] = useState(() => !getOpenRouterKey());
  const [perTaskOpen, setPerTaskOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [byoTestStatus, setByoTestStatus] = useState<string | null>(null);
  const [byoTestError, setByoTestError] = useState<string | null>(null);
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

  const [embedKeySaved, setEmbedKeySaved] = useState(false);
  const [groqKeySaved, setGroqKeySaved] = useState(false);

  const [aiTestStatus, setAiTestStatus] = useState<string | null>(null);
  const [dbTestStatus, setDbTestStatus] = useState<string | null>(null);

  const [simpleAiStatus, setSimpleAiStatus] = useState<string | null>(null);
  const [simpleEmbedStatus, setSimpleEmbedStatus] = useState<string | null>(null);
  const [simpleVoiceStatus, setSimpleVoiceStatus] = useState<string | null>(null);

  const ANTHROPIC_MODELS = MODELS.ANTHROPIC;
  const OPENAI_MODELS = MODELS.OPENAI;
  const modelOptions = byoProvider === "openai" ? OPENAI_MODELS : ANTHROPIC_MODELS;

  const globalModelDisplay =
    byoProvider === "openrouter"
      ? `OpenRouter · ${orModel}`
      : byoProvider === "openai"
        ? `OpenAI · ${byoModel}`
        : `Anthropic · ${byoModel}`;

  const filteredOrModels = useMemo(
    () => sortWithRecommended(filterByTier(CURATED_OR_MODELS, orFilter), orFilter),
    [orFilter],
  );

  const recommendedId =
    orFilter !== "all" ? TIER_RECOMMENDED[orFilter as keyof typeof TIER_RECOMMENDED] : undefined;

  // Re-hydrate local state from aiSettings once Supabase load completes.
  // Without this, keys typed then refreshed appear lost because the component
  // mounted before loadUserAISettings() populated the in-memory key store.
  useEffect(() => {
    const sync = () => {
      setByoKey(getUserApiKey() || "");
      setByoProvider(getUserProvider());
      setByoModel(getUserModel());
      const or = getOpenRouterKey() || "";
      setOrKey(or);
      setOrModel(getOpenRouterModel() || "google/gemma-4-31b-it:free");
      if (or) setEditingOrKey(false);
      setGroqKeyVal(getGroqKey() || "");
      setEmbedProviderState(getEmbedProvider());
      setEmbedOpenAIKeyState(getEmbedOpenAIKey() || "");
      setGeminiKeyState(getGeminiKey() || "");
      setSimpleMode(getSimpleMode());
    };
    if (isAISettingsLoaded()) sync();
    window.addEventListener("aiSettingsLoaded", sync);
    return () => window.removeEventListener("aiSettingsLoaded", sync);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const testByoKey = async () => {
    const key = byoProvider === "openrouter" ? orKey : byoKey;
    if (!key) return;
    setByoTestStatus("testing");
    setByoTestError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const endpoint =
        byoProvider === "openai"
          ? "/api/openai"
          : byoProvider === "openrouter"
            ? "/api/openrouter"
            : "/api/anthropic";
      const model = byoProvider === "openrouter" ? orModel : byoModel;
      const sessionRes = await supabase.auth.getSession();
      const accessToken = sessionRes.data?.session?.access_token;
      const authH: Record<string, string> = accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : {};
      const res = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-User-Api-Key": key.trim(), ...authH },
        body: JSON.stringify({
          model,
          max_tokens: 10,
          messages: [{ role: "user", content: "Say ok" }],
        }),
      });
      if (res.ok) {
        setByoTestStatus("ok");
      } else {
        const body = await res.json().catch(() => null);
        const msg = body?.error || body?.message || `${res.status}`;
        setByoTestError(msg);
        setByoTestStatus("fail");
      }
    } catch (e: any) {
      setByoTestStatus(e?.name === "AbortError" ? "timeout" : "fail");
      if (e?.name === "AbortError")
        setByoTestError("Request timed out — model may be slow or unavailable.");
    } finally {
      clearTimeout(timeout);
    }
    setTimeout(() => {
      setByoTestStatus(null);
      setByoTestError(null);
    }, 6000);
  };

  const handleSaveKey = async () => {
    setUserApiKey(byoKey || null);
    setKeySaved(true);
    const { error } = await persistKeyToDb({ api_key: byoKey || null });
    if (error) {
      console.error("[handleSaveKey]", error);
      setKeySaved(false);
    }
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
    }
  };

  const removeOrKey = async () => {
    setOpenRouterKey(null);
    setOrKey("");
    setEditingOrKey(true);
    await persistKeyToDb({ openrouter_key: null });
  };

  const saveOrKey = async () => {
    setOpenRouterKey(orKey || null);
    setByoProvider("openrouter");
    setUserProvider("openrouter");
    setKeySaveStatus("saving");
    const { error } = await persistKeyToDb({
      openrouter_key: orKey || null,
      ai_provider: "openrouter",
    });
    setKeySaveStatus(error ? "error" : "saved");
    if (error) console.error("[saveOrKey]", error);
    else if (orKey) setEditingOrKey(false);
    setTimeout(() => setKeySaveStatus(null), error ? 6000 : 2000);
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
    setPendingEmbedProvider(p);
    if (activeBrain?.id) {
      authFetch(`/api/entries?brain_id=${activeBrain.id}&select=id,embedding_provider&limit=500`)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: Array<{ id: string; embedding_provider?: string | null }>) => {
          setEmbedMismatchCount(countEmbedMismatches(rows, p));
        })
        .catch(() => setEmbedMismatchCount(1));
    } else {
      setEmbedMismatchCount(0);
    }
  };

  const runEmbedLoop = async (embedHeaders: Record<string, string>, force: boolean) => {
    if (!activeBrain?.id) return;
    setEmbedStatus("running");
    let totalProcessed = 0, totalFailed = 0;
    const RATE_LIMIT_PAUSE_MS = 8000;
    const MAX_RATE_RETRIES = 5;
    try {
      let rateRetries = 0;
      for (let i = 0; i < 100; i++) {
        const res = await authFetch("/api/embed", {
          method: "POST",
          headers: embedHeaders,
          body: JSON.stringify({ brain_id: activeBrain.id, batch: true, force }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          if (res.status === 429 && rateRetries < MAX_RATE_RETRIES) {
            rateRetries++;
            setEmbedStatus(`running:${totalProcessed} (rate limited, pausing…)`);
            await new Promise((r) => setTimeout(r, RATE_LIMIT_PAUSE_MS));
            i--; // retry same batch
            continue;
          }
          if (totalProcessed === 0) {
            setEmbedStatus(`error:${errData?.error || res.status}`);
            setTimeout(() => setEmbedStatus(null), 10000);
            return;
          }
          break;
        }
        rateRetries = 0;
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

  const handleReembedWithConfig = (provider: string, key: string, model: string | null, force = true) => {
    if (!key) return;
    const embedHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Embed-Provider": provider,
      "X-Embed-Key": key,
    };
    if (model) embedHeaders["X-Embed-Model"] = model;
    runEmbedLoop(embedHeaders, force);
  };

  const handleReembed = (force = false) => {
    const key = embedProvider === "google" ? geminiKey
      : embedProvider === "openrouter" ? orKey
      : embedOpenAIKey;
    if (!key) return;
    const embedHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Embed-Provider": embedProvider,
      "X-Embed-Key": key,
    };
    if (embedProvider === "openrouter") embedHeaders["X-Embed-Model"] = getEmbedOrModel();
    runEmbedLoop(embedHeaders, force);
  };

  const [simpleMode, setSimpleMode] = useState(() => getSimpleMode());
  const [modeToast, setModeToast] = useState<{ mode: "simple" | "advanced"; ai: string; embed: string; voice: string } | null>(null);

  const shortModel = (id: string) =>
    id.split("/").pop()?.split(":")[0]?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || id;

  const testSimpleModel = async (model: string, setStatus: (s: string | null) => void) => {
    if (!orKey) return;
    setStatus("testing");
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 15000);
    try {
      const sessionRes = await supabase.auth.getSession();
      const accessToken = sessionRes.data?.session?.access_token;
      const authH: Record<string, string> = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
      const res = await fetch("/api/openrouter", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-User-Api-Key": orKey.trim(), ...authH },
        body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: "user", content: "Say ok" }] }),
      });
      if (res.ok) {
        setStatus("ok");
      } else {
        const body = await res.json().catch(() => null);
        const msg = body?.error?.message || body?.error || body?.message || `HTTP ${res.status}`;
        setStatus(`fail:${msg}`);
      }
    } catch (e: any) {
      setStatus(e?.name === "AbortError" ? "timeout" : `fail:${e?.message || "Network error"}`);
    } finally {
      clearTimeout(to);
    }
    setTimeout(() => setStatus(null), 10000);
  };

  const testSimpleEmbed = async () => {
    if (!orKey) return;
    setSimpleEmbedStatus("testing");
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${orKey.trim()}`,
          "HTTP-Referer": window.location.origin,
          "X-Title": "Everion",
        },
        body: JSON.stringify({ model: SIMPLE_EMBED_MODEL, input: ["test"] }),
      });
      if (res.ok) {
        setSimpleEmbedStatus("ok");
      } else {
        const body = await res.json().catch(() => null);
        setSimpleEmbedStatus(`fail:${body?.error?.message || body?.error || res.status}`);
      }
    } catch (e: any) {
      setSimpleEmbedStatus(e?.name === "AbortError" ? "timeout" : "fail");
    } finally {
      clearTimeout(to);
    }
    setTimeout(() => setSimpleEmbedStatus(null), 8000);
  };

  return (
    <>
      {/* Simple / Advanced toggle */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-on-surface text-sm font-semibold">Intelligence</p>
          <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
            {simpleMode ? "Quick setup — one key, recommended model." : "Advanced: configure each provider and model."}
          </p>
        </div>
        <button
          onClick={() => {
            const next = !simpleMode;
            setSimpleMode(next);
            setUiSimpleMode(next);
            if (next) {
              setModeToast({ mode: "simple", ai: "Gemini 2.0 Flash Lite", embed: "NVIDIA Nemotron Embed 1B", voice: "Gemma 4 27B A4B" });
              // Switching to simple: re-embed with OR key + Nemotron
              if (orKey) handleReembedWithConfig("openrouter", orKey, SIMPLE_EMBED_MODEL, true);
            } else {
              const advAi = getOpenRouterModel() || SIMPLE_AI_MODEL;
              const advEmbed = getEmbedProvider() === "google" ? "Google text-embedding-004" : getEmbedOrModel();
              const advVoice = getModelForTask("capture") || advAi;
              setModeToast({ mode: "advanced", ai: shortModel(advAi), embed: shortModel(advEmbed), voice: shortModel(advVoice) });
              // Switching to advanced: re-embed with newly selected embed provider
              handleReembed(true);
            }
          }}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            borderColor: "var(--color-outline-variant)",
            color: "var(--color-on-surface-variant)",
          }}
        >
          {simpleMode ? "Advanced" : "Simple"}
        </button>
      </div>

      {simpleMode && (
        <div
          className="mb-4 space-y-3 rounded-2xl border p-4"
          style={{
            background: "var(--color-primary-container)",
            borderColor: "var(--color-outline-variant)",
          }}
        >
          <div>
            <p className="text-on-surface mb-0.5 text-sm font-semibold">OpenRouter API Key</p>
            <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
              One free key powers everything. Get it at{" "}
              <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--color-primary)" }}>
                openrouter.ai/keys
              </a>
            </p>
          </div>
          {orKey && !editingOrKey ? (
            <div className="flex items-center justify-between rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--color-outline-variant)", background: "var(--color-surface)" }}>
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-primary)" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 10.5l4.5 4.5 7.5-8" />
                </svg>
                <span className="text-sm font-medium" style={{ color: "var(--color-on-surface)" }}>Key loaded</span>
                <span className="font-mono text-xs" style={{ color: "var(--color-on-surface-variant)" }}>{orKey.slice(0, 8)}···</span>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => setEditingOrKey(true)} className="rounded-lg border px-2.5 py-1 text-xs transition-colors hover:bg-white/5" style={{ color: "var(--color-on-surface-variant)", borderColor: "var(--color-outline-variant)" }}>
                  Change
                </button>
                <button onClick={removeOrKey} className="rounded-lg border px-2.5 py-1 text-xs transition-colors hover:bg-white/5" style={{ color: "var(--color-error)", borderColor: "color-mix(in oklch, var(--color-error) 30%, transparent)" }}>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={orKey}
                  onChange={(e) => { setOrKey(e.target.value); setEditingOrKey(true); }}
                  placeholder="sk-or-…"
                  className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{ background: "var(--color-surface)", borderColor: "var(--color-outline-variant)", color: "var(--color-on-surface)" }}
                />
                <button onClick={saveOrKey} disabled={!orKey.trim()} className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}>
                  {keySaveStatus === "saved" ? "Saved ✓" : keySaveStatus === "saving" ? "…" : "Save"}
                </button>
              </div>
              {keySaveStatus === "error" && (
                <p className="text-xs" style={{ color: "var(--color-error)" }}>Failed to save — check connection.</p>
              )}
            </>
          )}

          {/* Auto-configured free models + test buttons */}
          <div className="border-t pt-3 space-y-2" style={{ borderColor: "var(--color-outline-variant)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-on-surface-variant)" }}>
              Auto-configured (free)
            </p>
            {([
              {
                label: "AI",
                sub: SIMPLE_AI_MODEL,
                status: simpleAiStatus,
                onTest: () => testSimpleModel(SIMPLE_AI_MODEL, setSimpleAiStatus),
              },
              {
                label: "Embed",
                sub: SIMPLE_EMBED_MODEL,
                status: simpleEmbedStatus,
                onTest: testSimpleEmbed,
              },
              {
                label: "Voice",
                sub: SIMPLE_VOICE_MODEL,
                status: simpleVoiceStatus,
                onTest: () => testSimpleModel(SIMPLE_VOICE_MODEL, setSimpleVoiceStatus),
              },
            ] as Array<{ label: string; sub: string; status: string | null; onTest: () => void }>).map(({ label, sub, status, onTest }) => {
              const isFail = status === "fail" || status?.startsWith("fail:");
              const errorMsg = status?.startsWith("fail:") ? status.slice(5) : null;
              return (
                <div key={label}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium" style={{ color: "var(--color-on-surface)" }}>{label}</p>
                      <p className="text-[10px]" style={{ color: "var(--color-on-surface-variant)" }}>{sub}</p>
                    </div>
                    <button
                      onClick={onTest}
                      disabled={!orKey.trim() || editingOrKey}
                      className="rounded-xl border px-3 py-1 text-xs font-medium transition-colors hover:bg-white/5 disabled:opacity-40 flex-shrink-0 ml-2"
                      style={{
                        color: status === "ok"
                          ? "var(--color-primary)"
                          : isFail || status === "timeout"
                            ? "var(--color-error)"
                            : "var(--color-on-surface-variant)",
                        borderColor: "var(--color-outline-variant)",
                      }}
                    >
                      {status === "testing" ? "Testing…"
                        : status === "ok" ? "✓ OK"
                        : status === "timeout" ? "Timed out"
                        : isFail ? "✗ Failed"
                        : "Test"}
                    </button>
                  </div>
                  {errorMsg && (
                    <p className="text-[10px] mt-0.5 leading-tight" style={{ color: "var(--color-error)" }}>
                      {errorMsg}
                    </p>
                  )}
                </div>
              );
            })}
            {!editingOrKey && orKey && (
              <p className="text-[10px]" style={{ color: "var(--color-outline)" }}>
                Save key first, then test each model. Switch to Advanced for full control.
              </p>
            )}
            {(editingOrKey || !orKey) && (
              <p className="text-[10px]" style={{ color: "var(--color-outline)" }}>
                Save your key to enable tests.
              </p>
            )}
          </div>
        </div>
      )}

      {/* AI Provider / BYO Key */}
      <div
        className={simpleMode ? "hidden" : "mt-4"}
      >
      <div
        className="space-y-3 rounded-2xl border p-4"
        style={{
          background: "var(--color-surface-container-high)",
          borderColor: "var(--color-outline-variant)",
        }}
      >
        <p className="text-on-surface text-sm font-semibold">AI Provider</p>
        <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
          Use your own API key — no Everion credits deducted. Leave blank to use the shared key.
        </p>
        <div className="flex items-center gap-2">
          {["openrouter"].map((p) => (
            <button
              key={p}
              onClick={() => saveByoProvider(p)}
              className="rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                color:
                  byoProvider === p ? "var(--color-on-primary)" : "var(--color-on-surface-variant)",
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
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--color-primary)" }}
              >
                Get a key →
              </a>
            </p>
            {/* API Key — compact display when saved */}
            <div className="space-y-1">
              <p
                className="text-xs font-medium"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                OpenRouter API Key
              </p>
              {orKey && !editingOrKey ? (
                <div
                  className="flex items-center justify-between rounded-xl border px-3 py-2"
                  style={{ borderColor: "var(--color-outline-variant)" }}
                >
                  <span
                    className="font-mono text-xs"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    {orKey.slice(0, 10)}···{orKey.slice(-4)}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={testByoKey}
                      className="rounded-lg border px-2 py-1 text-[10px] transition-colors hover:bg-white/5"
                      style={{
                        color:
                          byoTestStatus === "ok"
                            ? "var(--color-primary)"
                            : byoTestStatus === "fail"
                              ? "var(--color-error)"
                              : "var(--color-on-surface-variant)",
                        borderColor: "var(--color-outline-variant)",
                      }}
                    >
                      {byoTestStatus === "testing"
                        ? "…"
                        : byoTestStatus === "ok"
                          ? "✓ OK"
                          : byoTestStatus === "fail"
                            ? "✗ Fail"
                            : "Test"}
                    </button>
                    <button
                      onClick={() => setEditingOrKey(true)}
                      className="rounded-lg border px-2 py-1 text-[10px] transition-colors hover:bg-white/5"
                      style={{ color: "var(--color-on-surface-variant)", borderColor: "var(--color-outline-variant)" }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={removeOrKey}
                      className="rounded-lg border px-2 py-1 text-[10px] transition-colors hover:bg-white/5"
                      style={{ color: "var(--color-error)", borderColor: "color-mix(in oklch, var(--color-error) 30%, transparent)" }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    type={showKey ? "text" : "password"}
                    autoComplete="new-password"
                    value={orKey}
                    onChange={(e) => {
                      setOrKey(e.target.value);
                      setKeySaveStatus(null);
                    }}
                    placeholder="sk-or-..."
                    className="text-on-surface placeholder:text-on-surface-variant/40 w-full rounded-xl border bg-transparent px-3 py-2 text-xs outline-none"
                    style={{ borderColor: "var(--color-outline-variant)" }}
                    onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--color-outline-variant)")}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowKey((s) => !s)}
                      className="rounded-xl border px-3 py-2 text-xs transition-colors hover:bg-white/5"
                      style={{
                        color: "var(--color-on-surface-variant)",
                        borderColor: "var(--color-outline-variant)",
                      }}
                    >
                      {showKey ? "Hide" : "Show"}
                    </button>
                    <button
                      onClick={saveOrKey}
                      disabled={!orKey || keySaveStatus === "saving"}
                      className="rounded-xl px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                      style={{
                        background:
                          keySaveStatus === "error" ? "var(--color-error)" : "var(--color-primary)",
                        color: "var(--color-on-primary)",
                      }}
                    >
                      {keySaveStatus === "saving"
                        ? "…"
                        : keySaveStatus === "saved"
                          ? "Saved!"
                          : keySaveStatus === "error"
                            ? "DB Error"
                            : "Save"}
                    </button>
                    <button
                      onClick={testByoKey}
                      disabled={!orKey}
                      className="rounded-xl border px-3 py-2 text-xs transition-colors hover:bg-white/5 disabled:opacity-40"
                      style={{
                        color: "var(--color-on-surface-variant)",
                        borderColor: "var(--color-outline-variant)",
                      }}
                    >
                      {byoTestStatus === "testing"
                        ? "…"
                        : byoTestStatus === "ok"
                          ? "✓"
                          : byoTestStatus === "timeout"
                            ? "Timeout"
                            : byoTestStatus === "fail"
                              ? "✗"
                              : "Test"}
                    </button>
                  </div>
                  {byoTestError && (
                    <p className="text-[11px]" style={{ color: "var(--color-error)" }}>
                      ✗ {byoTestError}
                    </p>
                  )}
                  {byoTestStatus === "ok" && (
                    <p className="text-[11px]" style={{ color: "var(--color-primary)" }}>
                      ✓ Connected
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Model selector — tier filter as dropdown */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p
                  className="flex-1 text-xs font-medium"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  Model
                </p>
                <select
                  value={orFilter}
                  onChange={(e) => setOrFilter(e.target.value as FilterTier)}
                  className="cursor-pointer rounded-lg border bg-transparent px-2 py-1 text-[10px] outline-none"
                  style={{
                    color: "var(--color-on-surface-variant)",
                    borderColor: "var(--color-outline-variant)",
                  }}
                >
                  {TIER_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <select
                value={orModel}
                onChange={(e) => {
                  setOrModel(e.target.value);
                  setOpenRouterModel(e.target.value);
                }}
                className="text-on-surface w-full rounded-xl border bg-transparent px-3 py-2 text-xs outline-none"
                style={{ borderColor: "var(--color-outline-variant)" }}
              >
                {filteredOrModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {modelLabel(m, recommendedId)}
                  </option>
                ))}
              </select>
              <p className="text-[10px]" style={{ color: "var(--color-outline)" }}>
                Tip: choose a model with ZDR (zero data retention) for sensitive entries.
              </p>
            </div>

            {/* Per-task models — collapsible drawer */}
            <div className="border-t pt-1" style={{ borderColor: "var(--color-outline-variant)" }}>
              <button
                onClick={() => setPerTaskOpen((o) => !o)}
                className="flex w-full items-center justify-between py-1.5 text-left text-xs font-medium transition-colors hover:opacity-70"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                <span>Per-task models</span>
                <span style={{ color: "var(--color-outline)", fontSize: 10 }}>
                  {perTaskOpen ? "▲" : "▼"}
                </span>
              </button>
              {perTaskOpen && (
                <div className="space-y-3 pt-2 pb-1">
                  {(
                    [
                      ["Entry capture", "capture"],
                      ["Fill Brain questions", "questions"],
                      ["Refine collection", "refine"],
                      ["Brain chat", "chat"],
                    ] as [string, string][]
                  ).map(([label, task]) => (
                    <div key={task} className="flex flex-col gap-1">
                      <span
                        className="text-xs"
                        style={{ color: "var(--color-on-surface-variant)" }}
                      >
                        {label}
                      </span>
                      <select
                        value={taskModels[task] ?? "default"}
                        onChange={(e) => {
                          const v = e.target.value === "default" ? null : e.target.value;
                          setModelForTask(task, v);
                          setTaskModels((prev) => ({ ...prev, [task]: v }));
                        }}
                        className="w-full rounded-lg border bg-transparent px-2 text-xs outline-none"
                        style={{
                          color: "var(--color-on-surface)",
                          borderColor: "var(--color-outline-variant)",
                          height: 36,
                        }}
                      >
                        <option value="default">Same as global default</option>
                        {CURATED_OR_MODELS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {modelLabel(m, recommendedId)} [{getPriceTier(m.pricing)}]
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                  <div className="flex flex-col gap-1">
                    <span className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                      Image reading
                    </span>
                    <select
                      value={taskModels["vision"] ?? "default"}
                      onChange={(e) => {
                        const v = e.target.value === "default" ? null : e.target.value;
                        setModelForTask("vision", v);
                        setTaskModels((prev) => ({ ...prev, vision: v }));
                      }}
                      className="w-full rounded-lg border bg-transparent px-2 text-xs outline-none"
                      style={{
                        color: "var(--color-on-surface)",
                        borderColor: "var(--color-outline-variant)",
                        height: 36,
                      }}
                    >
                      <option value="default">Same as global default</option>
                      {CURATED_OR_MODELS.filter((m) => m.modality?.includes?.("image")).map((m) => (
                        <option key={m.id} value={m.id}>
                          {modelLabel(m, recommendedId)} [{getPriceTier(m.pricing)}]
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <p
                className="text-xs font-medium"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                API Key
              </p>
              <div className="flex flex-col gap-2">
                <input
                  type={showKey ? "text" : "password"}
                  autoComplete="new-password"
                  value={byoKey}
                  onChange={(e) => {
                    setByoKey(e.target.value);
                    setKeySaved(false);
                  }}
                  placeholder={byoProvider === "openai" ? "sk-..." : "sk-ant-..."}
                  className="text-on-surface placeholder:text-on-surface-variant/40 w-full rounded-xl border bg-transparent px-3 py-2 text-xs outline-none"
                  style={{ borderColor: "var(--color-outline-variant)" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--color-outline-variant)")}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowKey((s) => !s)}
                    className="rounded-xl border px-3 py-2 text-xs transition-colors hover:bg-white/5"
                    style={{
                      color: "var(--color-on-surface-variant)",
                      borderColor: "var(--color-outline-variant)",
                    }}
                  >
                    {showKey ? "Hide" : "Show"}
                  </button>
                  <button
                    onClick={handleSaveKey}
                    disabled={!byoKey}
                    className="rounded-xl px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                    style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
                  >
                    {keySaved ? "Saved!" : "Save"}
                  </button>
                  <button
                    onClick={testByoKey}
                    disabled={!byoKey}
                    className="rounded-xl border px-3 py-2 text-xs transition-colors hover:bg-white/5 disabled:opacity-40"
                    style={{
                      color: "var(--color-on-surface-variant)",
                      borderColor: "var(--color-outline-variant)",
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
            </div>
            <div className="space-y-1">
              <p
                className="text-xs font-medium"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                Model
              </p>
              <select
                value={byoModel}
                onChange={(e) => {
                  setByoModel(e.target.value);
                  setUserModel(e.target.value);
                }}
                className="text-on-surface w-full rounded-xl border bg-transparent px-3 py-2 text-xs outline-none"
                style={{ borderColor: "var(--color-outline-variant)" }}
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
      <div
        className="mt-4 space-y-3 rounded-2xl border p-4"
        style={{
          background: "var(--color-surface-container-high)",
          borderColor: "var(--color-outline-variant)",
        }}
      >
        <p className="text-on-surface text-sm font-semibold">Semantic Search & RAG</p>
        <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
          Powers semantic search, RAG chat, and smarter connection discovery. Requires a separate
          embedding API key.
        </p>
        <div className="flex items-center gap-2">
          {["google"].map((p) => (
            <button
              key={p}
              onClick={() => handleEmbedProviderClick(p)}
              className="rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                color:
                  embedProvider === p
                    ? "var(--color-on-primary)"
                    : "var(--color-on-surface-variant)",
                borderColor: embedProvider === p ? "transparent" : "var(--color-outline-variant)",
                background: embedProvider === p ? "var(--color-primary)" : "transparent",
              }}
            >
              {p === "openai" ? "OpenAI" : "Google"}
            </button>
          ))}
        </div>
        {pendingEmbedProvider && (
          <div
            className="space-y-2 rounded-xl p-3 text-xs"
            style={{
              background:
                "color-mix(in oklch, var(--color-error) 8%, var(--color-surface-container))",
              border: "1px solid color-mix(in oklch, var(--color-error) 25%, transparent)",
            }}
          >
            <p style={{ color: "var(--color-error)" }}>
              {embedMismatchCount > 0
                ? `${embedMismatchCount} entr${embedMismatchCount === 1 ? "y has" : "ies have"} embeddings from a different provider. Search will be inconsistent until you re-embed.`
                : "Switching providers may make search inconsistent until you re-embed."}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  saveEmbedProvider(pendingEmbedProvider!);
                  setPendingEmbedProvider(null);
                  handleReembed(true);
                }}
                className="rounded-lg px-3 text-xs font-semibold"
                style={{
                  background: "var(--color-primary)",
                  color: "var(--color-on-primary)",
                  minHeight: 36,
                }}
              >
                Switch & Re-embed
              </button>
              <button
                onClick={() => {
                  saveEmbedProvider(pendingEmbedProvider!);
                  setPendingEmbedProvider(null);
                }}
                className="rounded-lg px-3 text-xs"
                style={{ color: "var(--color-on-surface-variant)", minHeight: 36 }}
              >
                Switch only
              </button>
              <button
                onClick={() => setPendingEmbedProvider(null)}
                className="rounded-lg px-3 text-xs"
                style={{ color: "var(--color-on-surface-variant)", minHeight: 36 }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {embedProvider === "openai" ? (
          <div className="space-y-1">
            <p className="text-xs font-medium" style={{ color: "var(--color-on-surface-variant)" }}>
              OpenAI API Key{" "}
              <span style={{ color: "var(--color-outline)" }}>(text-embedding-3-small)</span>
            </p>
            <div className="flex flex-col gap-2">
              <input
                type={showEmbedKey ? "text" : "password"}
                autoComplete="new-password"
                value={embedOpenAIKey}
                onChange={(e) => {
                  setEmbedOpenAIKeyState(e.target.value);
                  setEmbedKeySaved(false);
                }}
                placeholder="sk-..."
                className="text-on-surface placeholder:text-on-surface-variant/40 w-full rounded-xl border bg-transparent px-3 py-2 text-xs outline-none"
                style={{ borderColor: "var(--color-outline-variant)" }}
                onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--color-outline-variant)")}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowEmbedKey((s) => !s)}
                  className="rounded-xl border px-3 py-2 text-xs transition-colors hover:bg-white/5"
                  style={{
                    color: "var(--color-on-surface-variant)",
                    borderColor: "var(--color-outline-variant)",
                  }}
                >
                  {showEmbedKey ? "Hide" : "Show"}
                </button>
                <button
                  onClick={async () => {
                    setEmbedOpenAIKey(embedOpenAIKey || null);
                    setEmbedKeySaved(true);
                    const { error } = await persistKeyToDb({
                      embed_openai_key: embedOpenAIKey || null,
                    });
                    if (error) {
                      console.error("[saveEmbedOpenAI]", error);
                      setEmbedKeySaved(false);
                    } else {
                      setTimeout(() => setEmbedKeySaved(false), 2000);
                    }
                  }}
                  disabled={!embedOpenAIKey}
                  className="rounded-xl px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
                >
                  {embedKeySaved ? "Saved!" : "Save"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-xs font-medium" style={{ color: "var(--color-on-surface-variant)" }}>
              Google Gemini API Key{" "}
              <span style={{ color: "var(--color-outline)" }}>(text-embedding-004)</span>{" "}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--color-primary)" }}
              >
                Get key →
              </a>
            </p>
            <div className="flex flex-col gap-2">
              <input
                type={showEmbedKey ? "text" : "password"}
                autoComplete="new-password"
                value={geminiKey}
                onChange={(e) => {
                  setGeminiKeyState(e.target.value);
                  setEmbedKeySaved(false);
                }}
                placeholder="AIza..."
                className="text-on-surface placeholder:text-on-surface-variant/40 w-full rounded-xl border bg-transparent px-3 py-2 text-xs outline-none"
                style={{ borderColor: "var(--color-outline-variant)" }}
                onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--color-outline-variant)")}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowEmbedKey((s) => !s)}
                  className="rounded-xl border px-3 py-2 text-xs transition-colors hover:bg-white/5"
                  style={{
                    color: "var(--color-on-surface-variant)",
                    borderColor: "var(--color-outline-variant)",
                  }}
                >
                  {showEmbedKey ? "Hide" : "Show"}
                </button>
                <button
                  onClick={async () => {
                    setGeminiKey(geminiKey || null);
                    setEmbedKeySaved(true);
                    const { error } = await persistKeyToDb({ gemini_key: geminiKey || null });
                    if (error) {
                      console.error("[saveGemini]", error);
                      setEmbedKeySaved(false);
                    } else {
                      setTimeout(() => setEmbedKeySaved(false), 2000);
                    }
                  }}
                  disabled={!geminiKey}
                  className="rounded-xl px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
                >
                  {embedKeySaved ? "Saved!" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
        {activeBrain && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleReembed()}
              disabled={
                embedStatus === "running" ||
                !(embedProvider === "google" ? geminiKey
                  : embedProvider === "openrouter" ? orKey
                  : embedOpenAIKey)
              }
              className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
            >
              {embedStatus?.startsWith("running")
                ? `Embedding…${embedStatus.includes(":") ? ` (${embedStatus.split(":")[1]})` : ""}`
                : "Embed new"}
            </button>
            <button
              onClick={() => handleReembed(true)}
              disabled={
                !!embedStatus?.startsWith("running") ||
                !(embedProvider === "google" ? geminiKey
                  : embedProvider === "openrouter" ? orKey
                  : embedOpenAIKey)
              }
              className="rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5 disabled:opacity-40"
              style={{
                color: "var(--color-on-surface-variant)",
                borderColor: "var(--color-outline-variant)",
              }}
            >
              Re-embed all
            </button>
            {embedStatus && !embedStatus.startsWith("running") && (
              <span
                className="text-xs"
                style={{
                  color: embedStatus.startsWith("error")
                    ? "var(--color-error)"
                    : "var(--color-primary)",
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
        <p className="text-[10px]" style={{ color: "var(--color-outline)" }}>
          New entries are embedded automatically. Use "Embed all" to backfill or after switching
          providers.
        </p>
      </div>

      {/* Voice Transcription */}
      <div
        className="mt-4 space-y-3 rounded-2xl border p-4"
        style={{
          background: "var(--color-surface-container-high)",
          borderColor: "var(--color-outline-variant)",
        }}
      >
        <p className="text-on-surface text-sm font-semibold">Voice Transcription</p>
        <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
          Powers the mic button in Quick Capture. Uses Groq Whisper (fast, free tier).{" "}
          <a
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--color-primary)" }}
          >
            Get a free key →
          </a>
        </p>
        <div className="space-y-1">
          <p className="text-xs font-medium" style={{ color: "var(--color-on-surface-variant)" }}>
            Groq API Key{" "}
            <span style={{ color: "var(--color-outline)" }}>(whisper-large-v3-turbo)</span>
          </p>
          <div className="flex flex-col gap-2">
            <input
              type={showGroqKey ? "text" : "password"}
              autoComplete="new-password"
              value={groqKeyVal}
              onChange={(e) => {
                setGroqKeyVal(e.target.value);
                setGroqKeySaved(false);
              }}
              placeholder="gsk_..."
              className="text-on-surface placeholder:text-on-surface-variant/40 w-full rounded-xl border bg-transparent px-3 py-2 text-xs outline-none"
              style={{ borderColor: "var(--color-outline-variant)" }}
              onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--color-outline-variant)")}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowGroqKey((s) => !s)}
                className="rounded-xl border px-3 py-2 text-xs transition-colors hover:bg-white/5"
                style={{
                  color: "var(--color-on-surface-variant)",
                  borderColor: "var(--color-outline-variant)",
                }}
              >
                {showGroqKey ? "Hide" : "Show"}
              </button>
              <button
                onClick={async () => {
                  setGroqKey(groqKeyVal || null);
                  setGroqKeySaved(true);
                  const { error } = await persistKeyToDb({ groq_key: groqKeyVal || null });
                  if (error) {
                    console.error("[saveGroq]", error);
                    setGroqKeySaved(false);
                  } else {
                    setTimeout(() => setGroqKeySaved(false), 2000);
                  }
                }}
                disabled={!groqKeyVal}
                className="rounded-xl px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
              >
                {groqKeySaved ? "Saved!" : "Save"}
              </button>
            </div>
          </div>
          <p className="text-[10px]" style={{ color: "var(--color-outline)" }}>
            Also works with an OpenAI key (set above) — but Groq is faster and free.
          </p>
        </div>
      </div>

      {/* System Health */}
      <div
        className="mt-4 space-y-3 rounded-2xl border p-4"
        style={{
          background: "var(--color-surface-container-high)",
          borderColor: "var(--color-outline-variant)",
        }}
      >
        <p className="text-on-surface text-sm font-semibold">System Health</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-on-surface text-xs font-medium">AI</p>
            <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
              {globalModelDisplay}
            </p>
          </div>
          <button
            onClick={async () => {
              setAiTestStatus("testing");
              try {
                const res = await callAI({
                  max_tokens: 10,
                  messages: [{ role: "user", content: "Say ok" }],
                });
                setAiTestStatus(res.ok ? "ok" : "fail");
              } catch {
                setAiTestStatus("fail");
              }
              setTimeout(() => setAiTestStatus(null), 3000);
            }}
            className="rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
            style={{
              color: "var(--color-on-surface-variant)",
              borderColor: "var(--color-outline-variant)",
            }}
          >
            {aiTestStatus === "testing"
              ? "Testing…"
              : aiTestStatus === "ok"
                ? "✓ Connected"
                : aiTestStatus === "fail"
                  ? "✗ Failed"
                  : "Test"}
          </button>
        </div>
        <div className="border-t" style={{ borderColor: "var(--color-outline-variant)" }} />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-on-surface text-xs font-medium">Database</p>
            <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
              Supabase
            </p>
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
            className="rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
            style={{
              color: "var(--color-on-surface-variant)",
              borderColor: "var(--color-outline-variant)",
            }}
          >
            {dbTestStatus === "testing"
              ? "Testing…"
              : dbTestStatus === "ok"
                ? "✓ Connected"
                : dbTestStatus === "fail"
                  ? "✗ Failed"
                  : "Test"}
          </button>
        </div>
      </div>
      </div>{/* end advanced wrapper */}

      {/* Learning Engine Transparency */}
      <LearningSection />

      {modeToast && (
        <ModelToast
          toast={modeToast}
          onDismiss={() => setModeToast(null)}
        />
      )}
    </>
  );
}

function ModelToast({
  toast,
  onDismiss,
}: {
  toast: { mode: "simple" | "advanced"; ai: string; embed: string; voice: string };
  onDismiss: () => void;
}) {
  const [pct, setPct] = useState(100);
  const rafRef = useRef<number>(0);
  const DURATION = 4500;

  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const p = Math.max(0, 100 - ((Date.now() - start) / DURATION) * 100);
      setPct(p);
      if (p <= 0) { onDismiss(); return; }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [onDismiss]);

  const isSimple = toast.mode === "simple";
  const rows = [
    { label: "AI", value: toast.ai },
    { label: "Embed", value: toast.embed },
    { label: "Voice", value: toast.voice },
  ];

  return (
    <div
      role="status"
      className="fixed bottom-24 left-1/2 z-50 w-[90vw] max-w-sm -translate-x-1/2 overflow-hidden rounded-2xl border lg:bottom-6"
      style={{
        background: "var(--color-surface-container-high)",
        borderColor: "color-mix(in oklch, var(--color-primary) 25%, transparent)",
        boxShadow: "var(--shadow-lg)",
        animation: "slide-up 0.25s ease-out",
      }}
    >
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold" style={{ color: "var(--color-primary)" }}>
            {isSimple ? "Simple mode — free models active" : "Advanced mode — your models active"}
          </p>
          <button onClick={onDismiss} style={{ color: "var(--color-on-surface-variant)" }} className="hover:opacity-70 transition-opacity ml-2">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-1">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex items-baseline gap-2">
              <span className="text-[10px] font-semibold w-8 flex-shrink-0" style={{ color: "var(--color-on-surface-variant)" }}>{label}</span>
              <span className="text-xs truncate" style={{ color: "var(--color-on-surface)" }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="h-0.5 w-full mt-2" style={{ background: "var(--color-outline-variant)" }}>
        <div className="h-full rounded-full transition-none" style={{ width: `${pct}%`, background: "var(--color-primary)" }} />
      </div>
    </div>
  );
}

function LearningSection() {
  const accepted = parseInt(localStorage.getItem("openbrain_refine_accepted") || "0", 10);
  const rejected = parseInt(localStorage.getItem("openbrain_refine_rejected") || "0", 10);
  const total = accepted + rejected;

  function handleReset() {
    localStorage.removeItem("openbrain_refine_accepted");
    localStorage.removeItem("openbrain_refine_rejected");
    window.location.reload();
  }

  return (
    <div
      className="space-y-3 rounded-2xl border p-4"
      style={{
        background: "var(--color-surface-container-high)",
        borderColor: "var(--color-outline-variant)",
      }}
    >
      <div>
        <p className="text-on-surface text-sm font-semibold">Learning</p>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>
          Your actions in Fix Issues shape future AI suggestions.
        </p>
      </div>
      {total > 0 ? (
        <div className="flex flex-wrap gap-3 text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
          <span>✓ <strong className="text-on-surface">{accepted}</strong> accepted</span>
          <span>✗ <strong className="text-on-surface">{rejected}</strong> rejected</span>
        </div>
      ) : (
        <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
          No feedback recorded yet — review suggestions in Fix Issues.
        </p>
      )}
      {total > 0 && (
        <button
          onClick={handleReset}
          className="rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
          style={{
            color: "var(--color-error)",
            borderColor: "color-mix(in oklch, var(--color-error) 30%, transparent)",
          }}
        >
          Reset preferences
        </button>
      )}
    </div>
  );
}
