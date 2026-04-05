import { authFetch } from "./authFetch";
import { supabase } from "./supabase";
import { MODEL as DEFAULT_MODEL } from "../data/constants";

const P = "openbrain_";

export function getUserId(): string | null {
  try {
    const key = Object.keys(localStorage).find(k => k.endsWith("-auth-token"));
    if (key) {
      const data = JSON.parse(localStorage.getItem(key)!);
      return data?.user?.id || null;
    }
  } catch { /* ignore */ }
  return null;
}

// Migrate old user-scoped keys to new unscoped format
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
        localStorage.setItem(newKey, localStorage.getItem(oldKey)!);
      }
    }
  }
} catch { /* ignore */ }

export function getUserApiKey(): string | null {
  return localStorage.getItem(`${P}api_key`) || null;
}

export function setUserApiKey(key: string | null): void {
  if (key) localStorage.setItem(`${P}api_key`, key);
  else localStorage.removeItem(`${P}api_key`);
}

export function getUserModel(): string {
  return localStorage.getItem(`${P}model`) || DEFAULT_MODEL;
}

export function setUserModel(model: string | null): void {
  if (model) localStorage.setItem(`${P}model`, model);
  else localStorage.removeItem(`${P}model`);
}

export function getUserProvider(): string {
  return localStorage.getItem(`${P}provider`) || "anthropic";
}

export function setUserProvider(provider: string | null): void {
  localStorage.setItem(`${P}provider`, provider || "anthropic");
}

export function getOpenRouterKey(): string | null {
  return localStorage.getItem(`${P}openrouter_key`) || null;
}

export function setOpenRouterKey(key: string | null): void {
  if (key) localStorage.setItem(`${P}openrouter_key`, key);
  else localStorage.removeItem(`${P}openrouter_key`);
}

export function getOpenRouterModel(): string | null {
  return localStorage.getItem(`${P}openrouter_model`) || null;
}

export function setOpenRouterModel(model: string | null): void {
  if (model) localStorage.setItem(`${P}openrouter_model`, model);
  else localStorage.removeItem(`${P}openrouter_model`);
}

export function getGroqKey(): string | null {
  return localStorage.getItem(`${P}groq_key`) || null;
}

export function setGroqKey(key: string | null): void {
  if (key) localStorage.setItem(`${P}groq_key`, key);
  else localStorage.removeItem(`${P}groq_key`);
}

const TASK_COL: Record<string, string> = {
  capture:   "model_capture",
  questions: "model_questions",
  vision:    "model_vision",
  refine:    "model_refine",
  chat:      "model_chat",
};

export function getModelForTask(task: string): string | null {
  return localStorage.getItem(`${P}task_${task}`) || null;
}

export function setModelForTask(task: string, model: string | null): void {
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

export function loadTaskModels(_userId: string, settingsRow: Record<string, string | null> | null): void {
  if (!settingsRow) return;
  for (const [task, col] of Object.entries(TASK_COL)) {
    const val = settingsRow[col];
    const lsKey = `${P}task_${task}`;
    if (val) localStorage.setItem(lsKey, val);
    else localStorage.removeItem(lsKey);
  }
}

/* ─── Embedding Provider Settings ─── */

export function getEmbedProvider(): string {
  return localStorage.getItem(`${P}embed_provider`) || "openai";
}

export function setEmbedProvider(p: string | null): void {
  localStorage.setItem(`${P}embed_provider`, p || "openai");
}

export function getEmbedOpenAIKey(): string | null {
  return localStorage.getItem(`${P}embed_openai_key`) || null;
}

export function setEmbedOpenAIKey(key: string | null): void {
  if (key) localStorage.setItem(`${P}embed_openai_key`, key);
  else localStorage.removeItem(`${P}embed_openai_key`);
}

export function getGeminiKey(): string | null {
  return localStorage.getItem(`${P}gemini_key`) || null;
}

export function setGeminiKey(key: string | null): void {
  if (key) localStorage.setItem(`${P}gemini_key`, key);
  else localStorage.removeItem(`${P}gemini_key`);
}

export function getEmbedKey(): string | null {
  const provider = getEmbedProvider();
  return provider === "google" ? getGeminiKey() : getEmbedOpenAIKey();
}

export function getEmbedHeaders(): { "X-Embed-Provider": string; "X-Embed-Key": string } | null {
  const provider = getEmbedProvider();
  const key = getEmbedKey();
  if (!key) return null;
  return { "X-Embed-Provider": provider, "X-Embed-Key": key };
}

export async function aiFetch(url: string, options: RequestInit = {}): Promise<Response> {
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
