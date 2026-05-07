export const GEMINI_BULK_MODEL = (
  process.env.GEMINI_BULK_MODEL ||
  process.env.GEMINI_MODEL ||
  "gemini-2.5-flash-lite"
).trim();

export const GEMINI_CHAT_MODEL = (
  process.env.GEMINI_CHAT_MODEL ||
  process.env.GEMINI_PRO_CHAT_MODEL ||
  process.env.GEMINI_PRO_MODEL ||
  process.env.GEMINI_MODEL ||
  "gemini-2.5-flash"
).trim();

export const GEMINI_FALLBACK_MODEL = (
  process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash"
).trim();

export function geminiFallbackChain(primary: string): string[] {
  return Array.from(new Set([primary.trim(), GEMINI_FALLBACK_MODEL].filter(Boolean)));
}
