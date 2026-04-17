import { createHash } from "crypto";

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const hdrs = () => ({
  "Content-Type": "application/json",
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
});

export async function resolveApiKey(rawKey: string): Promise<{ userId: string; keyId: string } | null> {
  if (!rawKey.startsWith("em_")) return null;
  const hash = createHash("sha256").update(rawKey).digest("hex");

  const r = await fetch(
    `${SB_URL}/rest/v1/user_api_keys?key_hash=eq.${encodeURIComponent(hash)}&revoked_at=is.null&select=id,user_id&limit=1`,
    { headers: hdrs() },
  );
  if (!r.ok) return null;
  const rows: any[] = await r.json();
  if (!rows.length) return null;

  fetch(
    `${SB_URL}/rest/v1/user_api_keys?id=eq.${encodeURIComponent(rows[0].id)}`,
    {
      method: "PATCH",
      headers: { ...hdrs(), Prefer: "return=minimal" },
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
    },
  ).catch(() => {});

  return { userId: rows[0].user_id, keyId: rows[0].id };
}

export async function getUserBrainId(userId: string): Promise<string> {
  const r = await fetch(
    `${SB_URL}/rest/v1/brains?owner_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
    { headers: hdrs() },
  );
  if (!r.ok) throw new Error("Failed to fetch brain");
  const rows: any[] = await r.json();
  if (!rows.length) throw new Error("No brain found for user");
  return rows[0].id;
}
