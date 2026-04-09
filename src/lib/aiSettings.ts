import { supabase } from "./supabase";
import { MODEL as DEFAULT_MODEL } from "../data/constants";
import { KEYS } from "./storageKeys";

// ── In-memory store for sensitive API keys ──
// Keys never touch localStorage; live only in this module's memory.
const _keys: Record<string, string | null> = {};

// ── Hydration signal: set true after loadUserAISettings completes ──
let _loaded = false;
export function isAISettingsLoaded(): boolean {
  return _loaded;
}

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
        "api_key",
        "model",
        "provider",
        "openrouter_key",
        "openrouter_model",
        "embed_provider",
        "embed_openai_key",
        "gemini_key",
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
} catch {
  /* ignore */
}

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
  } catch {
    /* ignore */
  }
  return null;
}

// ── Internal helper: fire-and-forget Supabase upsert ──
function syncToSupabase(fields: Record<string, string | boolean | null>): void {
  const uid = _cachedUserId || getUserId();
  if (!uid) return;
  supabase
    .from("user_ai_settings")
    .upsert(
      { user_id: uid, ...fields, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    )
    .then(({ error }) => {
      if (error) console.error("[aiSettings] syncToSupabase failed:", error.message, fields);
    });
}

// ── Awaitable save — use in Save buttons to surface DB errors to the user ──
export async function persistKeyToDb(
  fields: Record<string, string | boolean | null>,
): Promise<{ error: string | null }> {
  const uid = _cachedUserId || getUserId();
  if (!uid) return { error: "Not authenticated — please sign in again." };
  const { error } = await supabase
    .from("user_ai_settings")
    .upsert(
      { user_id: uid, ...fields, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  return { error: error?.message ?? null };
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
  const stored = localStorage.getItem(KEYS.AI_PROVIDER);
  // Anthropic has been removed as a user-selectable provider.
  if (!stored || stored === "anthropic") return "openrouter";
  return stored;
}
export function setUserProvider(provider: string | null): void {
  localStorage.setItem(KEYS.AI_PROVIDER, provider || "openrouter");
  syncToSupabase({ ai_provider: provider || "openrouter" });
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
  // Avoid .single()/.maybeSingle() — both send Accept: application/vnd.pgrst.object+json
  // which PostgREST returns 406 when 0 rows exist (new user with no saved settings).
  const { data: rows, error } = await supabase
    .from("user_ai_settings")
    .select("*")
    .eq("user_id", userId)
    .limit(1);

  if (error) {
    console.error("[aiSettings] loadUserAISettings failed:", error.message);
    // Fall back to any keys that may still be in localStorage
    for (const lsKey of SENSITIVE_LS_KEYS) {
      const val = localStorage.getItem(lsKey);
      if (val) _keys[lsKey] = val;
    }
    return;
  }

  const data = rows?.[0] ?? null;

  if (data) {
    // Sensitive keys → memory
    _keys[KEYS.AI_API_KEY] = data.api_key ?? null;
    _keys[KEYS.OPENROUTER_KEY] = data.openrouter_key ?? null;
    _keys[KEYS.GROQ_KEY] = data.groq_key ?? null;
    _keys[KEYS.EMBED_OPENAI_KEY] = data.embed_openai_key ?? null;
    _keys[KEYS.GEMINI_KEY] = data.gemini_key ?? null;

    // Non-sensitive settings → localStorage
    const set = (lsKey: string, val: string | null | undefined) => {
      if (val) localStorage.setItem(lsKey, val);
      else localStorage.removeItem(lsKey);
    };
    set(KEYS.AI_MODEL, data.ai_model);
    set(KEYS.AI_PROVIDER, data.ai_provider);
    set(KEYS.OPENROUTER_MODEL, data.openrouter_model);
    set(KEYS.EMBED_PROVIDER, data.embed_provider);
    set(KEYS.EMBED_OR_MODEL, data.embed_or_model);
    // simple_mode is boolean in DB — serialize to localStorage
    if (typeof data.simple_mode === "boolean") {
      localStorage.setItem(KEYS.SIMPLE_MODE, String(data.simple_mode));
    } else if (data.simple_mode === null || data.simple_mode === undefined) {
      localStorage.setItem(KEYS.SIMPLE_MODE, "true");
    }

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

  _loaded = true;
  try {
    window.dispatchEvent(new CustomEvent("aiSettingsLoaded"));
  } catch {
    /* non-browser */
  }
}

// ── Simple mode free model constants ──
export const SIMPLE_AI_MODEL = "google/gemini-2.0-flash-exp:free";
export const SIMPLE_EMBED_MODEL = "nvidia/llama-nemotron-embed-vl-1b-v2:free";
export const SIMPLE_VOICE_MODEL = "google/gemma-3-27b-it:free";

// ── Embedding settings ──
export function getSimpleMode(): boolean {
  const val = localStorage.getItem(KEYS.SIMPLE_MODE);
  return val === null ? true : val !== "false";
}
export function setUiSimpleMode(val: boolean): void {
  localStorage.setItem(KEYS.SIMPLE_MODE, String(val));
  syncToSupabase({ simple_mode: val });
}

export function getEmbedOrModel(): string {
  return localStorage.getItem(KEYS.EMBED_OR_MODEL) || "nvidia/llama-nemotron-embed-vl-1b-v2:free";
}
export function setEmbedOrModel(model: string | null): void {
  if (model) localStorage.setItem(KEYS.EMBED_OR_MODEL, model);
  else localStorage.removeItem(KEYS.EMBED_OR_MODEL);
  syncToSupabase({ embed_or_model: model || null });
}

export function getEmbedProvider(): string {
  const stored = localStorage.getItem(KEYS.EMBED_PROVIDER);
  // OpenAI has been removed as an embedding provider option.
  if (!stored || stored === "openai") return "google";
  return stored; // "google" or "openrouter"
}
export function setEmbedProvider(p: string | null): void {
  localStorage.setItem(KEYS.EMBED_PROVIDER, p || "google");
  syncToSupabase({ embed_provider: p || "google" });
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
  const p = getEmbedProvider();
  if (p === "google") return getGeminiKey();
  if (p === "openrouter") return getOpenRouterKey();
  return getEmbedOpenAIKey();
}

export function getEmbedHeaders(): {
  "X-Embed-Provider": string;
  "X-Embed-Key": string;
  "X-Embed-Model"?: string;
} | null {
  // Simple mode: always OpenRouter + NVIDIA Nemotron — never touches advanced embed config
  if (getSimpleMode()) {
    const key = getOpenRouterKey();
    if (!key) return null;
    return { "X-Embed-Provider": "openrouter", "X-Embed-Key": key, "X-Embed-Model": SIMPLE_EMBED_MODEL };
  }
  const provider = getEmbedProvider();
  const key = getEmbedKey();
  if (!key) return null;
  const h: { "X-Embed-Provider": string; "X-Embed-Key": string; "X-Embed-Model"?: string } = {
    "X-Embed-Provider": provider,
    "X-Embed-Key": key,
  };
  if (provider === "openrouter") h["X-Embed-Model"] = getEmbedOrModel();
  return h;
}

/** Returns true if the user has configured at least one AI provider key. */
export function isAIConfigured(): boolean {
  return !!(getUserApiKey() || getOpenRouterKey() || getGroqKey() || getGeminiKey());
}
