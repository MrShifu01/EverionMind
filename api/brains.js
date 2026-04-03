import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hdrs = (extra = {}) => ({
  "Content-Type": "application/json",
  "apikey": SB_KEY,
  "Authorization": `Bearer ${SB_KEY}`,
  ...extra,
});

export default async function handler(req, res) {
  if (!rateLimit(req, 60)) return res.status(429).json({ error: "Too many requests" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { method } = req;
  const action = req.query.action;

  // ── GET /api/brains — list all brains the user belongs to ──
  if (method === "GET" && !action) {
    // Brains user owns
    const owned = await fetch(
      `${SB_URL}/rest/v1/brains?owner_id=eq.${encodeURIComponent(user.id)}&order=created_at.asc`,
      { headers: hdrs() }
    );
    // Brains user is a member of (but doesn't own)
    const memberOf = await fetch(
      `${SB_URL}/rest/v1/brain_members?user_id=eq.${encodeURIComponent(user.id)}&select=brain_id,role`,
      { headers: hdrs() }
    );

    if (!owned.ok || !memberOf.ok) return res.status(502).json({ error: "Failed to fetch brains" });

    const ownedData = await owned.json();
    const memberData = await memberOf.json();

    // Fetch the actual brain records for memberships
    const memberBrainIds = memberData
      .map(m => m.brain_id)
      .filter(id => !ownedData.some(b => b.id === id));

    let memberBrains = [];
    if (memberBrainIds.length > 0) {
      const mbRes = await fetch(
        `${SB_URL}/rest/v1/brains?id=in.(${memberBrainIds.map(encodeURIComponent).join(",")})`,
        { headers: hdrs() }
      );
      if (mbRes.ok) memberBrains = await mbRes.json();
    }

    // Attach role to each brain
    const allBrains = [
      ...ownedData.map(b => ({ ...b, myRole: "owner" })),
      ...memberBrains.map(b => {
        const membership = memberData.find(m => m.brain_id === b.id);
        return { ...b, myRole: membership?.role || "member" };
      }),
    ];

    return res.status(200).json(allBrains);
  }

  // ── POST /api/brains — create a new shared brain ──
  if (method === "POST" && !action) {
    const { name } = req.body;
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "Brain name is required" });
    }

    const r = await fetch(`${SB_URL}/rest/v1/brains`, {
      method: "POST",
      headers: hdrs({ "Prefer": "return=representation" }),
      body: JSON.stringify({
        name: name.trim().slice(0, 100),
        owner_id: user.id,
        type: "shared",
      }),
    });

    if (!r.ok) return res.status(502).json({ error: "Failed to create brain" });
    const [brain] = await r.json();
    console.log(`[audit] CREATE brain id=${brain.id} owner=${user.id}`);
    return res.status(201).json({ ...brain, myRole: "owner" });
  }

  // ── POST /api/brains?action=invite — invite a user by email ──
  if (method === "POST" && action === "invite") {
    const { brain_id, email, role = "member" } = req.body;

    if (!brain_id || !email) return res.status(400).json({ error: "brain_id and email required" });
    if (!["member", "viewer"].includes(role)) return res.status(400).json({ error: "Invalid role" });

    // Verify the caller owns this brain
    const brainRes = await fetch(
      `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}`,
      { headers: hdrs() }
    );
    const brains = await brainRes.json();
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
      const err = await inviteRes.text();
      return res.status(502).json({ error: "Failed to create invite", detail: err });
    }

    const [invite] = await inviteRes.json();
    console.log(`[audit] INVITE brain=${brain_id} email=${email} by=${user.id}`);
    return res.status(200).json({ ok: true, invite });
  }

  // ── POST /api/brains?action=accept — accept an invite by token ──
  if (method === "POST" && action === "accept") {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "token required" });

    // Look up the invite
    const invRes = await fetch(
      `${SB_URL}/rest/v1/brain_invites?token=eq.${encodeURIComponent(token)}&accepted=eq.false`,
      { headers: hdrs() }
    );
    const invites = await invRes.json();
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

    // Verify caller is in this brain
    const accessRes = await fetch(
      `${SB_URL}/rest/v1/brain_members?brain_id=eq.${encodeURIComponent(brain_id)}&user_id=eq.${encodeURIComponent(user.id)}`,
      { headers: hdrs() }
    );
    const access = await accessRes.json();
    const isOwner = await fetch(
      `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}`,
      { headers: hdrs() }
    ).then(r => r.json()).then(d => d.length > 0);

    if (!access.length && !isOwner) return res.status(403).json({ error: "Not a brain member" });

    const membersRes = await fetch(
      `${SB_URL}/rest/v1/brain_members?brain_id=eq.${encodeURIComponent(brain_id)}&select=*`,
      { headers: hdrs() }
    );
    return res.status(membersRes.status).json(await membersRes.json());
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
    const ownerData = await ownerRes.json();
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
    const brainData = await brainRes.json();
    if (!brainData.length) return res.status(403).json({ error: "Not the brain owner" });
    if (brainData[0].type === "personal") return res.status(400).json({ error: "Cannot delete personal brain" });

    const r = await fetch(
      `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}`,
      { method: "DELETE", headers: hdrs() }
    );
    console.log(`[audit] DELETE brain id=${brain_id} owner=${user.id}`);
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
