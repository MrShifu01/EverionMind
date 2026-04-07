import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { checkBrainAccess } from "./_lib/checkBrainAccess.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hdrs = (extra: Record<string, string> = {}): Record<string, string> => ({
  "Content-Type": "application/json",
  "apikey": SB_KEY!,
  "Authorization": `Bearer ${SB_KEY}`,
  ...extra,
});

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!(await rateLimit(req, 60))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { method } = req;
  const action = req.query.action as string | undefined;

  // ── GET /api/brains — list all brains the user belongs to ──
  if (method === "GET" && !action) {
    // Brains user owns
    const owned = await fetch(
      `${SB_URL}/rest/v1/brains?owner_id=eq.${encodeURIComponent(user.id)}&order=created_at.asc`,
      { headers: hdrs() }
    );
    if (!owned.ok) return res.status(502).json({ error: "Failed to fetch brains" });

    let ownedData: any[] = await owned.json();

    // Auto-create personal brain for existing users who predate the brain system
    if (!ownedData.some((b: any) => b.type === "personal")) {
      const createRes = await fetch(`${SB_URL}/rest/v1/brains`, {
        method: "POST",
        headers: hdrs({ "Prefer": "return=representation" }),
        body: JSON.stringify({ name: "My Brain", owner_id: user.id, type: "personal" }),
      });
      if (createRes.ok) {
        const [newBrain]: any[] = await createRes.json();
        // Also create brain_members row for the owner
        await fetch(`${SB_URL}/rest/v1/brain_members`, {
          method: "POST",
          headers: hdrs({ "Prefer": "return=minimal" }),
          body: JSON.stringify({ brain_id: newBrain.id, user_id: user.id, role: "owner" }),
        }).catch((err) => console.error("[brains:auto-create] Failed to create owner membership:", err.message));
        // Assign any orphan entries (brain_id IS NULL) to this brain
        await fetch(`${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(user.id)}&brain_id=is.null`, {
          method: "PATCH",
          headers: hdrs({ "Prefer": "return=minimal" }),
          body: JSON.stringify({ brain_id: newBrain.id }),
        }).catch((err) => console.error("[brains:auto-create] Failed to assign orphan entries:", err.message));
        ownedData = [...ownedData, newBrain];
        console.log(`[audit] AUTO-CREATE personal brain id=${newBrain.id} user=${user.id}`);
      }
    }

    // Brains user is a member of (but doesn't own)
    const memberOf = await fetch(
      `${SB_URL}/rest/v1/brain_members?user_id=eq.${encodeURIComponent(user.id)}&select=brain_id,role`,
      { headers: hdrs() }
    );
    const memberData: any[] = memberOf.ok ? await memberOf.json() : [];

    // Fetch the actual brain records for memberships
    const memberBrainIds = memberData
      .map((m: any) => m.brain_id)
      .filter((id: string) => !ownedData.some((b: any) => b.id === id));

    let memberBrains: any[] = [];
    if (memberBrainIds.length > 0) {
      const mbRes = await fetch(
        `${SB_URL}/rest/v1/brains?id=in.(${memberBrainIds.map(encodeURIComponent).join(",")})`,
        { headers: hdrs() }
      );
      if (mbRes.ok) memberBrains = await mbRes.json();
    }

    // Attach role to each brain
    const allBrains = [
      ...ownedData.map((b: any) => ({ ...b, myRole: "owner" })),
      ...memberBrains.map((b: any) => {
        const membership = memberData.find((m: any) => m.brain_id === b.id);
        return { ...b, myRole: membership?.role || "member" };
      }),
    ];

    return res.status(200).json(allBrains);
  }

  // ── POST /api/brains — create a new shared brain ──
  if (method === "POST" && !action) {
    const { name, type } = req.body;
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "Brain name is required" });
    }
    const validTypes = ["personal", "family", "business"];
    const brainType = validTypes.includes(type) ? type : "family";

    const r = await fetch(`${SB_URL}/rest/v1/brains`, {
      method: "POST",
      headers: hdrs({ "Prefer": "return=representation" }),
      body: JSON.stringify({
        name: name.trim().slice(0, 100),
        owner_id: user.id,
        type: brainType,
      }),
    });

    if (!r.ok) return res.status(502).json({ error: "Failed to create brain" });
    const [brain]: any[] = await r.json();
    console.log(`[audit] CREATE brain id=${brain.id} owner=${user.id}`);
    return res.status(201).json({ ...brain, myRole: "owner" });
  }

  // ── POST /api/brains?action=invite — invite a user by email ──
  if (method === "POST" && action === "invite") {
    const { brain_id, email, role = "member" } = req.body;

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!brain_id || typeof brain_id !== "string" || !uuidRe.test(brain_id)) {
      return res.status(400).json({ error: "Invalid brain_id" });
    }
    if (!email) return res.status(400).json({ error: "brain_id and email required" });
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: "Invalid email format" });
    }
    if (!["member", "viewer"].includes(role)) return res.status(400).json({ error: "Invalid role" });

    // Verify the caller owns this brain
    const brainRes = await fetch(
      `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}`,
      { headers: hdrs() }
    );
    const brains: any[] = await brainRes.json();
    if (!brains.length) return res.status(403).json({ error: "Not the brain owner" });

    // Upsert invite record
    const inviteRes = await fetch(`${SB_URL}/rest/v1/brain_invites`, {
      method: "POST",
      headers: hdrs({ "Prefer": "return=representation,resolution=merge-duplicates" }),
      body: JSON.stringify({
        brain_id,
        email: email.trim().toLowerCase(),
        role,
        invited_by: user.id,
      }),
    });

    if (!inviteRes.ok) {
      const detail = await inviteRes.text().catch(() => "");
      console.error("[brains:invite] Failed:", detail);
      return res.status(502).json({ error: "Failed to create invite" });
    }

    const [invite]: any[] = await inviteRes.json();
    console.log(`[audit] INVITE brain=${brain_id} email=${email} by=${user.id}`);
    return res.status(200).json({ ok: true, invite });
  }

  // ── POST /api/brains?action=invite-platform — invite someone to sign up for OpenBrain ──
  if (method === "POST" && action === "invite-platform") {
    const { email } = req.body;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email required" });
    }
    const invRes = await fetch(`${SB_URL}/auth/v1/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SB_KEY!,
        "Authorization": `Bearer ${SB_KEY}`,
      },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    if (!invRes.ok) {
      const detail = await invRes.text().catch(() => "");
      console.error("[brains:invite-platform] Failed:", detail);
      return res.status(502).json({ error: "Failed to send platform invite" });
    }
    console.log(`[audit] INVITE_PLATFORM email=${email} by=${user.id}`);
    return res.status(200).json({ ok: true });
  }

  // ── POST /api/brains?action=accept — accept an invite by token ──
  if (method === "POST" && action === "accept") {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "token required" });

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(token)) {
      return res.status(400).json({ error: "Invalid invite token" });
    }

    // Look up the invite
    const invRes = await fetch(
      `${SB_URL}/rest/v1/brain_invites?token=eq.${encodeURIComponent(token)}&accepted=eq.false`,
      { headers: hdrs() }
    );
    const invites: any[] = await invRes.json();
    if (!invites.length) return res.status(404).json({ error: "Invite not found or already accepted" });

    const invite = invites[0];

    // Add as brain member
    const memRes = await fetch(`${SB_URL}/rest/v1/brain_members`, {
      method: "POST",
      headers: hdrs({ "Prefer": "resolution=ignore-duplicates" }),
      body: JSON.stringify({ brain_id: invite.brain_id, user_id: user.id, role: invite.role }),
    });
    if (!memRes.ok) return res.status(502).json({ error: "Failed to add member" });

    // Mark invite accepted
    await fetch(
      `${SB_URL}/rest/v1/brain_invites?id=eq.${encodeURIComponent(invite.id)}`,
      { method: "PATCH", headers: hdrs(), body: JSON.stringify({ accepted: true }) }
    );

    console.log(`[audit] ACCEPT invite brain=${invite.brain_id} user=${user.id}`);
    return res.status(200).json({ ok: true, brain_id: invite.brain_id, role: invite.role });
  }

  // ── GET /api/brains?action=members&brain_id=… — list members ──
  if (method === "GET" && action === "members") {
    const { brain_id } = req.query;
    if (!brain_id) return res.status(400).json({ error: "brain_id required" });

    // Verify caller is in this brain (member or owner)
    const brainAccess = await checkBrainAccess(user.id, brain_id as string);
    if (!brainAccess) return res.status(403).json({ error: "Not a brain member" });

    const membersRes = await fetch(
      `${SB_URL}/rest/v1/brain_members?brain_id=eq.${encodeURIComponent(brain_id as string)}&select=*`,
      { headers: hdrs() }
    );
    return res.status(membersRes.status).json(await membersRes.json());
  }

  // ── PATCH /api/brains?action=member-role — change a member's role ──
  if (method === "PATCH" && action === "member-role") {
    const { brain_id, user_id: targetUserId, role } = req.body;
    if (!brain_id || !targetUserId || !role) return res.status(400).json({ error: "brain_id, user_id, and role required" });
    if (!["member", "viewer"].includes(role)) return res.status(400).json({ error: "Invalid role — must be member or viewer" });

    // Only owner can change roles
    const ownerRes = await fetch(
      `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}`,
      { headers: hdrs() }
    );
    const ownerData: any[] = await ownerRes.json();
    if (!ownerData.length) return res.status(403).json({ error: "Not the brain owner" });

    const r = await fetch(
      `${SB_URL}/rest/v1/brain_members?brain_id=eq.${encodeURIComponent(brain_id)}&user_id=eq.${encodeURIComponent(targetUserId)}`,
      { method: "PATCH", headers: hdrs(), body: JSON.stringify({ role }) }
    );
    console.log(`[audit] ROLE_CHANGE brain=${brain_id} user=${targetUserId} role=${role} by=${user.id}`);
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok });
  }

  // ── DELETE /api/brains?action=member — remove a member ──
  if (method === "DELETE" && action === "member") {
    const { brain_id, user_id: targetUserId } = req.body;
    if (!brain_id || !targetUserId) return res.status(400).json({ error: "brain_id and user_id required" });

    // Only owner can remove members
    const ownerRes = await fetch(
      `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}`,
      { headers: hdrs() }
    );
    const ownerData: any[] = await ownerRes.json();
    if (!ownerData.length) return res.status(403).json({ error: "Not the brain owner" });

    const r = await fetch(
      `${SB_URL}/rest/v1/brain_members?brain_id=eq.${encodeURIComponent(brain_id)}&user_id=eq.${encodeURIComponent(targetUserId)}`,
      { method: "DELETE", headers: hdrs() }
    );
    console.log(`[audit] REMOVE member brain=${brain_id} user=${targetUserId} by=${user.id}`);
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok });
  }

  // ── DELETE /api/brains — delete a brain ──
  if (method === "DELETE" && !action) {
    const { brain_id } = req.body;
    if (!brain_id) return res.status(400).json({ error: "brain_id required" });

    // Can't delete a personal brain
    const brainRes = await fetch(
      `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}`,
      { headers: hdrs() }
    );
    const brainData: any[] = await brainRes.json();
    if (!brainData.length) return res.status(403).json({ error: "Not the brain owner" });
    if (brainData[0].type === "personal") return res.status(400).json({ error: "Cannot delete personal brain" });

    const r = await fetch(
      `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}`,
      { method: "DELETE", headers: hdrs() }
    );
    console.log(`[audit] DELETE brain id=${brain_id} owner=${user.id}`);
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok });
  }

  // ── POST /api/brains?action=telegram-code — generate one-time link code ──
  if (method === "POST" && action === "telegram-code") {
    const { brain_id } = req.body;
    if (!brain_id) return res.status(400).json({ error: "brain_id required" });
    const ownerRes = await fetch(`${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { headers: hdrs() });
    if (!(await ownerRes.json()).length) return res.status(403).json({ error: "Not the brain owner" });
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const r = await fetch(`${SB_URL}/rest/v1/messaging_pending_links`, { method: "POST", headers: hdrs({ "Prefer": "return=minimal" }), body: JSON.stringify({ user_id: user.id, brain_id, platform: "telegram", code, expires_at: expiresAt }) });
    if (!r.ok) return res.status(502).json({ error: "Failed to create link code" });
    return res.status(200).json({ code });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
