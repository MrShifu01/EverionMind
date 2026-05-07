/**
 * Resolve the user's personal brain ID.
 *
 * Persona facts and the user's identity context (family, habits, About-Me)
 * MUST always live in the user's personal brain, never in shared brains.
 * Without this guarantee:
 *   - Persona extraction in a shared brain inserts persona rows with
 *     brain_id=<shared>, fragmenting the user's identity across brains.
 *   - Persona retrieval scoped to the active brain returns nothing in
 *     shared brains, leaving the assistant flying blind on who the
 *     user is.
 *
 * Mirrors the helper in gmailScan.ts (getUserBrainId) but lives in its
 * own module so persona-extraction callers don't inherit the gmail
 * import surface (circular-import risk).
 */

import { sbHeaders } from "./sbHeaders.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_HDR = sbHeaders();

let _cache: Map<string, { id: string; expires: number }> = new Map();
const CACHE_TTL_MS = 60_000;

export async function getPersonalBrainId(userId: string): Promise<string | null> {
  const cached = _cache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.id;
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/brains?owner_id=eq.${encodeURIComponent(userId)}&is_personal=eq.true&select=id&limit=1`,
      { headers: SB_HDR },
    );
    if (!r.ok) return null;
    const rows: Array<{ id: string }> = await r.json().catch(() => []);
    const id = rows[0]?.id ?? null;
    if (id) _cache.set(userId, { id, expires: Date.now() + CACHE_TTL_MS });
    return id;
  } catch {
    return null;
  }
}
