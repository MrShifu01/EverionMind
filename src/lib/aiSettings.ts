import { supabase } from "./supabase";
import { MODEL as DEFAULT_MODEL } from "../data/constants";
import { KEYS } from "./storageKeys";

// ── In-memory store for sensitive API keys ──
// Keys never touch localStorage; live only in this module's memory.
const _keys: Record<string, string | null> = {};

// ── Cached user ID set at login — used by syncToSupabase ──
let _cachedUserId: string | null = null;

/** Clear in-memory key store and cached user ID. For tests only. */
export function _resetForTests(): void {
  for (const k of Object.keys(_keys)) delete _keys[k];
  _cachedUserId = null;
}

/** Call on sign-out to wipe cached identity. */
export function clearAISettingsCache(): void {
  for (const k of Object.keys(_keys)) delete _keys[k];
  _cachedUserId = null;
}

// ── Key migration: uid-prefixed → unprefixed (run once at module init) ──
try {
  const authTokenKey = Object.keys(localStorage).find((k) => k.endsWith("-auth-token"));
  if (authTokenKey) {
    const data = JSON.parse(localStorage.getItem(authTokenKey)!);
    const uid: string | null = data?.user?.id || null;
    if (uid) {
      for (const suffix of [
        "api_key", "model", "provider", "openrouter_key",
        "openrouter_model", "embed_provider", "embed_openai_key", "gemini_key",
        "groq_key",
      ]) {
        const oldKey = `openbrain_${uid}_${suffix}`;
        const newKey = `openbrain_${suffix}`;
        if (!localStorage.getItem(newKey) && localStorage.getItem(oldKey)) {
          localStorage.setItem(newKey, localStorage.getItem(oldKey)!);
        }
      }
    }
  }
} catch { /* ignore */ }

// ── Sensitive key names (localStorage entries to clear on migration) ──
const SENSITIVE_LS_KEYS = [
  KEYS.AI_API_KEY,
  KEYS.OPENROUTER_KEY,
  KEYS.GROQ_KEY,
  KEYS.EMBED_OPENAI_KEY,
  KEYS.GEMINI_KEY,
] as const;

export function getUserId(): string | null {
  try {
    const key = Object.keys(localStorage).find((k) => k.endsWith("-auth-token"));
    if (key) {
      const data = JSON.parse(localStorage.getItem(key)!);
      return data?.user?.id || null;
    }
  } catch { /* ignore */ }
  return null;
}

// ── Internal helper: fire-and-forget Supabase upsert ──
function syncToSupabase(fields: Record<string, string | null>): void {
  const uid = _cachedUserId || getUserId();
  if (!uid) return;
  supabase
    .from("user_ai_settings")
    .upsert(
      { user_id: uid, ...fields, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
}

// ── Primary AI provider ──
export function getUserApiKey(): string | null {
  return _keys[KEYS.AI_API_KEY] ?? null;
}
export function setUserApiKey(key: string | null): void {
  _keys[KEYS.AI_API_KEY] = key || null;
  syncToSupabase({ api_key: key || null });
}

export function getUserModel(): string {
  return localStorage.getItem(KEYS.AI_MODEL) || DEFAULT_MODEL;
}
export function setUserModel(model: string | null): void {
  if (model) localStorage.setItem(KEYS.AI_MODEL, model);
  else localStorage.removeItem(KEYS.AI_MODEL);
  syncToSupabase({ ai_model: model || null });
}

export function getUserProvider(): string {
  return localStorage.getItem(KEYS.AI_PROVIDER) || "anthropic";
}
export function setUserProvider(provider: string | null): void {
  localStorage.setItem(KEYS.AI_PROVIDER, provider || "anthropic");
  syncToSupabase({ ai_provider: provider || "anthropic" });
}

// ── OpenRouter ──
export function getOpenRouterKey(): string | null {
  return _keys[KEYS.OPENROUTER_KEY] ?? null;
}
export function setOpenRouterKey(key: string | null): void {
  _keys[KEYS.OPENROUTER_KEY] = key || null;
  syncToSupabase({ openrouter_key: key || null });
}

export function getOpenRouterModel(): string | null {
  return localStorage.getItem(KEYS.OPENROUTER_MODEL) || null;
}
export function setOpenRouterModel(model: string | null): void {
  if (model) localStorage.setItem(KEYS.OPENROUTER_MODEL, model);
  else localStorage.removeItem(KEYS.OPENROUTER_MODEL);
  syncToSupabase({ openrouter_model: model || null });
}

// ── Groq ──
export function getGroqKey(): string | null {
  return _keys[KEYS.GROQ_KEY] ?? null;
}
export function setGroqKey(key: string | null): void {
  _keys[KEYS.GROQ_KEY] = key || null;
  syncToSupabase({ groq_key: key || null });
}

// ── Per-task model overrides ──
const TASK_COL: Record<string, string> = {
  capture: "model_capture",
  questions: "model_questions",
  vision: "model_vision",
  refine: "model_refine",
  chat: "model_chat",
};

export function getModelForTask(task: string): string | null {
  return localStorage.getItem(KEYS.taskModel(task)) || null;
}
export function setModelForTask(task: string, model: string | null): void {
  const lsKey = KEYS.taskModel(task);
  if (model) localStorage.setItem(lsKey, model);
  else localStorage.removeItem(lsKey);
  const col = TASK_COL[task];
  if (!col) return;
  syncToSupabase({ [col]: model || null });
}

// ── Load all settings from Supabase into memory / localStorage ──
export async function loadUserAISettings(userId: string): Promise<void> {
  _cachedUserId = userId;
  const { data } = await supabase
    .from("user_ai_settings")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (data) {
    // Sensitive keys → memory
    _keys[KEYS.AI_API_KEY]      = data.api_key ?? null;
    _keys[KEYS.OPENROUTER_KEY]  = data.openrouter_key ?? null;
    _keys[KEYS.GROQ_KEY]        = data.groq_key ?? null;
    _keys[KEYS.EMBED_OPENAI_KEY] = data.embed_openai_key ?? null;
    _keys[KEYS.GEMINI_KEY]      = data.gemini_key ?? null;

    // Non-sensitive settings → localStorage
    const set = (lsKey: string, val: string | null | undefined) => {
      if (val) localStorage.setItem(lsKey, val);
      else localStorage.removeItem(lsKey);
    };
    set(KEYS.AI_MODEL, data.ai_model);
    set(KEYS.AI_PROVIDER, data.ai_provider);
    set(KEYS.OPENROUTER_MODEL, data.openrouter_model);
    set(KEYS.EMBED_PROVIDER, data.embed_provider);

    for (const [task, col] of Object.entries(TASK_COL)) {
      set(KEYS.taskModel(task), data[col]);
    }
  } else {
    // No Supabase record: migrate any localStorage keys to memory
    for (const lsKey of SENSITIVE_LS_KEYS) {
      const val = localStorage.getItem(lsKey);
      if (val) _keys[lsKey] = val;
    }
  }

  // Always clear sensitive key values from localStorage
  for (const lsKey of SENSITIVE_LS_KEYS) {
    localStorage.removeItem(lsKey);
  }
}

// ── Embedding settings ──
export function getEmbedProvider(): string {
  return localStorage.getItem(KEYS.EMBED_PROVIDER) || "openai";
}
export function setEmbedProvider(p: string | null): void {
  localStorage.setItem(KEYS.EMBED_PROVIDER, p || "openai");
  syncToSupabase({ embed_provider: p || "openai" });
}

export function getEmbedOpenAIKey(): string | null {
  return _keys[KEYS.EMBED_OPENAI_KEY] ?? null;
}
export function setEmbedOpenAIKey(key: string | null): void {
  _keys[KEYS.EMBED_OPENAI_KEY] = key || null;
  syncToSupabase({ embed_openai_key: key || null });
}

export function getGeminiKey(): string | null {
  return _keys[KEYS.GEMINI_KEY] ?? null;
}
export function setGeminiKey(key: string | null): void {
  _keys[KEYS.GEMINI_KEY] = key || null;
  syncToSupabase({ gemini_key: key || null });
}

export function getEmbedKey(): string | null {
  return getEmbedProvider() === "google" ? getGeminiKey() : getEmbedOpenAIKey();
}

export function getEmbedHeaders(): { "X-Embed-Provider": string; "X-Embed-Key": string } | null {
  const provider = getEmbedProvider();
  const key = getEmbedKey();
  if (!key) return null;
  return { "X-Embed-Provider": provider, "X-Embed-Key": key };
}
