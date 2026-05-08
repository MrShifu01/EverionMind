import { createHash } from "crypto";
import { createLogger } from "./logger.js";
import { sbHeaders } from "./sbHeaders.js";

const SB_URL = process.env.SUPABASE_URL!;
const log = createLogger("resolveApiKey", { module: "resolveApiKey" });

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

  const brainQuery = `/rest/v1/brains?owner_id=eq.${encodeURIComponent(userId)}&is_personal=eq.true&select=id&limit=1`;
  const [, brainRes] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/user_api_keys?id=eq.${encodeURIComponent(keyId)}`, {
      method: "PATCH",
      headers: { ...sbHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
    }).catch(() => {}),
    fetch(`${SB_URL}${brainQuery}`, { headers: sbHeaders() }),
  ]);

  if (!brainRes.ok) {
    const body = await brainRes.text().catch(() => "<unreadable body>");
    log.error("Personal brain fetch failed", {
      userId,
      query: brainQuery,
      status: brainRes.status,
      statusText: brainRes.statusText,
      body,
      headers: {
        "Content-Type": "application/json",
        apikey: "[redacted]",
        Authorization: "[redacted]",
      },
    });
    return null;
  }
  const brainRows: any[] = await brainRes.json();
  if (!brainRows.length) {
    log.warn("Personal brain fetch returned no rows", {
      userId,
      query: brainQuery,
      brainRows,
      headers: {
        "Content-Type": "application/json",
        apikey: "[redacted]",
        Authorization: "[redacted]",
      },
    });
    return null;
  }

  return { userId, keyId, brainId: brainRows[0].id };
}
