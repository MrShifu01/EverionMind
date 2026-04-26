import { sbHeaders } from "./sbHeaders.js";

const SB_URL = process.env.SUPABASE_URL!;
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_KEY_LEN = 200;

// Probability of running the lazy cleanup pass on any given write. Keeps the
// table bounded without burning a DELETE on every successful insert.
const CLEANUP_PROBABILITY = 0.01;

export class IdempotencyError extends Error {
  constructor(public status: number, public publicMessage: string) {
    super(publicMessage);
    this.name = "IdempotencyError";
  }
}

/**
 * Validate the client-supplied Idempotency-Key header. Returns the trimmed key
 * if valid, throws IdempotencyError otherwise. Caller should fall through to
 * normal flow when this returns null (no header present).
 */
export function normalizeIdempotencyKey(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw new IdempotencyError(400, "Idempotency-Key must be a string");
  const key = raw.trim();
  if (!key) return null;
  if (key.length > MAX_KEY_LEN) throw new IdempotencyError(400, `Idempotency-Key max ${MAX_KEY_LEN} chars`);
  // ASCII printable + a few separators (RFC 7230 token + ":")
  if (!/^[\x20-\x7e]+$/.test(key)) throw new IdempotencyError(400, "Idempotency-Key contains invalid characters");
  return key;
}

export type ReserveResult =
  | { kind: "reserved" }                       // we won the slot — caller proceeds with insert
  | { kind: "replay"; entryId: string }        // duplicate — caller returns this entry
  | { kind: "in_flight" };                     // peer reserved the slot but hasn't finalised yet

/**
 * Atomically reserve an idempotency slot. Replaces the older
 * SELECT-then-INSERT flow which raced under concurrent retries.
 *
 *   reserved   → caller inserts the entry, then calls finalizeIdempotency
 *   replay     → caller returns { id: entryId, idempotent_replay: true }
 *   in_flight  → caller returns 409 (peer is still working)
 */
export async function reserveIdempotency(userId: string, key: string): Promise<ReserveResult> {
  const cutoff = new Date(Date.now() - TTL_MS).toISOString();

  // Try to claim the slot. Prefer ignore-duplicates so a conflict yields an
  // empty array instead of a 409 — we then read the existing row.
  const insertRes = await fetch(`${SB_URL}/rest/v1/idempotency_keys`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "resolution=ignore-duplicates,return=representation" }),
    body: JSON.stringify({ user_id: userId, idempotency_key: key, entry_id: null }),
  });
  if (insertRes.ok) {
    const inserted: any[] = await insertRes.json().catch(() => []);
    if (inserted.length > 0) return { kind: "reserved" };
  }

  // Conflict — fetch the existing row.
  const existingRes = await fetch(
    `${SB_URL}/rest/v1/idempotency_keys?user_id=eq.${encodeURIComponent(userId)}&idempotency_key=eq.${encodeURIComponent(key)}&created_at=gte.${encodeURIComponent(cutoff)}&select=entry_id&limit=1`,
    { headers: sbHeaders() },
  );
  if (!existingRes.ok) {
    // Conservative: treat as in_flight so the caller fails closed rather than
    // silently double-inserting.
    return { kind: "in_flight" };
  }
  const [row]: any[] = await existingRes.json();
  if (row && row.entry_id) return { kind: "replay", entryId: row.entry_id };
  return { kind: "in_flight" };
}

/**
 * Attach the freshly-inserted entry id to a previously-reserved key. Only
 * patches rows whose entry_id is still null — so a winning patch cannot
 * overwrite another caller's id.
 */
export async function finalizeIdempotency(userId: string, key: string, entryId: string): Promise<void> {
  await fetch(
    `${SB_URL}/rest/v1/idempotency_keys?user_id=eq.${encodeURIComponent(userId)}&idempotency_key=eq.${encodeURIComponent(key)}&entry_id=is.null`,
    {
      method: "PATCH",
      headers: sbHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({ entry_id: entryId }),
    },
  ).catch(() => {});

  if (Math.random() < CLEANUP_PROBABILITY) {
    const cutoff = new Date(Date.now() - TTL_MS).toISOString();
    fetch(
      `${SB_URL}/rest/v1/idempotency_keys?user_id=eq.${encodeURIComponent(userId)}&created_at=lt.${encodeURIComponent(cutoff)}`,
      { method: "DELETE", headers: sbHeaders() },
    ).catch(() => {});
  }
}

/**
 * Release a reservation when the caller bails out before inserting. Without
 * this, a failed handler would leave a permanent in_flight slot that returns
 * 409 to all retries until TTL expiry.
 */
export async function releaseIdempotency(userId: string, key: string): Promise<void> {
  await fetch(
    `${SB_URL}/rest/v1/idempotency_keys?user_id=eq.${encodeURIComponent(userId)}&idempotency_key=eq.${encodeURIComponent(key)}&entry_id=is.null`,
    { method: "DELETE", headers: sbHeaders() },
  ).catch(() => {});
}
