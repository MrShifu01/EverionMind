const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdrs = (): Record<string, string> => ({ "apikey": SB_KEY!, "Authorization": `Bearer ${SB_KEY}` });

/**
 * Check if a user has access to a brain (as owner or member).
 * Returns { role: "owner"|"member"|"viewer" } or null if no access.
 */
export async function checkBrainAccess(userId: string, brainId: string): Promise<{ role: string } | null> {
  const [memberRes, ownerRes] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/brain_members?brain_id=eq.${encodeURIComponent(brainId)}&user_id=eq.${encodeURIComponent(userId)}&select=role`, { headers: hdrs() }),
    fetch(`${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brainId)}&owner_id=eq.${encodeURIComponent(userId)}&select=id`, { headers: hdrs() }),
  ]);
  const members: any[] = memberRes.ok ? await memberRes.json() : [];
  const owners: any[] = ownerRes.ok ? await ownerRes.json() : [];
  if (owners.length > 0) return { role: "owner" };
  if (members.length > 0) return members[0];
  return null;
}
