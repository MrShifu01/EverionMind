import { sbHeadersNoContent } from "./sbHeaders.js";

const SB_URL = process.env.SUPABASE_URL;

export type BrainRole = "owner" | "member" | "viewer";

/**
 * Resolve a user's role on a brain. Returns:
 *   • { role: "owner" }   if the user is the brain's owner
 *   • { role: "member" }  if user is in brain_members with role='member'
 *   • { role: "viewer" }  if user is in brain_members with role='viewer'
 *   • null                if the user has no access
 *
 * Owner is checked first because brain_members never holds an owner row —
 * owner is derived from brains.owner_id (see migration 068).
 */
export async function checkBrainAccess(
  userId: string,
  brainId: string,
): Promise<{ role: BrainRole } | null> {
  const ownerR = await fetch(
    `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brainId)}&owner_id=eq.${encodeURIComponent(userId)}&select=id`,
    { headers: sbHeadersNoContent() },
  );
  const ownerRows: any[] = ownerR.ok ? await ownerR.json() : [];
  if (ownerRows.length > 0) return { role: "owner" };

  const memberR = await fetch(
    `${SB_URL}/rest/v1/brain_members?brain_id=eq.${encodeURIComponent(brainId)}&user_id=eq.${encodeURIComponent(userId)}&select=role&limit=1`,
    { headers: sbHeadersNoContent() },
  );
  const memberRows: any[] = memberR.ok ? await memberR.json() : [];
  if (memberRows.length > 0) {
    const role = memberRows[0].role as string;
    if (role === "member" || role === "viewer") return { role };
  }
  return null;
}
