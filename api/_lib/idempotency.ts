import { sbHeaders } from "./sbHeaders.js";

const SB_URL = process.env.SUPABASE_URL!;
const TTL_MS = 24 * 60 * 60 * 1000;

export async function checkIdempotency(userId: string, key: string): Promise<string | null> {
  const cutoff = new Date(Date.now() - TTL_MS).toISOString();
  const r = await fetch(
    `${SB_URL}/rest/v1/idempotency_keys?user_id=eq.${encodeURIComponent(userId)}&idempotency_key=eq.${encodeURIComponent(key)}&created_at=gte.${encodeURIComponent(cutoff)}&select=entry_id&limit=1`,
    { headers: sbHeaders() },
  );
  if (!r.ok) return null;
  const [row] = await r.json();
  return row?.entry_id ?? null;
}

export async function recordIdempotency(userId: string, key: string, entryId: string): Promise<void> {
  // Lazy cleanup: delete expired keys for this user on every write (keeps table bounded).
  const cutoff = new Date(Date.now() - TTL_MS).toISOString();
  fetch(
    `${SB_URL}/rest/v1/idempotency_keys?user_id=eq.${encodeURIComponent(userId)}&created_at=lt.${encodeURIComponent(cutoff)}`,
    { method: "DELETE", headers: sbHeaders() },
  ).catch(() => {});

  await fetch(`${SB_URL}/rest/v1/idempotency_keys`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "resolution=ignore-duplicates,return=minimal" }),
    body: JSON.stringify({ user_id: userId, idempotency_key: key, entry_id: entryId }),
  });
}
