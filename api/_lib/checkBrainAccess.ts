const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdrs = (): Record<string, string> => ({ "apikey": SB_KEY!, "Authorization": `Bearer ${SB_KEY}` });

/**
 * Check if a user owns a brain. Returns { role: "owner" } or null.
 */
export async function checkBrainAccess(userId: string, brainId: string): Promise<{ role: string } | null> {
  const r = await fetch(
    `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brainId)}&owner_id=eq.${encodeURIComponent(userId)}&select=id`,
    { headers: hdrs() },
  );
  const rows: any[] = r.ok ? await r.json() : [];
  return rows.length > 0 ? { role: "owner" } : null;
}
