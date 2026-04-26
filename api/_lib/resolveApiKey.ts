import { createHash } from "crypto";
import { sbHeaders } from "./sbHeaders.js";

const SB_URL = process.env.SUPABASE_URL!;

export async function resolveApiKey(
  rawKey: string,
): Promise<{ userId: string; keyId: string; brainId: string } | null> {
  if (!rawKey.startsWith("em_")) return null;
  const hash = createHash("sha256").update(rawKey).digest("hex");

  const keyRes = await fetch(
    `${SB_URL}/rest/v1/user_api_keys?key_hash=eq.${encodeURIComponent(hash)}&revoked_at=is.null&select=id,user_id&limit=1`,
    { headers: sbHeaders() },
  );
  if (!keyRes.ok) return null;
  const keyRows: any[] = await keyRes.json();
  if (!keyRows.length) return null;

  const { id: keyId, user_id: userId } = keyRows[0];

  const [, brainRes] = await Promise.all([
    fetch(
      `${SB_URL}/rest/v1/user_api_keys?id=eq.${encodeURIComponent(keyId)}`,
      {
        method: "PATCH",
        headers: { ...sbHeaders(), Prefer: "return=minimal" },
        body: JSON.stringify({ last_used_at: new Date().toISOString() }),
      },
    ).catch(() => {}),
    fetch(
      `${SB_URL}/rest/v1/brains?owner_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
      { headers: sbHeaders() },
    ),
  ]);

  if (!brainRes.ok) return null;
  const brainRows: any[] = await brainRes.json();
  if (!brainRows.length) return null;

  return { userId, keyId, brainId: brainRows[0].id };
}
