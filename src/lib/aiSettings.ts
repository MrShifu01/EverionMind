import { supabase } from "./supabase";
import { KEYS } from "./storageKeys";

// ── In-memory store for sensitive API keys ──
const _keys: Record<string, string | null> = {};

// ── In-memory store for per-task model overrides ──
const _taskModels: Record<string, string | null> = {};

// ── Plan tier ──
let _plan = "free";

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
  for (const k of Object.keys(_taskModels)) delete _taskModels[k];
  _cachedUserId = null;
}

/** Call on sign-out to wipe cached identity. */
export function clearAISettingsCache(): void {
  for (const k of Object.keys(_keys)) delete _keys[k];
  for (const k of Object.keys(_taskModels)) delete _taskModels[k];
  _cachedUserId = null;
  _plan = "free";
}

// ── Key migration: uid-prefixed → unprefixed (run once at module init) ──
try {
  const authTokenKey = Object.keys(localStorage).find((k) => k.endsWith("-auth-token"));
  if (authTokenKey) {
    const data = JSON.parse(localStorage.getItem(authTokenKey)!);
    const uid: string | null = data?.user?.id || null;
    if (uid) {
      for (const suffix of ["gemini_key", "groq_key"]) {
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

// ── Sensitive key names (cleared from localStorage on migration) ──
const SENSITIVE_LS_KEYS = [KEYS.GROQ_KEY, KEYS.GEMINI_KEY] as const;

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

// ── Groq ──
export function getGroqKey(): string | null {
  return _keys[KEYS.GROQ_KEY] ?? null;
}
export function setGroqKey(key: string | null): void {
  _keys[KEYS.GROQ_KEY] = key || null;
  syncToSupabase({ groq_key: key || null });
}

// ── Gemini ──
export function getGeminiKey(): string | null {
  return _keys[KEYS.GEMINI_KEY] ?? null;
}
export function setGeminiKey(key: string | null): void {
  _keys[KEYS.GEMINI_KEY] = key || null;
  syncToSupabase({ gemini_key: key || null });
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
  return _taskModels[task] ?? null;
}
export function setModelForTask(task: string, model: string | null): void {
  _taskModels[task] = model;
  const col = TASK_COL[task];
  if (!col) return;
  syncToSupabase({ [col]: model || null });
}

// ── Load all settings from Supabase into memory / localStorage ──
export async function loadUserAISettings(userId: string): Promise<void> {
  _cachedUserId = userId;
  const { data: rows, error } = await supabase
    .from("user_ai_settings")
    .select("*")
    .eq("user_id", userId)
    .limit(1);

  if (error) {
    console.error("[aiSettings] loadUserAISettings failed:", error.message);
    for (const lsKey of SENSITIVE_LS_KEYS) {
      const val = localStorage.getItem(lsKey);
      if (val) _keys[lsKey] = val;
    }
    return;
  }

  const data = rows?.[0] ?? null;

  if (data) {
    _keys[KEYS.GROQ_KEY] = data.groq_key ?? null;
    _keys[KEYS.GEMINI_KEY] = data.gemini_key ?? null;
    _keys["anthropic_key"] = data.anthropic_key ?? null;
    _keys["openai_key"] = data.openai_key ?? null;
    _plan = data.plan ?? "free";

    for (const [task, col] of Object.entries(TASK_COL)) {
      _taskModels[task] = data[col] ?? null;
    }
    _taskModels["anthropic_model"] = data.anthropic_model ?? "claude-sonnet-4-6";
    _taskModels["openai_model"] = data.openai_model ?? "gpt-4o-mini";
    _taskModels["gemini_byok_model"] = data.gemini_byok_model ?? "gemini-2.5-flash-lite";
  } else {
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

// ── Plan ──
export function getPlan(): string { return _plan; }

// ── Anthropic ──
export function getAnthropicKey(): string | null { return _keys["anthropic_key"] ?? null; }
export function getAnthropicModel(): string { return _taskModels["anthropic_model"] ?? "claude-sonnet-4-6"; }

// ── OpenAI ──
export function getOpenAIKey(): string | null { return _keys["openai_key"] ?? null; }
export function getOpenAIModel(): string { return _taskModels["openai_model"] ?? "gpt-4o-mini"; }

// ── Gemini BYOK model ──
export function getGeminiByokModel(): string { return _taskModels["gemini_byok_model"] ?? "gemini-2.5-flash-lite"; }

// ── Derived: does this user have any AI access? ──
export function hasAIAccess(): boolean {
  return _plan === "pro" || !!(_keys["anthropic_key"] || _keys["openai_key"] || _keys["gemini_key"]);
}

// ── Update provider settings (in-memory + DB) ──
export async function updateProviderSettings(fields: {
  plan?: string;
  anthropic_key?: string | null;
  openai_key?: string | null;
  gemini_key?: string | null;
  anthropic_model?: string;
  openai_model?: string;
  gemini_byok_model?: string;
}): Promise<{ error: string | null }> {
  if (fields.anthropic_key !== undefined) _keys["anthropic_key"] = fields.anthropic_key;
  if (fields.openai_key !== undefined) _keys["openai_key"] = fields.openai_key;
  if (fields.gemini_key !== undefined) _keys["gemini_key"] = fields.gemini_key;
  if (fields.anthropic_model !== undefined) _taskModels["anthropic_model"] = fields.anthropic_model;
  if (fields.openai_model !== undefined) _taskModels["openai_model"] = fields.openai_model;
  if (fields.gemini_byok_model !== undefined) _taskModels["gemini_byok_model"] = fields.gemini_byok_model;
  if (fields.plan !== undefined) _plan = fields.plan;
  return persistKeyToDb(fields as any);
}

// ── Embedding settings ──
export function getEmbedProvider(): string {
  return "google";
}
export function setEmbedProvider(_p: string | null): void {
  // Always google — no-op
}

export function getEmbedHeaders(): { "X-Embed-Provider": string; "X-Embed-Key": string } {
  return {
    "X-Embed-Provider": "google",
    "X-Embed-Key": getGeminiKey() || "",
  };
}

/** Always true — server provides GEMINI_API_KEY. */
export function isAIConfigured(): boolean {
  return true;
}

// ── Singleton interface ──────────────────────────────────────────────────────

export interface AISnapshot {
  groqKey: string | null;
  geminiKey: string | null;
  anthropicKey: string | null;
  openaiKey: string | null;
  anthropicModel: string;
  openaiModel: string;
  geminiByokModel: string;
  modelCapture: string | null;
  modelQuestions: string | null;
  modelVision: string | null;
  modelRefine: string | null;
  modelChat: string | null;
  plan: string;
  hasAIAccess: boolean;
  isLoaded: boolean;
}

export interface AISettingsPatch {
  groq_key?: string | null;
  gemini_key?: string | null;
  anthropic_key?: string | null;
  openai_key?: string | null;
  anthropic_model?: string;
  openai_model?: string;
  gemini_byok_model?: string;
  model_capture?: string | null;
  model_questions?: string | null;
  model_vision?: string | null;
  model_refine?: string | null;
  model_chat?: string | null;
  plan?: string;
}

export interface ProviderConfig {
  provider: "anthropic" | "openai" | "gemini-byok" | "managed-gemini";
  key: string;
  model: string;
}

function _applyPatchToMemory(patch: AISettingsPatch): void {
  if (patch.groq_key !== undefined) _keys[KEYS.GROQ_KEY] = patch.groq_key;
  if (patch.gemini_key !== undefined) _keys[KEYS.GEMINI_KEY] = patch.gemini_key;
  if (patch.anthropic_key !== undefined) _keys["anthropic_key"] = patch.anthropic_key;
  if (patch.openai_key !== undefined) _keys["openai_key"] = patch.openai_key;
  if (patch.anthropic_model !== undefined) _taskModels["anthropic_model"] = patch.anthropic_model;
  if (patch.openai_model !== undefined) _taskModels["openai_model"] = patch.openai_model;
  if (patch.gemini_byok_model !== undefined) _taskModels["gemini_byok_model"] = patch.gemini_byok_model;
  if (patch.model_capture !== undefined) _taskModels["capture"] = patch.model_capture;
  if (patch.model_questions !== undefined) _taskModels["questions"] = patch.model_questions;
  if (patch.model_vision !== undefined) _taskModels["vision"] = patch.model_vision;
  if (patch.model_refine !== undefined) _taskModels["refine"] = patch.model_refine;
  if (patch.model_chat !== undefined) _taskModels["chat"] = patch.model_chat;
  if (patch.plan !== undefined) _plan = patch.plan;
}

export const aiSettings = {
  get(): AISnapshot {
    return {
      groqKey: _keys[KEYS.GROQ_KEY] ?? null,
      geminiKey: _keys[KEYS.GEMINI_KEY] ?? null,
      anthropicKey: _keys["anthropic_key"] ?? null,
      openaiKey: _keys["openai_key"] ?? null,
      anthropicModel: _taskModels["anthropic_model"] ?? "claude-sonnet-4-6",
      openaiModel: _taskModels["openai_model"] ?? "gpt-4o-mini",
      geminiByokModel: _taskModels["gemini_byok_model"] ?? "gemini-2.5-flash-lite",
      modelCapture: _taskModels["capture"] ?? null,
      modelQuestions: _taskModels["questions"] ?? null,
      modelVision: _taskModels["vision"] ?? null,
      modelRefine: _taskModels["refine"] ?? null,
      modelChat: _taskModels["chat"] ?? null,
      plan: _plan,
      hasAIAccess: hasAIAccess(),
      isLoaded: _loaded,
    };
  },

  async set(patch: AISettingsPatch): Promise<{ error: string | null }> {
    _applyPatchToMemory(patch);
    return persistKeyToDb(patch as Record<string, string | boolean | null>);
  },

  async load(userId: string): Promise<void> {
    return loadUserAISettings(userId);
  },

  reset(): void {
    clearAISettingsCache();
  },
};

export function resolveProvider(task?: string): ProviderConfig {
  const snap = aiSettings.get();

  if (snap.anthropicKey) {
    const model = task
      ? (_taskModels[task === "chat" ? "chat" : task] ?? snap.anthropicModel)
      : snap.anthropicModel;
    return { provider: "anthropic", key: snap.anthropicKey, model: model ?? snap.anthropicModel };
  }

  if (snap.openaiKey) {
    const model = snap.openaiModel;
    return { provider: "openai", key: snap.openaiKey, model };
  }

  if (snap.geminiKey) {
    return { provider: "gemini-byok", key: snap.geminiKey, model: snap.geminiByokModel };
  }

  return { provider: "managed-gemini", key: "", model: snap.geminiByokModel };
}
