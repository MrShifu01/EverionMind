import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { checkBrainAccess } from "./_lib/checkBrainAccess.js";
import { randomBytes } from "crypto";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hdrs = (extra: Record<string, string> = {}): Record<string, string> => ({
  "Content-Type": "application/json",
  "apikey": SB_KEY!,
  "Authorization": `Bearer ${SB_KEY}`,
  ...extra,
});

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
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

    // Generate token server-side — avoids relying on pgcrypto DB extension
    const token = randomBytes(32).toString("hex");
    const brainName = brains[0]?.name || "a brain";

    // Upsert invite record (merge on brain_id+email so re-inviting refreshes the token)
    const inviteRes = await fetch(
      `${SB_URL}/rest/v1/brain_invites?on_conflict=brain_id,email`,
      {
        method: "POST",
        headers: hdrs({ "Prefer": "return=representation,resolution=merge-duplicates" }),
        body: JSON.stringify({
          brain_id,
          email: email.trim().toLowerCase(),
          role,
          invited_by: user.id,
          token,
          accepted: false,
        }),
      }
    );

    if (!inviteRes.ok) {
      const detail = await inviteRes.text().catch(() => "");
      console.error("[brains:invite] Failed:", inviteRes.status, detail);
      return res.status(502).json({ error: "Failed to create invite", detail });
    }

    const inviteData = await inviteRes.json().catch(() => []);
    const invite = Array.isArray(inviteData) ? inviteData[0] : inviteData;

    // Send email notification via Resend (fire-and-forget; non-fatal if unconfigured)
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const appUrl = process.env.APP_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://open-brain-ib4e.vercel.app");
      const canonicalToken = invite?.token || token;
      const acceptUrl = `${appUrl}/?invite=${canonicalToken}`;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: "OpenBrain <noreply@openbrain.app>",
          to: [email.trim().toLowerCase()],
          subject: `You've been invited to join "${brainName}" on OpenBrain`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#111;color:#eee;border-radius:12px">
              <h2 style="color:#72eff5;margin-top:0">OpenBrain</h2>
              <p>You've been invited to collaborate on <strong>${brainName}</strong> as a <strong>${role}</strong>.</p>
              <p style="margin:24px 0">
                <a href="${acceptUrl}" style="background:#72eff5;color:#111;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;display:inline-block">
                  Accept Invite
                </a>
              </p>
              <p style="color:#888;font-size:12px">Or copy this link: ${acceptUrl}</p>
              <p style="color:#555;font-size:11px">If you didn't expect this, you can ignore this email.</p>
            </div>`,
        }),
      }).catch((err) => console.error("[brains:invite] Resend error:", err.message));
    }

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

    // Token is a 64-char lowercase hex string generated by randomBytes(32)
    if (!/^[0-9a-f]{64}$/i.test(token)) {
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

  // ── POST /api/brains?action=generate-api-key — create per-brain API key ──
  if (method === "POST" && action === "generate-api-key") {
    const { brain_id, label } = req.body;
    if (!brain_id) return res.status(400).json({ error: "brain_id required" });
    // Only owner can generate keys
    const ownerRes = await fetch(`${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { headers: hdrs() });
    if (!(await ownerRes.json()).length) return res.status(403).json({ error: "Not the brain owner" });
    // Generate a secure random key: ob_<32 hex chars>
    const bytes = Array.from({ length: 32 }, () => Math.floor(Math.random() * 256));
    const key = "ob_" + bytes.map(b => b.toString(16).padStart(2, "0")).join("");
    const r = await fetch(`${SB_URL}/rest/v1/brain_api_keys`, {
      method: "POST",
      headers: hdrs({ "Prefer": "return=representation" }),
      body: JSON.stringify({ brain_id, user_id: user.id, api_key: key, label: (label || "").slice(0, 100) || "Default" }),
    });
    if (!r.ok) return res.status(502).json({ error: "Failed to create API key" });
    const [created] = await r.json();
    return res.status(200).json({ id: created.id, api_key: key, label: created.label, created_at: created.created_at });
  }

  // ── GET /api/brains?action=api-keys&brain_id=... — list brain API keys ──
  if (method === "GET" && action === "api-keys") {
    const brain_id = req.query.brain_id;
    if (!brain_id) return res.status(400).json({ error: "brain_id required" });
    const ownerRes = await fetch(`${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { headers: hdrs() });
    if (!(await ownerRes.json()).length) return res.status(403).json({ error: "Not the brain owner" });
    const r = await fetch(
      `${SB_URL}/rest/v1/brain_api_keys?brain_id=eq.${encodeURIComponent(brain_id)}&is_active=eq.true&select=id,label,created_at,last_used_at&order=created_at.desc`,
      { headers: hdrs() }
    );
    if (!r.ok) return res.status(502).json({ error: "Failed to fetch API keys" });
    return res.status(200).json(await r.json());
  }

  // ── DELETE /api/brains?action=api-key — revoke a brain API key ──
  if (method === "DELETE" && action === "api-key") {
    const { key_id, brain_id } = req.body;
    if (!key_id || !brain_id) return res.status(400).json({ error: "key_id and brain_id required" });
    const ownerRes = await fetch(`${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}`, { headers: hdrs() });
    if (!(await ownerRes.json()).length) return res.status(403).json({ error: "Not the brain owner" });
    const r = await fetch(
      `${SB_URL}/rest/v1/brain_api_keys?id=eq.${encodeURIComponent(key_id)}&brain_id=eq.${encodeURIComponent(brain_id)}`,
      { method: "PATCH", headers: hdrs({ "Prefer": "return=minimal" }), body: JSON.stringify({ is_active: false }) }
    );
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
