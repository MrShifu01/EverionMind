/**
 * aiFetch — wrapper around authFetch that injects the user's
 * BYO API key and preferred model when set.
 *
 * Usage:
 *   import { aiFetch, getUserModel } from "../lib/aiFetch";
 *   const res = await aiFetch("/api/anthropic", { method: "POST", body: JSON.stringify({ model: getUserModel(), ... }) });
 */
import { authFetch } from "./authFetch";
import { supabase } from "./supabase";
import { MODEL as DEFAULT_MODEL } from "../data/constants";

// Prefix for all settings keys — no user-ID scoping needed (single user per browser)
const P = "openbrain_";

export function getUserId() {
  // Try Supabase auth session from localStorage
  try {
    const key = Object.keys(localStorage).find(k => k.endsWith("-auth-token"));
    if (key) {
      const data = JSON.parse(localStorage.getItem(key));
      return data?.user?.id || null;
    }
  } catch {}
  return null;
}

// ─── Migrate old user-scoped keys to new unscoped format ───
// Run once on load: if new keys don't exist but old user-scoped keys do, copy them over
try {
  const uid = getUserId();
  if (uid) {
    const migrations = [
      ["api_key"], ["model"], ["provider"], ["openrouter_key"], ["openrouter_model"],
      ["embed_provider"], ["embed_openai_key"], ["gemini_key"],
    ];
    for (const [suffix] of migrations) {
      const oldKey = `openbrain_${uid}_${suffix}`;
      const newKey = `${P}${suffix}`;
      if (!localStorage.getItem(newKey) && localStorage.getItem(oldKey)) {
        localStorage.setItem(newKey, localStorage.getItem(oldKey));
      }
    }
  }
} catch {}

export function getUserApiKey() {
  return localStorage.getItem(`${P}api_key`) || null;
}

export function setUserApiKey(key) {
  if (key) localStorage.setItem(`${P}api_key`, key);
  else localStorage.removeItem(`${P}api_key`);
}

export function getUserModel() {
  return localStorage.getItem(`${P}model`) || DEFAULT_MODEL;
}

export function setUserModel(model) {
  if (model) localStorage.setItem(`${P}model`, model);
  else localStorage.removeItem(`${P}model`);
}

export function getUserProvider() {
  return localStorage.getItem(`${P}provider`) || "anthropic";
}

export function setUserProvider(provider) {
  localStorage.setItem(`${P}provider`, provider || "anthropic");
}

export function getOpenRouterKey() {
  return localStorage.getItem(`${P}openrouter_key`) || null;
}

export function setOpenRouterKey(key) {
  if (key) localStorage.setItem(`${P}openrouter_key`, key);
  else localStorage.removeItem(`${P}openrouter_key`);
}

export function getOpenRouterModel() {
  return localStorage.getItem(`${P}openrouter_model`) || null;
}

export function setOpenRouterModel(model) {
  if (model) localStorage.setItem(`${P}openrouter_model`, model);
  else localStorage.removeItem(`${P}openrouter_model`);
}

const TASK_COL = {
  capture:   "model_capture",
  questions: "model_questions",
  vision:    "model_vision",
  refine:    "model_refine",
  chat:      "model_chat",
};

export function getModelForTask(task) {
  return localStorage.getItem(`${P}task_${task}`) || null;
}

export function setModelForTask(task, model) {
  const lsKey = `${P}task_${task}`;
  if (model) localStorage.setItem(lsKey, model);
  else localStorage.removeItem(lsKey);
  const col = TASK_COL[task];
  if (!col) return;
  const uid = getUserId();
  if (uid) {
    supabase.from("user_ai_settings").upsert(
      { user_id: uid, [col]: model || null, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  }
}

export function loadTaskModels(userId, settingsRow) {
  if (!settingsRow) return;
  for (const [task, col] of Object.entries(TASK_COL)) {
    const val = settingsRow[col];
    const lsKey = `${P}task_${task}`;
    if (val) localStorage.setItem(lsKey, val);
    else localStorage.removeItem(lsKey);
  }
}

/* ─── Embedding Provider Settings ─── */

export function getEmbedProvider() {
  return localStorage.getItem(`${P}embed_provider`) || "openai";
}

export function setEmbedProvider(p) {
  localStorage.setItem(`${P}embed_provider`, p || "openai");
}

export function getEmbedOpenAIKey() {
  return localStorage.getItem(`${P}embed_openai_key`) || null;
}

export function setEmbedOpenAIKey(key) {
  if (key) localStorage.setItem(`${P}embed_openai_key`, key);
  else localStorage.removeItem(`${P}embed_openai_key`);
}

export function getGeminiKey() {
  return localStorage.getItem(`${P}gemini_key`) || null;
}

export function setGeminiKey(key) {
  if (key) localStorage.setItem(`${P}gemini_key`, key);
  else localStorage.removeItem(`${P}gemini_key`);
}

/** Returns the active embedding key for the currently selected embed provider. */
export function getEmbedKey() {
  const provider = getEmbedProvider();
  return provider === "google" ? getGeminiKey() : getEmbedOpenAIKey();
}

/** Build the embed headers to attach to /api/embed, /api/search, /api/chat requests. */
export function getEmbedHeaders() {
  const provider = getEmbedProvider();
  const key = getEmbedKey();
  if (!key) return null;
  return { "X-Embed-Provider": provider, "X-Embed-Key": key };
}

/**
 * Drop-in replacement for authFetch that adds X-User-Api-Key header
 * when the user has configured a BYO key.
 */
export async function aiFetch(url, options = {}) {
  const userKey = getUserApiKey();
  if (!userKey) return authFetch(url, options);
  return authFetch(url, {
    ...options,
    headers: {
      ...options.headers,
      "X-User-Api-Key": userKey,
    },
  });
}
