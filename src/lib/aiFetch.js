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

export function getUserId() {
  try {
    const key = Object.keys(localStorage).find(k => k.includes("supabase") && k.includes("auth-token"));
    if (key) {
      const data = JSON.parse(localStorage.getItem(key));
      return data?.user?.id || null;
    }
  } catch {}
  return null;
}

export function getUserApiKey() {
  const uid = getUserId();
  if (!uid) return null;
  return localStorage.getItem(`openbrain_${uid}_api_key`) || null;
}

export function setUserApiKey(key) {
  const uid = getUserId();
  if (!uid) return;
  if (key) localStorage.setItem(`openbrain_${uid}_api_key`, key);
  else localStorage.removeItem(`openbrain_${uid}_api_key`);
}

export function getUserModel() {
  const uid = getUserId();
  if (!uid) return DEFAULT_MODEL;
  return localStorage.getItem(`openbrain_${uid}_model`) || DEFAULT_MODEL;
}

export function setUserModel(model) {
  const uid = getUserId();
  if (!uid) return;
  if (model) localStorage.setItem(`openbrain_${uid}_model`, model);
  else localStorage.removeItem(`openbrain_${uid}_model`);
}

export function getUserProvider() {
  const uid = getUserId();
  if (!uid) return "anthropic";
  return localStorage.getItem(`openbrain_${uid}_provider`) || "anthropic";
}

export function setUserProvider(provider) {
  const uid = getUserId();
  if (!uid) return;
  localStorage.setItem(`openbrain_${uid}_provider`, provider || "anthropic");
}

export function getOpenRouterKey() {
  const uid = getUserId();
  if (!uid) return null;
  return localStorage.getItem(`openbrain_${uid}_openrouter_key`) || null;
}

export function setOpenRouterKey(key) {
  const uid = getUserId();
  if (!uid) return;
  if (key) localStorage.setItem(`openbrain_${uid}_openrouter_key`, key);
  else localStorage.removeItem(`openbrain_${uid}_openrouter_key`);
}

export function getOpenRouterModel() {
  const uid = getUserId();
  if (!uid) return null;
  return localStorage.getItem(`openbrain_${uid}_openrouter_model`) || null;
}

export function setOpenRouterModel(model) {
  const uid = getUserId();
  if (!uid) return;
  if (model) localStorage.setItem(`openbrain_${uid}_openrouter_model`, model);
  else localStorage.removeItem(`openbrain_${uid}_openrouter_model`);
}

const TASK_COL = {
  capture:   "model_capture",
  questions: "model_questions",
  vision:    "model_vision",
  refine:    "model_refine",
  chat:      "model_chat",
};

export function getModelForTask(task) {
  const uid = getUserId();
  if (!uid) return null;
  return localStorage.getItem(`openbrain_${uid}_task_${task}`) || null;
}

export function setModelForTask(task, model) {
  const uid = getUserId();
  if (!uid) return;
  const lsKey = `openbrain_${uid}_task_${task}`;
  if (model) localStorage.setItem(lsKey, model);
  else localStorage.removeItem(lsKey);
  const col = TASK_COL[task];
  if (!col) return;
  supabase.from("user_ai_settings").upsert(
    { user_id: uid, [col]: model || null, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
}

export function loadTaskModels(userId, settingsRow) {
  if (!userId || !settingsRow) return;
  for (const [task, col] of Object.entries(TASK_COL)) {
    const val = settingsRow[col];
    const lsKey = `openbrain_${userId}_task_${task}`;
    if (val) localStorage.setItem(lsKey, val);
    else localStorage.removeItem(lsKey);
  }
}

/* ─── Embedding Provider Settings ─── */

export function getEmbedProvider() {
  const uid = getUserId();
  if (!uid) return "openai";
  return localStorage.getItem(`openbrain_${uid}_embed_provider`) || "openai";
}

export function setEmbedProvider(p) {
  const uid = getUserId();
  if (!uid) return;
  localStorage.setItem(`openbrain_${uid}_embed_provider`, p || "openai");
}

export function getEmbedOpenAIKey() {
  const uid = getUserId();
  if (!uid) return null;
  return localStorage.getItem(`openbrain_${uid}_embed_openai_key`) || null;
}

export function setEmbedOpenAIKey(key) {
  const uid = getUserId();
  if (!uid) return;
  if (key) localStorage.setItem(`openbrain_${uid}_embed_openai_key`, key);
  else localStorage.removeItem(`openbrain_${uid}_embed_openai_key`);
}

export function getGeminiKey() {
  const uid = getUserId();
  if (!uid) return null;
  return localStorage.getItem(`openbrain_${uid}_gemini_key`) || null;
}

export function setGeminiKey(key) {
  const uid = getUserId();
  if (!uid) return;
  if (key) localStorage.setItem(`openbrain_${uid}_gemini_key`, key);
  else localStorage.removeItem(`openbrain_${uid}_gemini_key`);
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
