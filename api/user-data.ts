import type { IncomingMessage } from "http";
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { withAuth } from "./_lib/withAuth.js";
import { checkBrainAccess } from "./_lib/checkBrainAccess.js";
import { sendInviteEmail } from "./_lib/sendInviteEmail.js";
import { markWebhookEventSeen } from "./_lib/webhookIdempotency.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { sbHeaders } from "./_lib/sbHeaders.js";
import {
  createCheckoutUrl as lemonCreateCheckoutUrl,
  getCustomerPortalUrl as lemonGetCustomerPortalUrl,
  verifyWebhookSignature as lemonVerifyWebhookSignature,
} from "./_lib/lemonsqueezy.js";
import {
  grantEntitlement as rcGrantEntitlement,
  revokePromotionalEntitlements as rcRevoke,
  verifyWebhookAuth as rcVerifyWebhookAuth,
  type RevenueCatWebhookBody,
} from "./_lib/revenuecat.js";
import { resolveTier, writePlanChange, type Tier } from "./_lib/billing.js";
import crypto from "crypto";
import webpush from "web-push";
import { runGmailScanAllUsers } from "./_lib/gmailScan.js";
import { enrichAllBrains } from "./_lib/enrich.js";
import { verifyCronBearer } from "./_lib/cronAuth.js";
import { runPersonaDecayPass, runPersonaWeeklyPass } from "./_lib/personaHygiene.js";
import {
  IdempotencyError,
  normalizeIdempotencyKey,
  releaseIdempotency,
  reserveActionIdempotency,
} from "./_lib/idempotency.js";
import { googleAiFetch, googleAiModelUrl, googleAiModelsUrl } from "./_lib/googleAi.js";
import { bodyObject } from "./_lib/requestBody.js";
import { GEMINI_BULK_MODEL, GEMINI_FALLBACK_MODEL } from "./_lib/geminiModels.js";
import { isAdminUser } from "./_lib/adminAuth.js";

export const config = { api: { bodyParser: false } };

const MAX_RAW_BODY_BYTES = 2 * 1024 * 1024;

class BodyTooLargeError extends Error {
  constructor() {
    super("Request body too large");
    this.name = "BodyTooLargeError";
  }
}

function bufferBody(req: ApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const stream = req as unknown as IncomingMessage;
    stream.on("data", (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.byteLength;
      if (total > MAX_RAW_BODY_BYTES) {
        reject(new BodyTooLargeError());
        stream.destroy();
        return;
      }
      chunks.push(buf);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

const SB_URL = process.env.SUPABASE_URL;
const hdrs = sbHeaders;

const MAX_CHARS = 8000;

// Dispatched via rewrites:
//   /api/memory, /api/activity, /api/health, /api/vault → /api/user-data?resource=X
//   /api/pin → /api/user-data?resource=pin
//   /api/user-data?resource=api_keys → MCP API key management
//   /api/notification-prefs → /api/user-data?resource=prefs
//   /api/push-subscribe     → /api/user-data?resource=push
//   /api/brains             → /api/user-data?resource=brains
//   /api/important-memories → /api/user-data?resource=important_memories
//   /api/cron/daily         → /api/user-data?resource=cron-daily
//   /api/notifications      → /api/user-data?resource=notifications
//   /api/lemon-checkout     → /api/user-data?resource=lemon-checkout
//   /api/lemon-webhook      → /api/user-data?resource=lemon-webhook
//   /api/lemon-portal       → /api/user-data?resource=lemon-portal
//   /api/revenuecat-webhook → /api/user-data?resource=revenuecat-webhook
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  let rawBody: Buffer;
  try {
    rawBody = await bufferBody(req);
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      return void res.status(413).json({ error: "Request body too large" });
    }
    throw err;
  }
  const resource = req.query.resource as string | undefined;

  // LemonSqueezy webhook uses raw body for HMAC signature verification.
  if (resource === "lemon-webhook") return handleLemonWebhook(req, res, rawBody);
  // RevenueCat uses Authorization header (raw body not required) but we
  // still pass it through so signature/parse logic stays consistent.
  if (resource === "revenuecat-webhook") return handleRevenueCatWebhook(req, res, rawBody);

  // Parse body for all other handlers. Reject malformed JSON instead of
  // silently coercing to {}, which used to mask 413/400-class errors and
  // make handlers see an empty body as if the client sent one.
  if (rawBody.length === 0) {
    req.body = {};
  } else {
    try {
      req.body = JSON.parse(rawBody.toString("utf-8"));
    } catch (e: any) {
      console.error("[user-data:parse]", e?.message ?? e);
      return void res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  if (resource === "activity") return handleActivity(req, res);
  if (resource === "health") return handleHealth(req, res);
  if (resource === "sentry_issues") return handleSentryIssues(req, res);
  if (resource === "status") return handlePublicStatus(req, res);
  if (resource === "vault") return handleVault(req, res);
  if (resource === "vault_entries") return handleVaultEntries(req, res);
  if (resource === "brain_vault_grants") return handleBrainVaultGrants(req, res);
  if (resource === "pin") return handlePin(req, res);
  if (resource === "account") return handleDeleteAccount(req, res);
  if (resource === "full_export") return handleFullExport(req, res);
  if (resource === "api_keys") return handleApiKeys(req, res);
  if (resource === "prefs") return handleNotificationPrefs(req, res);
  if (resource === "push") return handlePushSubscribe(req, res);
  if (resource === "brains") return handleBrains(req, res);
  if (resource === "brain-notification-prefs") return handleBrainNotificationPrefs(req, res);
  if (resource === "important_memories") return handleImportantMemories(req, res);
  if (resource === "cron-daily") return handleCronDaily(req, res);
  if (resource === "cron-hourly") return handleCronHourly(req, res);
  if (resource === "trigger-test-push") return handleTriggerTestPush(req, res);
  if (resource === "notifications") return handleNotifications(req, res);
  if (resource === "lemon-checkout") return handleLemonCheckout(req, res);
  if (resource === "lemon-portal") return handleLemonPortal(req, res);
  if (resource === "admin_users") return handleAdminUsers(req, res);
  if (resource === "admin_user_overview") return handleAdminUserOverview(req, res);
  if (resource === "admin_set_tier") return handleAdminSetTier(req, res);
  if (resource === "profile") return handleProfile(req, res);
  if (resource === "checklist_done") return handleChecklistDone(req, res);
  // Default: memory
  return handleMemory(req, res);
}

// ── /api/profile (rewritten to /api/user-data?resource=profile) ──
// One row per user in public.user_personas; injected into chat system prompts.
// NEVER store sensitive identifiers here — those live in the encrypted Vault.
const handleProfile = withAuth(
  { methods: ["GET", "PUT"], rateLimit: 30 },
  async ({ req, res, user }) => {
    if (req.method === "GET") {
      const r = await fetch(
        `${SB_URL}/rest/v1/user_personas?user_id=eq.${encodeURIComponent(user.id)}&select=*&limit=1`,
        { headers: hdrs() },
      );
      if (!r.ok) return void res.status(502).json({ error: "Failed to fetch profile" });
      const rows: any[] = await r.json();
      return void res.status(200).json({ profile: rows[0] ?? null });
    }

    // PUT — upsert. Server enforces field whitelist + length caps so the
    // preamble can never blow past its token budget.
    const body = (req.body ?? {}) as Record<string, unknown>;
    const trimStr = (v: unknown, max: number): string | null => {
      if (typeof v !== "string") return null;
      const s = v.trim();
      return s ? s.slice(0, max) : null;
    };
    const trimArr = (v: unknown, maxItems: number, transform: (item: any) => any): any[] => {
      if (!Array.isArray(v)) return [];
      return v.slice(0, maxItems).map(transform).filter(Boolean);
    };

    const upsert = {
      user_id: user.id,
      full_name: trimStr(body.full_name, 120),
      preferred_name: trimStr(body.preferred_name, 60),
      pronouns: trimStr(body.pronouns, 40),
      family: trimArr(body.family, 10, (f: any) => {
        const relation = trimStr(f?.relation, 40);
        const name = trimStr(f?.name, 80);
        const notes = trimStr(f?.notes, 120);
        if (!relation && !name) return null;
        return { relation, name, notes };
      }),
      habits: trimArr(body.habits, 12, (h: any) => trimStr(h, 120)),
      context: trimStr(body.context, 4000),
      enabled: body.enabled !== false,
      updated_at: new Date().toISOString(),
    };

    const r = await fetch(`${SB_URL}/rest/v1/user_personas?on_conflict=user_id`, {
      method: "POST",
      headers: hdrs({ Prefer: "resolution=merge-duplicates,return=representation" }),
      body: JSON.stringify(upsert),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return void res.status(500).json({ error: "save_failed", detail: text.slice(0, 200) });
    }
    const saved = await r.json();
    return void res.status(200).json({ profile: Array.isArray(saved) ? saved[0] : saved });
  },
);

// ── /api/user-data?resource=checklist_done ──
// Cross-device sticky-done flags for the home first-run checklist. The hook
// pins items here once any signal (live remote check or in-memory threshold)
// confirms them, and they stay pinned forever — fetching this on mount lets a
// fresh device see the same completed state as the device that first ticked
// the item.
//
// GET  — { items: { capture5: ISO, persona: ISO, ... } }
// POST — body: { itemId: string }. Upserts (user_id, item_id) → idempotent.
const CHECKLIST_ITEM_ID_RE = /^[a-z][a-z0-9_]{0,39}$/;
const handleChecklistDone = withAuth(
  { methods: ["GET", "POST"], rateLimit: 60 },
  async ({ req, res, user }) => {
    if (req.method === "GET") {
      const r = await fetch(
        `${SB_URL}/rest/v1/user_checklist_done?user_id=eq.${encodeURIComponent(user.id)}&select=item_id,completed_at`,
        { headers: hdrs() },
      );
      if (!r.ok) return void res.status(502).json({ error: "Failed to fetch checklist" });
      const rows: Array<{ item_id: string; completed_at: string }> = await r.json();
      const items: Record<string, string> = {};
      for (const row of rows) items[row.item_id] = row.completed_at;
      return void res.status(200).json({ items });
    }

    // POST — pin a single item.
    const { itemId } = (req.body ?? {}) as { itemId?: unknown };
    if (typeof itemId !== "string" || !CHECKLIST_ITEM_ID_RE.test(itemId)) {
      return void res.status(400).json({ error: "itemId must match [a-z][a-z0-9_]*" });
    }
    const r = await fetch(`${SB_URL}/rest/v1/user_checklist_done?on_conflict=user_id,item_id`, {
      method: "POST",
      headers: hdrs({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ user_id: user.id, item_id: itemId }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return void res.status(502).json({ error: "save_failed", detail: detail.slice(0, 200) });
    }
    return void res.status(200).json({ ok: true });
  },
);

// ── /api/brains (rewritten to /api/user-data?resource=brains) ──
//
// GET     — list owned brains, auto-create personal brain on first call.
// POST    — create a new (non-personal) brain. Body: { name, description? }.
//           Phase 1 of multi-brain: solo-only, no sharing.
// PATCH   — update brain metadata (e.g. someday_categories) OR name/description.
//           Body: { id, metadata? } | { id, name?, description? }.
// DELETE  — delete a non-personal brain by id (cascades to entries via FK).
// POST ?action=set-active — persist user_ai_settings.active_brain_id for
//           cross-device active-brain sync. Body: { id: uuid | null }.
const handleBrains = withAuth(
  { methods: ["GET", "POST", "PATCH", "DELETE"], rateLimit: 60 },
  async ({ req, res, user }) => {
    const action = req.query.action as string | undefined;

    // ── set-active: persist active brain to user_ai_settings (cross-device) ──
    if (req.method === "POST" && action === "set-active") {
      const { id } = (req.body ?? {}) as { id?: string | null };
      if (id !== null && (typeof id !== "string" || id.length > 100))
        return void res.status(400).json({ error: "id must be uuid or null" });

      // If id is provided, verify access (owner OR member/viewer) before
      // persisting — switching to a shared brain is legal.
      if (id) {
        const access = await checkBrainAccess(user.id, id);
        if (!access) return void res.status(403).json({ error: "Forbidden" });
      }

      // Upsert into user_ai_settings (PK on user_id) — works whether row exists or not.
      const r = await fetch(`${SB_URL}/rest/v1/user_ai_settings`, {
        method: "POST",
        headers: hdrs({ Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify({
          user_id: user.id,
          active_brain_id: id,
          updated_at: new Date().toISOString(),
        }),
      });
      if (!r.ok) return void res.status(502).json({ error: "Failed to set active brain" });
      return void res.status(200).json({ ok: true, active_brain_id: id });
    }

    // ─────────────────────────────────────────────────────────────────────
    // Brain sharing (phase 2 of multi-brain). Owner sends an email-keyed
    // invite, recipient redeems via /api/brains?action=accept.
    // Roles: 'viewer' (read-only) | 'member' (read + write).
    // ─────────────────────────────────────────────────────────────────────

    // Helper: confirm caller owns the brain. Owner-only actions use this.
    const requireOwner = async (brainId: string): Promise<boolean> => {
      const r = await fetch(
        `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brainId)}&owner_id=eq.${encodeURIComponent(user.id)}&select=id,name`,
        { headers: hdrs() },
      );
      const rows: any[] = r.ok ? await r.json() : [];
      return rows.length > 0;
    };

    const ROLE_RE = /^(viewer|member)$/;
    const TOKEN_RE = /^[0-9a-f]{64}$/i;
    // Lightweight email shape — server-side validation is best-effort; the
    // canonical check happens when Supabase auth tries to look up the user.
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // ── POST ?action=invite — owner sends an email-keyed invite ──
    // Body: { brain_id, email, role: 'viewer' | 'member' }
    // Returns: { ok: true, invite: { id, token, accept_url, expires_at, email_sent } }
    if (req.method === "POST" && action === "invite") {
      const body = (req.body ?? {}) as {
        brain_id?: unknown;
        email?: unknown;
        role?: unknown;
      };
      const brainId = typeof body.brain_id === "string" ? body.brain_id : "";
      const email =
        typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
      const role = typeof body.role === "string" ? body.role : "";
      if (!brainId) return void res.status(400).json({ error: "brain_id required" });
      if (!EMAIL_RE.test(email)) return void res.status(400).json({ error: "invalid email" });
      if (!ROLE_RE.test(role)) return void res.status(400).json({ error: "invalid role" });
      if (email === (user.email ?? "").toLowerCase())
        return void res.status(400).json({ error: "Cannot invite yourself" });
      if (!(await requireOwner(brainId)))
        return void res.status(403).json({ error: "Forbidden" });

      // Block invites to existing members so the owner doesn't accidentally
      // demote a member by re-inviting at a lower role. Frontend can offer
      // role-change in the members list instead.
      const existingMember = await fetch(
        `${SB_URL}/rest/v1/brain_members?brain_id=eq.${encodeURIComponent(brainId)}&select=user_id`,
        { headers: hdrs() },
      );
      const existingMembers: Array<{ user_id: string }> = existingMember.ok
        ? await existingMember.json()
        : [];
      // Look up user by email to reject re-invites of existing members.
      // auth.admin.users.list is the only way to resolve email→id with
      // service-role; uses /auth/v1/admin/users with per_page filter param.
      // If lookup fails we proceed (best-effort) — duplicate-prevention is a
      // UX nicety, not a correctness gate.
      try {
        const lookupR = await fetch(
          `${SB_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
          { headers: hdrs() },
        );
        if (lookupR.ok) {
          const lookupData = (await lookupR.json()) as { users?: Array<{ id: string }> };
          const matchId = lookupData.users?.[0]?.id;
          if (matchId && existingMembers.some((m) => m.user_id === matchId)) {
            return void res.status(409).json({ error: "User is already a member" });
          }
        }
      } catch {
        /* best-effort */
      }

      // Generate a 64-hex (32-byte) token. App.tsx validates the same shape
      // on the URL before passing to accept, so any malformed link is
      // rejected client-side before we even hit the server.
      const token = crypto.randomBytes(32).toString("hex");
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      // Replace any prior pending invite for the same (brain_id, email) so
      // the latest role / link wins. We do this by deleting first to avoid a
      // unique-violation race with the new insert.
      await fetch(
        `${SB_URL}/rest/v1/brain_invites?brain_id=eq.${encodeURIComponent(brainId)}&email=eq.${encodeURIComponent(email)}&accepted_at=is.null`,
        { method: "DELETE", headers: hdrs({ Prefer: "return=minimal" }) },
      ).catch(() => {});

      const insR = await fetch(`${SB_URL}/rest/v1/brain_invites`, {
        method: "POST",
        headers: hdrs({ Prefer: "return=representation" }),
        body: JSON.stringify({
          brain_id: brainId,
          email,
          role,
          token,
          invited_by: user.id,
          expires_at: expiresAt.toISOString(),
        }),
      });
      if (!insR.ok) {
        const detail = await insR.text().catch(() => "");
        return void res.status(502).json({ error: `Database error: ${detail.slice(0, 200)}` });
      }
      const [inviteRow]: any[] = await insR.json();

      // Compose the accept URL. App.tsx already routes ?invite=<token> at the
      // root, so we point straight at the production origin. Falls back to
      // the request host so preview deployments work too.
      const proto = (req.headers["x-forwarded-proto"] as string | undefined) || "https";
      const host = (req.headers["x-forwarded-host"] || req.headers.host) as string;
      const acceptUrl = `${proto}://${host}/?invite=${encodeURIComponent(token)}`;

      // Look up brain name + inviter name for the email body. Best-effort —
      // the link still works without these, the email is just less personal.
      const [brainNameRow, profileRow] = await Promise.all([
        fetch(
          `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brainId)}&select=name`,
          { headers: hdrs() },
        )
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
        fetch(
          `${SB_URL}/rest/v1/user_personas?user_id=eq.${encodeURIComponent(user.id)}&select=preferred_name,full_name&limit=1`,
          { headers: hdrs() },
        )
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
      ]);
      const brainName = (brainNameRow as any[])[0]?.name ?? "a brain";
      const inviterName =
        (profileRow as any[])[0]?.preferred_name ||
        (profileRow as any[])[0]?.full_name ||
        (user.email as string | undefined) ||
        "Someone";

      const emailResult = await sendInviteEmail({
        to: email,
        brainName,
        inviterName,
        acceptUrl,
        role: role as "viewer" | "member",
      });

      return void res.status(201).json({
        ok: true,
        invite: {
          id: inviteRow.id,
          token,
          accept_url: acceptUrl,
          expires_at: inviteRow.expires_at,
          email_sent: emailResult.ok,
          email_error: emailResult.ok ? undefined : emailResult.error,
        },
      });
    }

    // ── POST ?action=accept — recipient redeems an invite token ──
    // Body: { token }. Recipient must be authenticated (caller is `user`).
    // We only enforce email-match if the invite has an email; protects
    // against link-leakage.
    if (req.method === "POST" && action === "accept") {
      const { token } = (req.body ?? {}) as { token?: unknown };
      if (typeof token !== "string" || !TOKEN_RE.test(token))
        return void res.status(400).json({ error: "invalid token" });

      const lookup = await fetch(
        `${SB_URL}/rest/v1/brain_invites?token=eq.${encodeURIComponent(token)}&select=id,brain_id,email,role,expires_at,accepted_at,invited_by&limit=1`,
        { headers: hdrs() },
      );
      const inviteRows: any[] = lookup.ok ? await lookup.json() : [];
      const invite = inviteRows[0];
      if (!invite) return void res.status(404).json({ error: "Invite not found" });
      if (invite.accepted_at) return void res.status(410).json({ error: "Invite already used" });
      if (new Date(invite.expires_at).getTime() < Date.now())
        return void res.status(410).json({ error: "Invite expired" });
      const expectedEmail = (invite.email as string).toLowerCase();
      const callerEmail = (user.email as string | undefined)?.toLowerCase() ?? "";
      if (expectedEmail && callerEmail !== expectedEmail)
        return void res.status(403).json({ error: "Invite is for a different email address" });

      // Refuse to add the brain owner as a member (silently treat as accepted
      // so the UI doesn't error out on a re-redemption from the owner).
      const ownerCheck = await fetch(
        `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(invite.brain_id)}&select=owner_id&limit=1`,
        { headers: hdrs() },
      );
      const ownerRows: any[] = ownerCheck.ok ? await ownerCheck.json() : [];
      if (ownerRows[0]?.owner_id === user.id) {
        await fetch(
          `${SB_URL}/rest/v1/brain_invites?id=eq.${encodeURIComponent(invite.id)}`,
          {
            method: "PATCH",
            headers: hdrs({ Prefer: "return=minimal" }),
            body: JSON.stringify({ accepted_at: new Date().toISOString() }),
          },
        ).catch(() => {});
        return void res.status(200).json({ ok: true, brain_id: invite.brain_id });
      }

      // Upsert the membership row — replays of the same invite should be
      // idempotent rather than throwing on the composite PK.
      const upsert = await fetch(
        `${SB_URL}/rest/v1/brain_members?on_conflict=brain_id,user_id`,
        {
          method: "POST",
          headers: hdrs({ Prefer: "resolution=merge-duplicates,return=minimal" }),
          body: JSON.stringify({
            brain_id: invite.brain_id,
            user_id: user.id,
            role: invite.role,
            invited_by: invite.invited_by,
          }),
        },
      );
      if (!upsert.ok) {
        const detail = await upsert.text().catch(() => "");
        return void res.status(502).json({ error: `Database error: ${detail.slice(0, 200)}` });
      }

      // Mark invite consumed.
      await fetch(
        `${SB_URL}/rest/v1/brain_invites?id=eq.${encodeURIComponent(invite.id)}`,
        {
          method: "PATCH",
          headers: hdrs({ Prefer: "return=minimal" }),
          body: JSON.stringify({ accepted_at: new Date().toISOString() }),
        },
      ).catch(() => {});

      return void res.status(200).json({ ok: true, brain_id: invite.brain_id });
    }

    // ── GET ?action=members&id=<brain> — list members + pending invites ──
    // Owner sees the full picture (members + pending invites). Members and
    // viewers see members only.
    if (req.method === "GET" && action === "members") {
      const brainId = req.query.id as string | undefined;
      if (!brainId) return void res.status(400).json({ error: "id required" });
      const access = await checkBrainAccess(user.id, brainId);
      if (!access) return void res.status(403).json({ error: "Forbidden" });

      // Owner row.
      const ownerR = await fetch(
        `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brainId)}&select=owner_id`,
        { headers: hdrs() },
      );
      const ownerRows: any[] = ownerR.ok ? await ownerR.json() : [];
      const ownerId = ownerRows[0]?.owner_id;

      // Membership rows.
      const memR = await fetch(
        `${SB_URL}/rest/v1/brain_members?brain_id=eq.${encodeURIComponent(brainId)}&select=user_id,role,joined_at&order=joined_at.asc`,
        { headers: hdrs() },
      );
      const memberRows: any[] = memR.ok ? await memR.json() : [];

      // Resolve emails for owner + every member by hitting auth admin.
      const ids = new Set<string>();
      if (ownerId) ids.add(ownerId);
      for (const m of memberRows) ids.add(m.user_id);
      const emailMap: Record<string, string> = {};
      await Promise.all(
        Array.from(ids).map(async (id) => {
          try {
            const r = await fetch(`${SB_URL}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
              headers: hdrs(),
            });
            if (r.ok) {
              const d = (await r.json()) as { email?: string };
              if (d.email) emailMap[id] = d.email;
            }
          } catch {
            /* best-effort */
          }
        }),
      );

      const members = [
        ...(ownerId
          ? [{ user_id: ownerId, role: "owner" as const, email: emailMap[ownerId] ?? null }]
          : []),
        ...memberRows.map((m) => ({
          user_id: m.user_id,
          role: m.role as "viewer" | "member",
          email: emailMap[m.user_id] ?? null,
          joined_at: m.joined_at,
        })),
      ];

      let invites: Array<{
        id: string;
        email: string;
        role: string;
        created_at: string;
        expires_at: string;
      }> = [];
      if (access.role === "owner") {
        const invR = await fetch(
          `${SB_URL}/rest/v1/brain_invites?brain_id=eq.${encodeURIComponent(brainId)}&accepted_at=is.null&select=id,email,role,created_at,expires_at&order=created_at.desc`,
          { headers: hdrs() },
        );
        invites = invR.ok ? await invR.json() : [];
      }

      return void res.status(200).json({ members, invites, my_role: access.role });
    }

    // ── DELETE ?action=remove-member&id=<brain>&user_id=<X> — owner only ──
    // Also used by a member to remove themselves (callers sending their own user_id).
    if (req.method === "DELETE" && action === "remove-member") {
      const brainId = req.query.id as string | undefined;
      const targetId = req.query.user_id as string | undefined;
      if (!brainId || !targetId)
        return void res.status(400).json({ error: "id and user_id required" });

      const isOwner = await requireOwner(brainId);
      const isSelf = targetId === user.id;
      if (!isOwner && !isSelf) return void res.status(403).json({ error: "Forbidden" });

      const del = await fetch(
        `${SB_URL}/rest/v1/brain_members?brain_id=eq.${encodeURIComponent(brainId)}&user_id=eq.${encodeURIComponent(targetId)}`,
        { method: "DELETE", headers: hdrs({ Prefer: "return=minimal" }) },
      );
      if (!del.ok) return void res.status(502).json({ error: "Failed to remove member" });
      return void res.status(200).json({ ok: true });
    }

    // ── PATCH ?action=update-role — owner changes a member's role ──
    // Body: { brain_id, user_id, role: 'viewer' | 'member' }
    if (req.method === "PATCH" && action === "update-role") {
      const body = (req.body ?? {}) as {
        brain_id?: unknown;
        user_id?: unknown;
        role?: unknown;
      };
      const brainId = typeof body.brain_id === "string" ? body.brain_id : "";
      const targetId = typeof body.user_id === "string" ? body.user_id : "";
      const role = typeof body.role === "string" ? body.role : "";
      if (!brainId || !targetId)
        return void res.status(400).json({ error: "brain_id and user_id required" });
      if (!ROLE_RE.test(role)) return void res.status(400).json({ error: "invalid role" });
      if (!(await requireOwner(brainId)))
        return void res.status(403).json({ error: "Forbidden" });

      const upd = await fetch(
        `${SB_URL}/rest/v1/brain_members?brain_id=eq.${encodeURIComponent(brainId)}&user_id=eq.${encodeURIComponent(targetId)}`,
        {
          method: "PATCH",
          headers: hdrs({ Prefer: "return=minimal" }),
          body: JSON.stringify({ role }),
        },
      );
      if (!upd.ok) return void res.status(502).json({ error: "Failed to update role" });
      return void res.status(200).json({ ok: true });
    }

    // ── DELETE ?action=revoke-invite&invite_id=<X> — owner only ──
    if (req.method === "DELETE" && action === "revoke-invite") {
      const inviteId = req.query.invite_id as string | undefined;
      if (!inviteId) return void res.status(400).json({ error: "invite_id required" });

      // Confirm ownership of the brain the invite belongs to before deleting.
      const lookup = await fetch(
        `${SB_URL}/rest/v1/brain_invites?id=eq.${encodeURIComponent(inviteId)}&select=brain_id&limit=1`,
        { headers: hdrs() },
      );
      const inviteRows: any[] = lookup.ok ? await lookup.json() : [];
      const brainId = inviteRows[0]?.brain_id as string | undefined;
      if (!brainId || !(await requireOwner(brainId)))
        return void res.status(403).json({ error: "Forbidden" });

      const del = await fetch(
        `${SB_URL}/rest/v1/brain_invites?id=eq.${encodeURIComponent(inviteId)}`,
        { method: "DELETE", headers: hdrs({ Prefer: "return=minimal" }) },
      );
      if (!del.ok) return void res.status(502).json({ error: "Failed to revoke invite" });
      return void res.status(200).json({ ok: true });
    }

    // ── POST: create a new brain (non-personal) ──
    if (req.method === "POST") {
      const { name, description } = (req.body ?? {}) as {
        name?: unknown;
        description?: unknown;
      };
      if (typeof name !== "string" || !name.trim())
        return void res.status(400).json({ error: "name required" });
      const trimmedName = name.trim().slice(0, 60);
      const trimmedDesc = typeof description === "string" ? description.trim().slice(0, 280) : null;

      const r = await fetch(`${SB_URL}/rest/v1/brains`, {
        method: "POST",
        headers: hdrs({ Prefer: "return=representation" }),
        body: JSON.stringify({
          name: trimmedName,
          description: trimmedDesc,
          owner_id: user.id,
          is_personal: false,
        }),
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => String(r.status));
        return void res
          .status(502)
          .json({ error: `Failed to create brain: ${detail.slice(0, 200)}` });
      }
      const [row]: any[] = await r.json();
      return void res.status(201).json(row);
    }

    // ── DELETE: remove a non-personal brain ──
    if (req.method === "DELETE") {
      const id = req.query.id as string | undefined;
      if (!id) return void res.status(400).json({ error: "id required" });

      // Block delete if this is the user's personal brain or not theirs.
      const guard = await fetch(
        `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&select=id,is_personal`,
        { headers: hdrs() },
      );
      const rows: any[] = guard.ok ? await guard.json() : [];
      if (!rows.length) return void res.status(403).json({ error: "Forbidden" });
      if (rows[0].is_personal)
        return void res.status(400).json({ error: "Cannot delete personal brain" });

      const del = await fetch(
        `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}`,
        { method: "DELETE", headers: hdrs({ Prefer: "return=minimal" }) },
      );
      if (!del.ok) return void res.status(502).json({ error: "Failed to delete brain" });
      return void res.status(200).json({ ok: true });
    }

    if (req.method === "PATCH") {
      const body = (req.body ?? {}) as {
        id?: string;
        metadata?: unknown;
        name?: unknown;
        description?: unknown;
      };
      const { id, metadata } = body;
      if (!id || typeof id !== "string") return void res.status(400).json({ error: "id required" });

      // Branch A: metadata-only patch (existing behavior, shallow-merged).
      if (metadata !== undefined) {
        if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
          return void res.status(400).json({ error: "metadata must be a plain object" });
        const serialized = JSON.stringify(metadata);
        if (serialized.length > 16_384)
          return void res.status(413).json({ error: "metadata too large (max 16KB)" });

        const cur = await fetch(
          `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}&select=metadata`,
          { headers: hdrs() },
        );
        if (!cur.ok) return void res.status(502).json({ error: "Failed to read brain" });
        const curRows: any[] = await cur.json();
        if (!curRows.length) return void res.status(403).json({ error: "Forbidden" });
        const merged = { ...(curRows[0].metadata ?? {}), ...(metadata as Record<string, unknown>) };

        const upd = await fetch(
          `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}`,
          {
            method: "PATCH",
            headers: hdrs({ Prefer: "return=representation" }),
            body: JSON.stringify({ metadata: merged }),
          },
        );
        if (!upd.ok) return void res.status(502).json({ error: "Failed to update brain" });
        const [row]: any[] = await upd.json();
        return void res.status(200).json(row);
      }

      // Branch B: rename / description patch.
      const patch: Record<string, unknown> = {};
      if (typeof body.name === "string" && body.name.trim()) {
        patch.name = body.name.trim().slice(0, 60);
      }
      if (typeof body.description === "string") {
        patch.description = body.description.trim().slice(0, 280) || null;
      } else if (body.description === null) {
        patch.description = null;
      }
      if (!Object.keys(patch).length)
        return void res.status(400).json({ error: "Nothing to update" });

      const upd = await fetch(
        `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(user.id)}`,
        {
          method: "PATCH",
          headers: hdrs({ Prefer: "return=representation" }),
          body: JSON.stringify(patch),
        },
      );
      if (!upd.ok) return void res.status(502).json({ error: "Failed to update brain" });
      const updRows: any[] = await upd.json();
      if (!updRows.length) return void res.status(403).json({ error: "Forbidden" });
      return void res.status(200).json(updRows[0]);
    }

    // ── GET: list brains + active_brain_id from user_ai_settings ──
    // Returns owned brains AND brains the user is a member/viewer of, with
    // a derived `my_role` field on each row so the client can gate write UI
    // (capture button, edit, delete) without a second round-trip.
    const owned = await fetch(
      `${SB_URL}/rest/v1/brains?owner_id=eq.${encodeURIComponent(user.id)}&order=created_at.asc`,
      { headers: hdrs() },
    );
    if (!owned.ok) return void res.status(502).json({ error: "Failed to fetch brains" });
    let ownedData: any[] = await owned.json();
    ownedData = ownedData.map((b) => ({ ...b, my_role: "owner" }));

    // Shared brains (member/viewer rows joined to brains). Note: do NOT
    // request updated_at on the joined brains row — that column doesn't
    // exist on the brains table. Asking for it makes PostgREST return a
    // 400 with code 42703, which the if (sharedR.ok) check below silently
    // swallows, leaving member-role users with zero shared brains in the
    // brain switcher even though their brain_members row is correct.
    const sharedR = await fetch(
      `${SB_URL}/rest/v1/brain_members?user_id=eq.${encodeURIComponent(user.id)}&select=role,brain:brains(id,name,description,owner_id,is_personal,created_at)`,
      { headers: hdrs() },
    );
    let sharedData: any[] = [];
    if (sharedR.ok) {
      const sharedRows: any[] = await sharedR.json();
      sharedData = sharedRows
        .filter((row) => row.brain) // FK row may be null if brain was deleted
        .map((row) => ({ ...row.brain, my_role: row.role as "viewer" | "member" }));
    }

    if (ownedData.length === 0) {
      const createRes = await fetch(`${SB_URL}/rest/v1/brains`, {
        method: "POST",
        headers: hdrs({ Prefer: "return=representation" }),
        body: JSON.stringify({ name: "My Brain", owner_id: user.id, is_personal: true }),
      });
      if (createRes.ok) {
        const [newBrain]: any[] = await createRes.json();
        await fetch(
          `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(user.id)}&brain_id=is.null`,
          {
            method: "PATCH",
            headers: hdrs({ Prefer: "return=minimal" }),
            body: JSON.stringify({ brain_id: newBrain.id }),
          },
        ).catch(() => {});
        ownedData = [newBrain];
      }
    }

    // Merge owned + shared. Owned first (already chronologically sorted),
    // shared last (sorted by name for stability). The active-brain header
    // accepts either group.
    const allBrains = [
      ...ownedData,
      ...sharedData.sort((a, b) => String(a.name).localeCompare(String(b.name))),
    ];

    // Backwards compat: response is the array of brains. Active id is exposed
    // via X-Active-Brain-Id header so existing clients (which do `.json()`
    // and expect an array) keep working unchanged.
    let activeBrainId: string | null = null;
    try {
      const ar = await fetch(
        `${SB_URL}/rest/v1/user_ai_settings?user_id=eq.${encodeURIComponent(user.id)}&select=active_brain_id&limit=1`,
        { headers: hdrs() },
      );
      if (ar.ok) {
        const arows: any[] = await ar.json();
        const candidate = arows[0]?.active_brain_id;
        if (candidate && allBrains.some((b) => b.id === candidate)) {
          activeBrainId = candidate;
        }
      }
    } catch {
      /* ignore — header simply absent */
    }
    if (activeBrainId) res.setHeader("X-Active-Brain-Id", activeBrainId);
    return void res.status(200).json(allBrains);
  },
);

// ── /api/important-memories (rewritten to /api/user-data?resource=important_memories) ──
// User-curated durable facts. v0 = user-curated only — no AI inference, no
// contradiction detection. Vault entries (type='secret') are blocked from
// becoming Important Memories — that's the privacy contract.
const IMPORTANT_MEMORY_TYPES = new Set(["fact", "preference", "decision", "obligation"]);
// Slug shape produced by src/lib/importantMemory.ts generateMemoryKey().
// Server enforces it so a malformed client can't write garbage keys that
// the unique-active index won't catch in time.
const MEMORY_KEY_RE = /^(fact|preference|decision|obligation):[a-z0-9_]{1,80}$/;
const handleImportantMemories = withAuth(
  { methods: ["GET", "POST", "PATCH", "DELETE"], rateLimit: 60 },
  async ({ req, res, user }) => {
    const action = req.query.action as string | undefined;

    // Verify the brain belongs to the user. All actions require this.
    const requireOwnedBrain = async (brainId: string): Promise<boolean> => {
      const r = await fetch(
        `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brainId)}&owner_id=eq.${encodeURIComponent(user.id)}&select=id`,
        { headers: hdrs() },
      );
      const rows: any[] = r.ok ? await r.json() : [];
      return rows.length > 0;
    };

    // ── GET: list memories for a brain (active by default; ?status=retired) ──
    if (req.method === "GET") {
      const brainId = req.query.brain_id as string | undefined;
      if (!brainId) return void res.status(400).json({ error: "brain_id required" });
      if (!(await requireOwnedBrain(brainId)))
        return void res.status(403).json({ error: "Forbidden" });

      const status = (req.query.status as string | undefined) ?? "active";
      if (status !== "active" && status !== "retired" && status !== "all")
        return void res.status(400).json({ error: "status must be active|retired|all" });

      const statusFilter = status === "all" ? "" : `&status=eq.${status}`;
      const r = await fetch(
        `${SB_URL}/rest/v1/important_memories?brain_id=eq.${encodeURIComponent(brainId)}${statusFilter}&order=created_at.desc`,
        { headers: hdrs() },
      );
      if (!r.ok) return void res.status(502).json({ error: "Failed to fetch memories" });
      return void res.status(200).json(await r.json());
    }

    // ── POST: create an important memory ──
    if (req.method === "POST") {
      const body = (req.body ?? {}) as {
        brain_id?: unknown;
        memory_type?: unknown;
        memory_key?: unknown;
        title?: unknown;
        summary?: unknown;
        source_entry_ids?: unknown;
      };
      if (typeof body.brain_id !== "string" || !body.brain_id)
        return void res.status(400).json({ error: "brain_id required" });
      if (typeof body.memory_type !== "string" || !IMPORTANT_MEMORY_TYPES.has(body.memory_type))
        return void res
          .status(400)
          .json({ error: "memory_type must be fact|preference|decision|obligation" });
      if (typeof body.memory_key !== "string" || !body.memory_key.trim())
        return void res.status(400).json({ error: "memory_key required" });
      if (!MEMORY_KEY_RE.test(body.memory_key.trim()))
        return void res
          .status(400)
          .json({ error: "memory_key must match <type>:<slug> with [a-z0-9_]" });
      if (typeof body.title !== "string" || !body.title.trim())
        return void res.status(400).json({ error: "title required" });
      if (typeof body.summary !== "string" || !body.summary.trim())
        return void res.status(400).json({ error: "summary required" });

      if (!(await requireOwnedBrain(body.brain_id)))
        return void res.status(403).json({ error: "Forbidden" });

      const sourceIds = Array.isArray(body.source_entry_ids)
        ? body.source_entry_ids.filter((v) => typeof v === "string").slice(0, 20)
        : [];

      // Vault guard: if any source entry is type='secret', refuse — vault
      // entries cannot be promoted to Important Memories. Server-side check
      // because client cannot be trusted to honour the privacy contract.
      if (sourceIds.length) {
        const idsParam = sourceIds.map((id) => encodeURIComponent(id)).join(",");
        const r = await fetch(
          `${SB_URL}/rest/v1/entries?id=in.(${idsParam})&user_id=eq.${encodeURIComponent(user.id)}&select=id,type`,
          { headers: hdrs() },
        );
        const rows: any[] = r.ok ? await r.json() : [];
        if (rows.some((row) => row.type === "secret"))
          return void res
            .status(403)
            .json({ error: "Vault entries cannot become Important Memories" });
        if (rows.length !== sourceIds.length)
          return void res.status(400).json({ error: "One or more source entries not found" });
      }

      const insert = await fetch(`${SB_URL}/rest/v1/important_memories`, {
        method: "POST",
        headers: hdrs({ Prefer: "return=representation" }),
        body: JSON.stringify({
          brain_id: body.brain_id,
          user_id: user.id,
          memory_key: (body.memory_key as string).trim().slice(0, 200),
          title: (body.title as string).trim().slice(0, 200),
          summary: (body.summary as string).trim().slice(0, 1000),
          memory_type: body.memory_type,
          source_entry_ids: sourceIds,
          created_by: "user",
        }),
      });
      if (insert.status === 409) {
        return void res
          .status(409)
          .json({ error: "An active memory already exists with this key — edit instead" });
      }
      if (!insert.ok) {
        const detail = await insert.text().catch(() => String(insert.status));
        return void res
          .status(502)
          .json({ error: `Failed to create memory: ${detail.slice(0, 200)}` });
      }
      const [row]: any[] = await insert.json();
      return void res.status(201).json(row);
    }

    // ── PATCH: edit title/summary/type, OR retire/restore via ?action= ──
    if (req.method === "PATCH") {
      const id = req.query.id as string | undefined;
      if (!id) return void res.status(400).json({ error: "id required" });

      if (action === "retire" || action === "restore") {
        const patch: Record<string, unknown> =
          action === "retire"
            ? { status: "retired", retired_at: new Date().toISOString() }
            : { status: "active", retired_at: null };
        const upd = await fetch(
          `${SB_URL}/rest/v1/important_memories?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
          {
            method: "PATCH",
            headers: hdrs({ Prefer: "return=representation" }),
            body: JSON.stringify(patch),
          },
        );
        if (upd.status === 409 && action === "restore") {
          return void res
            .status(409)
            .json({ error: "Cannot restore — another active memory uses this key" });
        }
        if (!upd.ok) return void res.status(502).json({ error: "Failed to update memory" });
        const rows: any[] = await upd.json();
        if (!rows.length) return void res.status(403).json({ error: "Forbidden" });
        return void res.status(200).json(rows[0]);
      }

      const body = (req.body ?? {}) as {
        title?: unknown;
        summary?: unknown;
        memory_type?: unknown;
        memory_key?: unknown;
      };
      const patch: Record<string, unknown> = {};
      if (typeof body.title === "string" && body.title.trim())
        patch.title = body.title.trim().slice(0, 200);
      if (typeof body.summary === "string" && body.summary.trim())
        patch.summary = body.summary.trim().slice(0, 1000);
      if (typeof body.memory_type === "string") {
        if (!IMPORTANT_MEMORY_TYPES.has(body.memory_type))
          return void res.status(400).json({ error: "Invalid memory_type" });
        patch.memory_type = body.memory_type;
      }
      if (typeof body.memory_key === "string" && body.memory_key.trim()) {
        const trimmed = body.memory_key.trim();
        if (!MEMORY_KEY_RE.test(trimmed))
          return void res
            .status(400)
            .json({ error: "memory_key must match <type>:<slug> with [a-z0-9_]" });
        patch.memory_key = trimmed;
      }

      if (!Object.keys(patch).length)
        return void res.status(400).json({ error: "Nothing to update" });

      const upd = await fetch(
        `${SB_URL}/rest/v1/important_memories?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
        {
          method: "PATCH",
          headers: hdrs({ Prefer: "return=representation" }),
          body: JSON.stringify(patch),
        },
      );
      if (upd.status === 409)
        return void res
          .status(409)
          .json({ error: "Memory key conflicts with an existing active memory" });
      if (!upd.ok) return void res.status(502).json({ error: "Failed to update memory" });
      const rows: any[] = await upd.json();
      if (!rows.length) return void res.status(403).json({ error: "Forbidden" });
      return void res.status(200).json(rows[0]);
    }

    // ── DELETE: hard delete (retire is the soft path; this is rare/admin) ──
    if (req.method === "DELETE") {
      const id = req.query.id as string | undefined;
      if (!id) return void res.status(400).json({ error: "id required" });
      const del = await fetch(
        `${SB_URL}/rest/v1/important_memories?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
        { method: "DELETE", headers: hdrs({ Prefer: "return=minimal" }) },
      );
      if (!del.ok) return void res.status(502).json({ error: "Failed to delete memory" });
      return void res.status(200).json({ ok: true });
    }

    return void res.status(405).json({ error: "Method not allowed" });
  },
);

// ── /api/memory (rewritten to /api/user-data?resource=memory) ──
const handleMemory = withAuth(
  { methods: ["GET", "POST", "PATCH"], rateLimit: 30 },
  async ({ req, res, user }) => {
    if (req.method === "GET") {
      const r = await fetch(
        `${SB_URL}/rest/v1/user_memory?user_id=eq.${encodeURIComponent(user.id)}`,
        { headers: hdrs() },
      );
      const data: any[] = await r.json();
      return void res.status(200).json(data[0] || { content: "", updated_at: null });
    }

    const { content } = bodyObject(req.body);
    if (typeof content !== "string")
      return void res.status(400).json({ error: "content must be a string" });
    const trimmed = content.slice(0, MAX_CHARS);
    const r = await fetch(`${SB_URL}/rest/v1/user_memory`, {
      method: "POST",
      headers: hdrs({ Prefer: "return=representation,resolution=merge-duplicates" }),
      body: JSON.stringify({
        user_id: user.id,
        content: trimmed,
        updated_at: new Date().toISOString(),
      }),
    });
    const data: any[] = await r.json();
    return void res
      .status(r.ok ? 200 : 502)
      .json(r.ok ? data[0] || {} : { error: "Failed to save memory" });
  },
);

// ── /api/activity (rewritten to /api/user-data?resource=activity) ──
const handleActivity = withAuth(
  { methods: ["GET", "POST"], rateLimit: 60 },
  async ({ req, res, user }) => {
    // GET /api/activity?brain_id=... — fetch activity log (owner only)
    if (req.method === "GET") {
      const { brain_id, limit = "50" } = req.query;
      if (!brain_id) return void res.status(400).json({ error: "brain_id required" });

      // Verify caller owns this brain
      const ownerRes = await fetch(
        `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id as string)}&owner_id=eq.${encodeURIComponent(user.id)}`,
        { headers: hdrs() },
      );
      const ownerData: any[] = await ownerRes.json();
      if (!ownerData.length)
        return void res.status(403).json({ error: "Only the brain owner can view activity" });

      const r = await fetch(
        `${SB_URL}/rest/v1/brain_activity?brain_id=eq.${encodeURIComponent(brain_id as string)}&order=created_at.desc&limit=${Math.min(parseInt(limit as string) || 50, 500)}`,
        { headers: hdrs() },
      );
      return void res.status(r.status).json(await r.json());
    }

    // POST /api/activity — log an activity event
    const { brain_id, action, entry_id, details } = bodyObject(req.body);
    if (typeof brain_id !== "string" || typeof action !== "string")
      return void res.status(400).json({ error: "brain_id and action required" });

    const validActions = ["created", "updated", "deleted", "connected"];
    if (!validActions.includes(action))
      return void res.status(400).json({ error: "Invalid action" });

    // Verify caller owns this brain before writing activity
    const ownerRes = await fetch(
      `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}`,
      { headers: hdrs() },
    );
    const ownerData: any[] = await ownerRes.json();
    if (!ownerData.length) return void res.status(403).json({ error: "Forbidden" });

    const r = await fetch(`${SB_URL}/rest/v1/brain_activity`, {
      method: "POST",
      headers: hdrs({ Prefer: "return=minimal" }),
      body: JSON.stringify({
        brain_id,
        user_id: user.id,
        action,
      entry_id: typeof entry_id === "string" ? entry_id : null,
        details: details && typeof details === "object" ? details : null,
      }),
    });
    return void res.status(r.ok ? 201 : 502).json({ ok: r.ok });
  },
);

// ── /api/status (rewritten to /api/user-data?resource=status) — public ──
//
// Public, unauthenticated status check for the user-facing /status page.
// Returns only coarse availability; component-level details stay behind
// /api/health so attackers cannot inventory provider readiness anonymously.
// Does NOT do a real Gemini inference call (would burn quota and could be
// abused). For deep diagnostics use /api/health (auth-gated).
//
// Cache-Control: 15s edge cache + 60s stale-while-revalidate so a flood of
// users hitting /status during an incident doesn't spawn 1000 cold-start
// pings of the DB.
async function handlePublicStatus(_req: ApiRequest, res: ApiResponse): Promise<void> {
  let db = false;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/entries?select=id&limit=1`, {
      headers: hdrs(),
    });
    db = r.ok;
  } catch {
    db = false;
  }
  const ai = !!(process.env.GEMINI_API_KEY || "").trim();
  const ok = db && ai;
  res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
  res.status(200).json({ ok, ts: new Date().toISOString() });
}

// ── /api/health (rewritten to /api/user-data?resource=health) ──
const handleHealth = withAuth(
  { methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], rateLimit: false },
  async ({ res }) => {
    const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
    const GROQ_API_KEY = (process.env.GROQ_API_KEY || "").trim();

    // Test DB
    let db = false;
    try {
      const r = await fetch(`${SB_URL}/rest/v1/entries?select=id&limit=1`, {
        headers: hdrs(),
      });
      db = r.ok;
    } catch {
      db = false;
    }

    // Test Gemini — list available models and do a real inference test
    let gemini = false;
    let geminiModel = "";
    let geminiError = "";
    if (GEMINI_API_KEY) {
      try {
        // Step 1: find available gemma/gemini models
        const listR = await googleAiFetch(
          GEMINI_API_KEY,
          googleAiModelsUrl({ pageSize: 200 }),
          {},
        );
        if (listR.ok) {
          const listData: any = await listR.json();
          const names: string[] = (listData.models || []).map((m: any) =>
            (m.name as string).replace("models/", ""),
          );
          const gemma4 = names.find((n) => n.includes("gemma-4") && n.includes("it"));
          const gemma3 = names.find((n) => n.includes("gemma-3") && n.includes("27b"));
          const configured = names.find((n) => n === GEMINI_BULK_MODEL);
          const fallback = names.find((n) => n === GEMINI_FALLBACK_MODEL);
          const flash = names.find((n) => n.includes("gemini-2.5-flash"));
          const candidate = configured || fallback || gemma4 || gemma3 || flash || names[0];
          geminiModel = candidate || "";

          // Step 2: real inference test with the found model
          if (candidate) {
            const testR = await googleAiFetch(
              GEMINI_API_KEY,
              googleAiModelUrl(candidate, "generateContent"),
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ role: "user", parts: [{ text: "hi" }] }],
                  generationConfig: { maxOutputTokens: 5 },
                }),
              },
            );
            gemini = testR.ok;
            if (!testR.ok) {
              const errData: any = await testR.json().catch(() => ({}));
              geminiError = errData?.error?.message || `HTTP ${testR.status}`;
            }
          }
        } else {
          geminiError = `Key error: HTTP ${listR.status}`;
        }
      } catch (e: any) {
        geminiError = e.message;
      }
    }

    // Test Groq — list models (lightweight key validation)
    let groq = false;
    if (GROQ_API_KEY) {
      try {
        const r = await fetch("https://api.groq.com/openai/v1/models", {
          headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        });
        groq = r.ok;
      } catch {
        groq = false;
      }
    }

    // Test Upstash — required for distributed rate limiting + Stripe webhook
    // idempotency. If it's unreachable we silently fall back to in-memory
    // limits (zero protection in serverless), so an external monitor needs
    // to know.
    const UPSTASH_URL = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
    const UPSTASH_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
    let upstash = false;
    if (UPSTASH_URL && UPSTASH_TOKEN) {
      try {
        const r = await fetch(`${UPSTASH_URL}/ping`, {
          headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
        });
        upstash = r.ok;
      } catch {
        upstash = false;
      }
    }

    // Critical deps: db must be up, and at least one configured AI provider
    // must respond. Upstash is "required if configured" — if the env vars
    // are present but the service is down, that's a real degradation.
    // Optional deps that aren't configured (e.g. Groq when GROQ_API_KEY is
    // empty) don't count as failures.
    const failures: string[] = [];
    if (!db) failures.push("db");
    if (GEMINI_API_KEY && !gemini) failures.push("gemini");
    if (GROQ_API_KEY && !groq) failures.push("groq");
    if (UPSTASH_URL && UPSTASH_TOKEN && !upstash) failures.push("upstash");
    // No AI provider at all is a configuration error, not a runtime failure.
    if (!GEMINI_API_KEY && !GROQ_API_KEY) failures.push("no_ai_provider_configured");

    const status = failures.length === 0 ? 200 : 503;
    res.status(status).json({
      ok: failures.length === 0,
      failures,
      db,
      gemini,
      geminiModel,
      geminiError,
      groq,
      upstash,
    });
  },
);

// ── Sentry issues read-API proxy (admin debug dashboard) ──
// Sentry's API token can't live in the browser, so the dashboard tile
// hits this proxy instead. Requires three env vars in Vercel:
//   SENTRY_AUTH_TOKEN — Settings → Account → API → Auth Tokens (scope: project:read)
//   SENTRY_ORG        — slug of the org (e.g. "everion")
//   SENTRY_PROJECT    — slug of the project (e.g. "everion-web")
// Returns { configured, issues: [{ id, title, count, userCount, lastSeen, permalink }] }.
// `configured: false` lets the tile render an instructive empty state
// rather than a 500 — same pattern handleHealth uses for Gemini/Groq.
const handleSentryIssues = withAuth(
  { methods: ["GET"], rateLimit: 20 },
  async ({ res }) => {
    const token = (process.env.SENTRY_AUTH_TOKEN || "").trim();
    const org = (process.env.SENTRY_ORG || "").trim();
    const project = (process.env.SENTRY_PROJECT || "").trim();

    if (!token || !org || !project) {
      res.status(200).json({
        configured: false,
        issues: [],
        missing: [
          !token && "SENTRY_AUTH_TOKEN",
          !org && "SENTRY_ORG",
          !project && "SENTRY_PROJECT",
        ].filter(Boolean),
      });
      return;
    }

    // 4s timeout — the dashboard does Promise.all on this + 3 other tiles,
    // so a slow Sentry response (or sentry.io rate-limit hold) drags the
    // whole panel. Returning a typed empty error tile is better than
    // making admin "feel broken."
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4_000);
    try {
      const url = `https://sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?query=is%3Aunresolved&statsPeriod=24h&sort=freq&limit=5`;
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => "");
        res.status(200).json({
          configured: true,
          issues: [],
          error: `Sentry HTTP ${r.status}: ${detail.slice(0, 200)}`,
        });
        return;
      }
      const arr = (await r.json()) as Array<{
        id: string;
        title: string;
        count: string;
        userCount: number;
        lastSeen: string;
        permalink: string;
      }>;
      res.status(200).json({
        configured: true,
        issues: arr.map((i) => ({
          id: i.id,
          title: i.title,
          count: i.count,
          userCount: i.userCount,
          lastSeen: i.lastSeen,
          permalink: i.permalink,
        })),
      });
    } catch (err) {
      res.status(200).json({
        configured: true,
        issues: [],
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      clearTimeout(timer);
    }
  },
);

// ── /api/vault (rewritten to /api/user-data?resource=vault) ──
const handleVault = withAuth(
  { methods: ["GET", "POST", "PATCH"], rateLimit: 20 },
  async ({ req, res, user }) => {
    const action = req.query.action as string | undefined;

    // ?action=public-key&user_id=X — fetch another user's public key so
    // the caller can wrap a brain DEK for them. Uses the SECURITY DEFINER
    // helper so we don't expose any other vault_keys columns.
    if (req.method === "GET" && action === "public-key") {
      const targetId = req.query.user_id as string | undefined;
      if (!targetId || typeof targetId !== "string") {
        return void res.status(400).json({ error: "user_id required" });
      }
      const r = await fetch(`${SB_URL}/rest/v1/rpc/get_user_public_key`, {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({ target_user_id: targetId }),
      });
      if (!r.ok) return void res.status(502).json({ error: "Database error" });
      const result = await r.json();
      const publicKey = typeof result === "string" ? result : (result?.public_key ?? null);
      return void res.status(200).json({ public_key: publicKey });
    }

    if (req.method === "GET") {
      // Try the phase-2 select first (with public_key + wrapped_private_key).
      // If those columns don't exist yet (migration 072 hasn't landed),
      // PostgREST replies 400 — fall back to the legacy select so unlock
      // keeps working through the upgrade window.
      let r = await fetch(
        `${SB_URL}/rest/v1/vault_keys?user_id=eq.${encodeURIComponent(user.id)}&select=salt,verify_token,recovery_blob,public_key,wrapped_private_key`,
        { headers: hdrs() },
      );
      let phase2 = true;
      if (!r.ok) {
        phase2 = false;
        r = await fetch(
          `${SB_URL}/rest/v1/vault_keys?user_id=eq.${encodeURIComponent(user.id)}&select=salt,verify_token,recovery_blob`,
          { headers: hdrs() },
        );
      }
      if (!r.ok) return void res.status(502).json({ error: "Database error" });
      const rows: any[] = await r.json();
      if (rows.length === 0) return void res.status(200).json({ exists: false });
      return void res.status(200).json({
        exists: true,
        salt: rows[0].salt,
        verify_token: rows[0].verify_token,
        recovery_blob: rows[0].recovery_blob,
        public_key: phase2 ? (rows[0].public_key ?? null) : null,
        wrapped_private_key: phase2 ? (rows[0].wrapped_private_key ?? null) : null,
      });
    }

    // PATCH — backfill the asymmetric keypair on existing rows. Used
    // when a pre-phase-2 user unlocks for the first time after upgrade:
    // the client generates a keypair, wraps the private with the master
    // KEK, and PATCHes the row in place.
    if (req.method === "PATCH") {
      const { public_key, wrapped_private_key } = bodyObject(req.body);
      if (typeof public_key !== "string" || typeof wrapped_private_key !== "string") {
        return void res.status(400).json({ error: "public_key and wrapped_private_key required" });
      }
      const r = await fetch(
        `${SB_URL}/rest/v1/vault_keys?user_id=eq.${encodeURIComponent(user.id)}&public_key=is.null`,
        {
          method: "PATCH",
          headers: hdrs({ Prefer: "return=minimal" }),
          body: JSON.stringify({ public_key, wrapped_private_key }),
        },
      );
      if (!r.ok) {
        const err = await r.text().catch(() => String(r.status));
        return void res.status(502).json({ error: `Database error: ${err}` });
      }
      return void res.status(200).json({ ok: true });
    }

    // POST — vault setup
    const { salt, verify_token, recovery_blob, public_key, wrapped_private_key } = bodyObject(req.body);
    if (!salt || typeof salt !== "string" || salt.length !== 32) {
      return void res.status(400).json({ error: "Invalid salt (must be 32-char hex)" });
    }
    if (!verify_token || typeof verify_token !== "string") {
      return void res.status(400).json({ error: "Missing verify_token" });
    }
    if (!recovery_blob || typeof recovery_blob !== "string") {
      return void res.status(400).json({ error: "Missing recovery_blob" });
    }
    // public_key + wrapped_private_key are optional in the body so older
    // clients (that haven't shipped the phase 2 update) don't break. The
    // backfill PATCH route covers them on next unlock.
    const pubKey =
      typeof public_key === "string" && public_key.length > 0 ? public_key : null;
    const wrappedPriv =
      typeof wrapped_private_key === "string" && wrapped_private_key.length > 0
        ? wrapped_private_key
        : null;

    // Optional Idempotency-Key. Vault setup is a one-shot action; without
    // this, a network retry between the existence-check and the INSERT can
    // race past the PK guard if the first request hadn't committed yet.
    let idemSlot: string | null = null;
    try {
      const idem = normalizeIdempotencyKey(req.headers["idempotency-key"]);
      if (idem) {
        idemSlot = `vault-setup:${idem}`;
        const claim = await reserveActionIdempotency(user.id, idemSlot);
        if (claim.kind === "replay") {
          return void res.status(200).json({ ok: true, idempotent_replay: true });
        }
      }
    } catch (e) {
      if (e instanceof IdempotencyError) return void res.status(e.status).json({ error: e.publicMessage });
      throw e;
    }

    // Prevent overwrite — vault can only be set up once
    const existing = await fetch(
      `${SB_URL}/rest/v1/vault_keys?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`,
      { headers: hdrs() },
    );
    const rows: any[] = await existing.json();
    if (rows.length > 0) {
      if (idemSlot) await releaseIdempotency(user.id, idemSlot);
      return void res.status(409).json({ error: "Vault already set up" });
    }

    const insertPayload: Record<string, unknown> = {
      user_id: user.id,
      salt,
      verify_token,
      recovery_blob,
    };
    if (pubKey) insertPayload.public_key = pubKey;
    if (wrappedPriv) insertPayload.wrapped_private_key = wrappedPriv;

    let r = await fetch(`${SB_URL}/rest/v1/vault_keys`, {
      method: "POST",
      headers: hdrs({ Prefer: "return=minimal" }),
      body: JSON.stringify(insertPayload),
    });
    // Fall back to legacy 3-column INSERT if migration 072 hasn't landed.
    // The phase-2 fields backfill on the next unlock via the PATCH route.
    if (!r.ok && (pubKey || wrappedPriv)) {
      r = await fetch(`${SB_URL}/rest/v1/vault_keys`, {
        method: "POST",
        headers: hdrs({ Prefer: "return=minimal" }),
        body: JSON.stringify({
          user_id: user.id,
          salt,
          verify_token,
          recovery_blob,
        }),
      });
    }
    if (!r.ok) {
      if (idemSlot) await releaseIdempotency(user.id, idemSlot);
      const err = await r.text().catch(() => String(r.status));
      return void res.status(502).json({ error: `Database error: ${err}` });
    }
    return void res.status(201).json({ ok: true });
  },
);

// ── /api/vault-entries (rewritten to /api/user-data?resource=vault_entries) ──
// CRUD for the encrypted vault_entries table. Server stores ciphertext only
// (AES-256-GCM happens client-side); we never see plaintext content/metadata.
const handleVaultEntries = withAuth(
  { methods: ["GET", "POST", "DELETE"], rateLimit: 60 },
  async ({ req, res, user }) => {
    if (req.method === "GET") {
      // Per-brain vaults: each brain has its own Vault. Caller MUST pass
      // ?brain_id=X — no "all my secrets" fallback. Without the filter the
      // endpoint would return every secret across every brain the user owns,
      // and the memory grid (which merges entries + vault rows) would render
      // them all regardless of active brain. Migration 079 also enforces
      // this at the RLS layer, but the API gate gives a friendlier 400 and
      // avoids round-tripping a query that RLS will short-circuit anyway.
      const brainId = req.query.brain_id as string | undefined;
      if (typeof brainId !== "string" || !brainId.trim()) {
        return void res.status(400).json({ error: "brain_id query param required" });
      }
      const access = await checkBrainAccess(user.id, brainId);
      if (!access) return void res.status(403).json({ error: "Forbidden" });
      const r = await fetch(
        `${SB_URL}/rest/v1/vault_entries?user_id=eq.${encodeURIComponent(user.id)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&select=id,title,content,metadata,tags,brain_id,created_at,updated_at&order=created_at.desc`,
        { headers: hdrs() },
      );
      if (!r.ok) return void res.status(502).json({ error: "Database error" });
      return void res.status(200).json(await r.json());
    }

    if (req.method === "POST") {
      const { title, content, metadata, tags, brain_id } = (req.body || {}) as {
        title?: unknown;
        content?: unknown;
        metadata?: unknown;
        tags?: unknown;
        brain_id?: unknown;
      };
      if (!title || typeof title !== "string" || !title.trim()) {
        return void res.status(400).json({ error: "title required" });
      }
      if (typeof content !== "string") {
        return void res.status(400).json({ error: "content must be a string (ciphertext)" });
      }
      // brain_id is mandatory — see GET comment + migration 079. NULL-brain
      // rows are an isolation hole we no longer accept at any layer.
      if (typeof brain_id !== "string" || !brain_id.trim()) {
        return void res.status(400).json({ error: "brain_id required" });
      }
      const access = await checkBrainAccess(user.id, brain_id);
      if (!access) return void res.status(403).json({ error: "Forbidden" });
      const tagArr = Array.isArray(tags) ? tags.filter((t) => typeof t === "string") : [];
      const payload: Record<string, unknown> = {
        user_id: user.id,
        title: title.trim().slice(0, 500),
        content,
        metadata: typeof metadata === "string" ? metadata : "",
        tags: tagArr,
        brain_id,
      };

      const r = await fetch(`${SB_URL}/rest/v1/vault_entries`, {
        method: "POST",
        headers: hdrs({ Prefer: "return=representation" }),
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const err = await r.text().catch(() => String(r.status));
        return void res.status(502).json({ error: `Database error: ${err}` });
      }
      const rows: any[] = await r.json();
      return void res.status(201).json(rows[0] ?? { ok: true });
    }

    // DELETE — soft delete; RLS scopes to owning user
    const id = req.query.id as string;
    if (!id) return void res.status(400).json({ error: "id required" });

    const r = await fetch(
      `${SB_URL}/rest/v1/vault_entries?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: "PATCH",
        headers: hdrs({ Prefer: "return=minimal" }),
        body: JSON.stringify({ deleted_at: new Date().toISOString() }),
      },
    );
    if (!r.ok) return void res.status(502).json({ error: "Database error" });
    return void res.status(200).json({ ok: true });
  },
);

// ── /api/brain-vault-grants (rewritten to /api/user-data?resource=brain_vault_grants) ──
//
// Per-brain DEK envelope grants (phase 2 of per-brain vaults). Each row
// is "user X holds the wrapped DEK for brain Y" — wrapped_dek is the
// brain's symmetric data-encryption-key encrypted with X's public key.
//
// GET — list the caller's own grants (so they can unwrap DEKs on unlock)
// POST — owner grants access to a member (or themselves) by inserting
//        a row with the wrapped DEK
// DELETE — owner revokes a grant (deletes a single brain_id+user_id row)
const handleBrainVaultGrants = withAuth(
  { methods: ["GET", "POST", "DELETE"], rateLimit: 60 },
  async ({ req, res, user }) => {
    if (req.method === "GET") {
      // Default: caller's own grants. Optional ?brain_id=X scopes to one
      // brain (used by the owner's grant-management UI).
      const brainId = req.query.brain_id as string | undefined;
      let userScope = `user_id=eq.${encodeURIComponent(user.id)}`;
      if (typeof brainId === "string" && brainId) {
        const access = await checkBrainAccess(user.id, brainId);
        if (!access) return void res.status(403).json({ error: "Forbidden" });
        userScope =
          access.role === "owner"
            ? `brain_id=eq.${encodeURIComponent(brainId)}`
            : `brain_id=eq.${encodeURIComponent(brainId)}&user_id=eq.${encodeURIComponent(user.id)}`;
      }
      const r = await fetch(
        `${SB_URL}/rest/v1/brain_vault_grants?${userScope}&select=brain_id,user_id,wrapped_dek,granted_at`,
        { headers: hdrs() },
      );
      if (!r.ok) return void res.status(502).json({ error: "Database error" });
      return void res.status(200).json(await r.json());
    }

    if (req.method === "POST") {
      const { brain_id, user_id, wrapped_dek } = bodyObject(req.body);
      if (typeof brain_id !== "string" || !brain_id) {
        return void res.status(400).json({ error: "brain_id required" });
      }
      if (typeof user_id !== "string" || !user_id) {
        return void res.status(400).json({ error: "user_id required" });
      }
      if (typeof wrapped_dek !== "string" || !wrapped_dek) {
        return void res.status(400).json({ error: "wrapped_dek required" });
      }
      // Brain ownership is enforced by the RLS insert policy; we still
      // verify here so we can return a clean 403 instead of a 4xx from
      // PostgREST.
      const ownerCheck = await fetch(
        `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brain_id)}&owner_id=eq.${encodeURIComponent(user.id)}&select=id`,
        { headers: hdrs() },
      );
      const ownerRows: any[] = ownerCheck.ok ? await ownerCheck.json() : [];
      if (ownerRows.length === 0) {
        return void res.status(403).json({ error: "Only the brain owner can grant vault access" });
      }
      const r = await fetch(`${SB_URL}/rest/v1/brain_vault_grants`, {
        method: "POST",
        headers: hdrs({ Prefer: "return=minimal,resolution=merge-duplicates" }),
        body: JSON.stringify({
          brain_id,
          user_id,
          wrapped_dek,
          granted_by: user.id,
        }),
      });
      if (!r.ok && r.status !== 409) {
        const err = await r.text().catch(() => String(r.status));
        return void res.status(502).json({ error: `Database error: ${err}` });
      }
      return void res.status(200).json({ ok: true });
    }

    // DELETE — owner revoke. Caller must specify both brain_id and user_id.
    const brainId = req.query.brain_id as string | undefined;
    const targetUserId = req.query.user_id as string | undefined;
    if (!brainId || !targetUserId) {
      return void res.status(400).json({ error: "brain_id and user_id required" });
    }
    const ownerCheck = await fetch(
      `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brainId)}&owner_id=eq.${encodeURIComponent(user.id)}&select=id`,
      { headers: hdrs() },
    );
    const ownerRows: any[] = ownerCheck.ok ? await ownerCheck.json() : [];
    if (ownerRows.length === 0) {
      return void res.status(403).json({ error: "Only the brain owner can revoke vault access" });
    }
    const r = await fetch(
      `${SB_URL}/rest/v1/brain_vault_grants?brain_id=eq.${encodeURIComponent(brainId)}&user_id=eq.${encodeURIComponent(targetUserId)}`,
      { method: "DELETE", headers: hdrs({ Prefer: "return=minimal" }) },
    );
    if (!r.ok) return void res.status(502).json({ error: "Database error" });
    return void res.status(200).json({ ok: true });
  },
);

// ── /api/pin (rewritten to /api/user-data?resource=pin) ──
const handlePin = withAuth(
  { methods: ["POST", "DELETE"], rateLimit: 10 },
  async ({ req, res, user }) => {
    const action = req.query.action as string;

    if (req.method === "POST" && action === "setup") {
      const { hash, salt } = bodyObject(req.body);
      if (!hash || typeof hash !== "string" || !/^[0-9a-f]{64}$/i.test(hash))
        return void res.status(400).json({ error: "Invalid hash" });
      if (!salt || typeof salt !== "string" || !/^[0-9a-f]{32}$/i.test(salt))
        return void res.status(400).json({ error: "Invalid salt" });

      const r = await fetch(
        `${SB_URL}/rest/v1/user_ai_settings?user_id=eq.${encodeURIComponent(user.id)}`,
        {
          method: "PATCH",
          headers: hdrs({ Prefer: "return=minimal" }),
          body: JSON.stringify({ pin_hash: hash, pin_hash_salt: salt }),
        },
      );
      if (!r.ok) {
        await fetch(`${SB_URL}/rest/v1/user_ai_settings`, {
          method: "POST",
          headers: hdrs({ Prefer: "resolution=merge-duplicates,return=minimal" }),
          body: JSON.stringify({ user_id: user.id, pin_hash: hash, pin_hash_salt: salt }),
        });
      }
      return void res.status(200).json({ ok: true });
    }

    if (req.method === "POST" && action === "verify") {
      const { hash } = bodyObject(req.body);
      if (!hash || typeof hash !== "string")
        return void res.status(400).json({ error: "hash required" });

      const r = await fetch(
        `${SB_URL}/rest/v1/user_ai_settings?user_id=eq.${encodeURIComponent(user.id)}&select=pin_hash`,
        { headers: hdrs() },
      );
      const rows: any[] = r.ok ? await r.json() : [];
      const storedHash = rows[0]?.pin_hash;
      if (!storedHash) return void res.status(200).json({ valid: false, noPinSet: true });

      try {
        const valid = crypto.timingSafeEqual(
          Buffer.from(hash.toLowerCase(), "hex"),
          Buffer.from(storedHash.toLowerCase(), "hex"),
        );
        return void res.status(200).json({ valid });
      } catch {
        return void res.status(200).json({ valid: false });
      }
    }

    if (req.method === "DELETE" && action === "delete") {
      await fetch(`${SB_URL}/rest/v1/user_ai_settings?user_id=eq.${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: hdrs({ Prefer: "return=minimal" }),
        body: JSON.stringify({ pin_hash: null, pin_hash_salt: null }),
      });
      return void res.status(200).json({ ok: true });
    }

    return void res.status(405).json({ error: "Method not allowed" });
  },
);

// ── /api/user-data?resource=full_export — full account data dump (GDPR right of access) ──
// Returns one JSON of every public-schema row owned by the requester. Sensitive
// integration tokens (gmail/calendar) are stripped — the user already has the
// underlying provider account, and we don't hand back OAuth refresh tokens.
const FULL_EXPORT_TABLES: Array<{ table: string; col: string; strip?: string[] }> = [
  { table: "entries", col: "user_id" },
  { table: "tags", col: "user_id" },
  { table: "links", col: "user_id" },
  { table: "collections", col: "user_id" },
  { table: "vault_entries", col: "user_id" }, // ciphertext only — server can't decrypt
  { table: "user_memory", col: "user_id" },
  { table: "user_personas", col: "user_id" },
  { table: "user_ai_settings", col: "user_id" },
  { table: "user_usage", col: "user_id" },
  { table: "notification_prefs", col: "user_id" },
  { table: "notifications", col: "user_id" },
  { table: "push_subscriptions", col: "user_id", strip: ["endpoint", "p256dh", "auth"] },
  { table: "gmail_integrations", col: "user_id", strip: ["refresh_token", "access_token"] },
  { table: "calendar_integrations", col: "user_id", strip: ["refresh_token", "access_token"] },
  { table: "messaging_connections", col: "user_id" },
  { table: "user_api_keys", col: "user_id", strip: ["key_hash"] },
];

const handleFullExport = withAuth({ methods: ["GET"], rateLimit: 5 }, async ({ res, user }) => {
  const dump: Record<string, unknown> = { exported_at: new Date().toISOString(), user_id: user.id };
  for (const { table, col, strip } of FULL_EXPORT_TABLES) {
    const r = await fetch(
      `${SB_URL}/rest/v1/${table}?${col}=eq.${encodeURIComponent(user.id)}&select=*`,
      { headers: hdrs() },
    );
    if (!r.ok) {
      console.error(`[full_export] ${table} fetch failed`, r.status);
      dump[table] = { error: `failed to fetch (${r.status})` };
      continue;
    }
    let rows: any[] = await r.json();
    if (strip?.length) {
      rows = rows.map((row) => {
        const copy = { ...row };
        for (const k of strip) delete copy[k];
        return copy;
      });
    }
    dump[table] = rows;
  }
  // Brains owned by user (uses owner_id, not user_id)
  const brainsRes = await fetch(
    `${SB_URL}/rest/v1/brains?owner_id=eq.${encodeURIComponent(user.id)}&select=*`,
    { headers: hdrs() },
  );
  dump["brains"] = brainsRes.ok ? await brainsRes.json() : [];

  // user_profiles uses id = auth.users.id
  const profileRes = await fetch(
    `${SB_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(user.id)}&select=*`,
    { headers: hdrs() },
  );
  dump["user_profiles"] = profileRes.ok ? await profileRes.json() : [];

  res.setHeader("Content-Disposition", `attachment; filename="everion-account-${user.id}.json"`);
  res.status(200).json(dump);
});

// ── /api/user-data?resource=account — delete authenticated user's account ──
const handleDeleteAccount = withAuth(
  { methods: ["DELETE"], rateLimit: 5 },
  async ({ res, user }) => {
    // Snapshot vault entries before deletion so they can be exported
    const vaultRes = await fetch(
      `${SB_URL}/rest/v1/vault_entries?user_id=eq.${encodeURIComponent(user.id)}&select=*`,
      { headers: hdrs() },
    );
    const vault_export: any[] = vaultRes.ok ? await vaultRes.json() : [];

    // Cascade delete every public-schema row owned by this user. There is
    // no FK from public.* → auth.users, so deleting the auth row alone
    // would leave orphans — Privacy Policy promises a 48h scrub.
    const cascadeRes = await fetch(`${SB_URL}/rest/v1/rpc/delete_user_data`, {
      method: "POST",
      headers: hdrs(),
      body: JSON.stringify({ p_user_id: user.id }),
    });
    if (!cascadeRes.ok) {
      const detail = await cascadeRes.text().catch(() => String(cascadeRes.status));
      console.error("[account:delete] Cascade failed:", cascadeRes.status, detail);
      return void res.status(502).json({ error: "Failed to delete account data" });
    }
    const cascadeCounts = await cascadeRes.json().catch(() => ({}));

    const r = await fetch(`${SB_URL}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: "DELETE",
      headers: hdrs(),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => String(r.status));
      console.error("[account:delete] Auth delete failed after cascade:", r.status, detail);
      return void res.status(502).json({ error: "Failed to delete account" });
    }

    console.log(`[audit] DELETE_ACCOUNT user=${user.id} cascade=${JSON.stringify(cascadeCounts)}`);
    return void res.status(200).json({ deleted: true, vault_export });
  },
);

// ── /api/user-data?resource=api_keys — Claude Code / MCP API key management ──
const handleApiKeys = withAuth(
  { methods: ["GET", "POST", "DELETE"], rateLimit: 20 },
  async ({ req, res, user }) => {
    // GET — list active keys (never returns hash or raw key)
    if (req.method === "GET") {
      const r = await fetch(
        `${SB_URL}/rest/v1/user_api_keys?user_id=eq.${encodeURIComponent(user.id)}&revoked_at=is.null&select=id,name,key_prefix,created_at,last_used_at&order=created_at.desc`,
        { headers: hdrs() },
      );
      if (!r.ok) return void res.status(502).json({ error: "Database error" });
      return void res.status(200).json(await r.json());
    }

    // POST — generate a new key
    if (req.method === "POST") {
      const { name } = bodyObject(req.body);
      if (!name || typeof name !== "string" || !name.trim()) {
        return void res.status(400).json({ error: "name required" });
      }

      // Generate raw key: em_ + 32 random bytes as hex
      const rawKey = "em_" + crypto.randomBytes(32).toString("hex");
      const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
      const keyPrefix = rawKey.slice(0, 12);

      const r = await fetch(`${SB_URL}/rest/v1/user_api_keys`, {
        method: "POST",
        headers: hdrs({ Prefer: "return=representation" }),
        body: JSON.stringify({
          user_id: user.id,
          name: name.trim().slice(0, 100),
          key_hash: keyHash,
          key_prefix: keyPrefix,
        }),
      });
      if (!r.ok) {
        const err = await r.text().catch(() => String(r.status));
        return void res.status(502).json({ error: `Database error: ${err}` });
      }
      const rows: any[] = await r.json();
      // Return raw key once — it is never stored and cannot be retrieved again
      return void res
        .status(201)
        .json({ id: rows[0].id, name: rows[0].name, key: rawKey, key_prefix: keyPrefix });
    }

    // DELETE — revoke a key by id
    const id = req.query.id as string;
    if (!id) return void res.status(400).json({ error: "id required" });

    // Optional Idempotency-Key keeps a retried revoke from re-stamping
    // revoked_at and producing duplicate audit_log entries. The action
    // response is constant {ok:true} so a "replay" can return immediately.
    let idemSlot: string | null = null;
    try {
      const idem = normalizeIdempotencyKey(req.headers["idempotency-key"]);
      if (idem) {
        idemSlot = `apikey-revoke:${id}:${idem}`;
        const claim = await reserveActionIdempotency(user.id, idemSlot);
        if (claim.kind === "replay") {
          return void res.status(200).json({ ok: true, idempotent_replay: true });
        }
      }
    } catch (e) {
      if (e instanceof IdempotencyError) return void res.status(e.status).json({ error: e.publicMessage });
      throw e;
    }

    const r = await fetch(
      `${SB_URL}/rest/v1/user_api_keys?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: "PATCH",
        headers: hdrs({ Prefer: "return=minimal" }),
        body: JSON.stringify({ revoked_at: new Date().toISOString() }),
      },
    );
    if (!r.ok) {
      if (idemSlot) await releaseIdempotency(user.id, idemSlot);
      return void res.status(502).json({ error: "Database error" });
    }
    return void res.status(200).json({ ok: true });
  },
);

// ── /api/notification-prefs (rewritten to /api/user-data?resource=prefs) ──
const handleNotificationPrefs = withAuth(
  { methods: ["GET", "POST"], rateLimit: 30 },
  async ({ req, res, user }) => {
    const adminHdrs = hdrs();

    if (req.method === "GET") {
      const r = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, { headers: adminHdrs });
      if (!r.ok) return void res.status(500).json({ error: "Failed to fetch prefs" });
      const data: any = await r.json();
      return void res.status(200).json(data.user_metadata?.notification_prefs ?? null);
    }

    // POST
    const updates = req.body as Record<string, unknown>;
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      return void res.status(400).json({ error: "Invalid JSON: expected an object" });
    }
    const getRes = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, { headers: adminHdrs });
    const current: any = getRes.ok ? await getRes.json() : {};
    const existingPrefs = current.user_metadata?.notification_prefs ?? {};
    const r = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...adminHdrs },
      body: JSON.stringify({
        user_metadata: {
          ...current.user_metadata,
          notification_prefs: { ...existingPrefs, ...updates },
        },
      }),
    });
    if (!r.ok) return void res.status(500).json({ error: "Failed to save prefs" });
    return void res.status(200).json({ ok: true });
  },
);

// ── /api/push-subscribe (rewritten to /api/user-data?resource=push) ──
const handlePushSubscribe = withAuth(
  { methods: ["POST", "DELETE"], rateLimit: 20 },
  async ({ req, res, user }) => {
    const adminHdrs = hdrs();
    const getRes = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, { headers: adminHdrs });
    const current: any = getRes.ok ? await getRes.json() : {};
    const meta = current.user_metadata ?? {};

    if (req.method === "POST") {
      const { endpoint, keys, userAgent } = req.body as {
        endpoint?: string;
        keys?: unknown;
        userAgent?: string;
      };
      if (!endpoint) return void res.status(400).json({ error: "endpoint required" });
      const r = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...adminHdrs },
        body: JSON.stringify({
          user_metadata: { ...meta, push_subscription: { endpoint, keys, userAgent } },
        }),
      });
      if (!r.ok) return void res.status(500).json({ error: "Failed to save subscription" });
      return void res.status(200).json({ ok: true });
    }

    // DELETE
    const { push_subscription: _removed, ...rest } = meta;
    const r = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...adminHdrs },
      body: JSON.stringify({ user_metadata: rest }),
    });
    if (!r.ok) return void res.status(500).json({ error: "Failed to remove subscription" });
    return void res.status(200).json({ ok: true });
  },
);

// ── /api/user-data?resource=trigger-test-push ──
// Admin-only. Dispatches the test-push GitHub Actions workflow that runs
// webpush directly from the GH runner — proves whether VAPID + the saved
// subscription work without Vercel cron being part of the loop. Doesn't
// add a new serverless function (Hobby plan: 12 cap), just another
// resource handler.
const handleTriggerTestPush = withAuth(
  { methods: ["POST"], rateLimit: 10 },
  async ({ req, res, user }) => {
    const adminEmail = (process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL || "").trim();
    if (!adminEmail || !user.email || user.email !== adminEmail) {
      return void res.status(403).json({ error: "Forbidden" });
    }

    const ghToken = (process.env.GH_DISPATCH_TOKEN || "").trim();
    if (!ghToken) {
      return void res.status(500).json({
        error:
          "GH_DISPATCH_TOKEN not configured. Add a fine-grained GitHub PAT with actions:write on this repo to Vercel env.",
      });
    }
    const owner = (process.env.GH_OWNER || "MrShifu01").trim();
    const repo = (process.env.GH_REPO || "EverionMind").trim();

    const body = (req.body ?? {}) as Record<string, unknown>;
    const inputs: Record<string, string> = {};
    if (typeof body.title === "string" && body.title.trim()) inputs.title = body.title.slice(0, 80);
    if (typeof body.body === "string" && body.body.trim()) inputs.body = body.body.slice(0, 200);
    if (typeof body.target_email === "string" && body.target_email.trim()) {
      inputs.target_email = body.target_email.slice(0, 200);
    }

    const dispatchUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/test-push.yml/dispatches`;
    const r = await fetch(dispatchUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs }),
    });

    // GitHub returns 204 No Content on success.
    if (r.status === 204) {
      return void res.status(200).json({
        ok: true,
        run_url: `https://github.com/${owner}/${repo}/actions/workflows/test-push.yml`,
      });
    }
    const errText = await r.text().catch(() => "");
    return void res.status(502).json({
      error: `GitHub dispatch HTTP ${r.status}: ${errText.slice(0, 200)}`,
    });
  },
);

// ── tz / time helpers (shared by hourly + daily crons) ──
//
// Internationally-correct: every comparison is done in the user's IANA
// timezone via Intl. DST is handled by the runtime — no manual offset math.
// Resolution is hourly because the cron itself runs hourly; users picking
// 20:30 will fire at the top of the 20:00 hour in their local tz.

function localHour(tz: string, d: Date = new Date()): number {
  // Use formatToParts — more reliable than parsing a formatted string.
  // Some Node Intl locales (notably en-GB) include locale-specific glyphs
  // or render hour 0 as "24" when the formatter is asked for hour-only.
  // Pulling the explicit "hour" part avoids every one of those traps.
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: tz || "UTC",
    }).formatToParts(d);
    const part = parts.find((p) => p.type === "hour");
    const n = part ? parseInt(part.value, 10) : NaN;
    if (Number.isFinite(n)) return n === 24 ? 0 : n;
    return d.getUTCHours();
  } catch {
    return d.getUTCHours();
  }
}

function localWeekday(tz: string, d: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: tz || "UTC",
    })
      .format(d)
      .toLowerCase();
  } catch {
    return "";
  }
}

function envFlagEnabled(name: string): boolean {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

// Mirror a cron-driven push into the in-app notifications table so the
// header bell lights up alongside the device push. Best-effort — a
// failed insert is logged but does not affect the cron's primary work.
// Called from handleCronDaily (admin summary) and handleCronHourly
// (daily prompt + weekly nudge).
async function insertCronNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/notifications`, {
      method: "POST",
      headers: {
        ...hdrs(),
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ user_id: userId, type, title, body, data }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error(`[notif:${type}] insert HTTP ${r.status}: ${t.slice(0, 200)}`);
    }
  } catch (err: any) {
    console.error(`[notif:${type}] insert error:`, err?.message ?? err);
  }
}

// Enumerate every signed-up user. Avoids the broken paginated listUsers
// admin endpoint by pulling distinct user_ids from public.entries, then
// single-fetching each via /admin/users/{id}.
async function enumerateUsers(tag: string): Promise<any[]> {
  const adminHdrs = hdrs();
  const userIds = new Set<string>();
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const r = await fetch(
      `${SB_URL}/rest/v1/entries?select=user_id&order=user_id.asc&limit=${PAGE}&offset=${from}`,
      { headers: adminHdrs },
    );
    if (!r.ok) {
      console.error(`[${tag}] entries enum HTTP ${r.status}`);
      break;
    }
    const rows: Array<{ user_id: string }> = await r.json().catch(() => []);
    for (const row of rows) if (row.user_id) userIds.add(row.user_id);
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  const users: any[] = [];
  for (const id of userIds) {
    const r = await fetch(`${SB_URL}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      headers: adminHdrs,
    });
    if (!r.ok) {
      console.error(`[${tag}] admin get ${id} HTTP ${r.status}`);
      continue;
    }
    users.push(await r.json());
  }
  console.log(`[${tag}] enumerated ${users.length} users`);
  return users;
}

async function patchUserPrefs(
  userId: string,
  meta: any,
  patch: Record<string, any>,
): Promise<void> {
  const adminHdrs = hdrs();
  const prefs = meta.notification_prefs ?? {};
  await fetch(`${SB_URL}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...adminHdrs },
    body: JSON.stringify({
      user_metadata: { ...meta, notification_prefs: { ...prefs, ...patch } },
    }),
  });
}

// ── /api/cron/hourly (rewritten to /api/user-data?resource=cron-hourly) ──
//
// Fires every hour from .github/workflows/cron-hourly.yml. For each user
// with notifications enabled, checks whether *now* matches their chosen
// local time (daily prompt) or their chosen local day+time (weekly nudge),
// using their stored IANA timezone. Per-user dedup via {daily,nudge}_last_sent_at
// stops double-fires across DST boundaries or retries.
async function handleCronHourly(req: ApiRequest, res: ApiResponse): Promise<void> {
  const auth = (req.headers as any).authorization as string | undefined;
  if (!process.env.CRON_SECRET || !verifyCronBearer(auth, process.env.CRON_SECRET)) {
    return void res.status(401).json({ error: "Unauthorized" });
  }

  const subject = process.env.VAPID_SUBJECT;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !pub || !priv) {
    console.warn("[cron/hourly] VAPID env vars not set — skipping push notifications");
    return void res.status(200).json({ daily: { sent: 0 }, nudge: { sent: 0 } });
  }
  webpush.setVapidDetails(subject, pub, priv);

  const adminHdrs = hdrs();
  const users = await enumerateUsers("cron/hourly");
  const now = new Date();
  const dailyR = { sent: 0, skipped: 0, errors: 0 };
  const nudgeR = { sent: 0, skipped: 0, errors: 0 };
  const expiryR = { sent: 0, deduped: 0, skipped: 0, errors: 0 };
  // Shared-brain expiry fan-out — ungated 2026-05-05. Every owner of a brain
  // with members + an entry that has a due/deadline/expiry/event date gets
  // the configured lead-time reminder fanned out per brain_notification_prefs.
  // Per EML/Specs/shared-brain-notifications.md.
  const expiryFanOutOn = true;
  console.log(
    `[cron/hourly] now=${now.toISOString()} utc_hour=${now.getUTCHours()} users=${users.length} expiry_fanout=${expiryFanOutOn}`,
  );

  for (const user of users) {
    const meta = user.user_metadata ?? {};
    const prefs = meta.notification_prefs ?? {};
    const sub = meta.push_subscription;
    if (!sub?.endpoint || !sub?.keys) {
      console.log(`[cron/hourly] user=${user.id} skip: no push subscription`);
      dailyR.skipped++;
      nudgeR.skipped++;
      continue;
    }

    // ── Daily capture prompt ──
    if (prefs.daily_enabled) {
      const tz = prefs.daily_timezone || "UTC";
      const targetHour = parseInt(String(prefs.daily_time || "20:00").split(":")[0], 10);
      const lastSent = prefs.daily_last_sent_at ? new Date(prefs.daily_last_sent_at).getTime() : 0;
      const hoursSince = (now.getTime() - lastSent) / 3_600_000;
      const lh = localHour(tz, now);
      console.log(
        `[cron/hourly] user=${user.id} daily: tz=${tz} target=${targetHour} local=${lh} hoursSince=${hoursSince.toFixed(1)} match=${lh === targetHour && hoursSince >= 23}`,
      );
      if (lh === targetHour && hoursSince >= 23) {
        try {
          const dailyTitle = "Everion";
          const dailyBody = "What's worth remembering from today?";
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            JSON.stringify({
              title: dailyTitle,
              body: dailyBody,
              url: "/capture",
            }),
          );
          // Mirror to in-app bell — best-effort, doesn't fail the push.
          await insertCronNotification(user.id, "daily_prompt", dailyTitle, dailyBody, {
            url: "/capture",
            source: "cron-hourly",
          });
          await patchUserPrefs(user.id, meta, { daily_last_sent_at: now.toISOString() });
          dailyR.sent++;
        } catch (err: any) {
          console.error(`[cron/hourly] daily push failed for ${user.id}:`, err.message);
          if (err.statusCode === 410 || err.statusCode === 404) {
            const { push_subscription: _rm, ...rest } = meta;
            await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", ...adminHdrs },
              body: JSON.stringify({ user_metadata: rest }),
            });
          }
          dailyR.errors++;
        }
      } else {
        dailyR.skipped++;
      }
    } else {
      console.log(`[cron/hourly] user=${user.id} daily: disabled`);
      dailyR.skipped++;
    }

    // ── Quiet nudge (weekly) ──
    if (prefs.nudge_enabled) {
      const tz = prefs.nudge_timezone || "UTC";
      const targetHour = parseInt(String(prefs.nudge_time || "10:00").split(":")[0], 10);
      const targetDay = String(prefs.nudge_day || "sunday").toLowerCase();
      const lastSent = prefs.nudge_last_sent_at ? new Date(prefs.nudge_last_sent_at).getTime() : 0;
      const daysSince = (now.getTime() - lastSent) / 86_400_000;
      if (
        localWeekday(tz, now) === targetDay &&
        localHour(tz, now) === targetHour &&
        daysSince >= 6
      ) {
        try {
          const nudgeTitle = "Everion · nudge";
          const nudgeBody = "Something in your memory rhymes with this week.";
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            JSON.stringify({
              title: nudgeTitle,
              body: nudgeBody,
              url: "/",
            }),
          );
          // Mirror to in-app bell.
          await insertCronNotification(user.id, "weekly_nudge", nudgeTitle, nudgeBody, {
            url: "/",
            source: "cron-hourly",
          });
          await patchUserPrefs(user.id, meta, { nudge_last_sent_at: now.toISOString() });
          nudgeR.sent++;
        } catch (err: any) {
          console.error(`[cron/hourly] nudge push failed for ${user.id}:`, err.message);
          nudgeR.errors++;
        }
      } else {
        nudgeR.skipped++;
      }
    } else {
      nudgeR.skipped++;
    }

    // ── Expiry reminders (shared-brain fan-out) ──
    // Iterates every brain the user can access (owner + member), respects
    // brain_notification_prefs (default 'all'), looks for entries with a
    // due/deadline/expiry/event date within the user's lead-day window, and
    // sends one push + bell row per (user, entry, brain, lead_days). The
    // expiry_notification_log UNIQUE constraint is the dedup gate — a 409
    // means we already fired and we silently move on.
    if (expiryFanOutOn && prefs.expiry_enabled) {
      const tz = prefs.daily_timezone || "UTC";
      const targetHour = parseInt(String(prefs.daily_time || "20:00").split(":")[0], 10);
      if (localHour(tz, now) === targetHour) {
        try {
          const rawLeads: unknown = prefs.expiry_lead_days;
          const leadDays: number[] = Array.isArray(rawLeads) && rawLeads.length
            ? (rawLeads as unknown[])
                .map((n) => Number(n))
                .filter((n) => Number.isInteger(n) && n >= 0 && n <= 3650)
            : [90, 30, 7, 1];
          if (!leadDays.length) continue;
          const maxLead = Math.max(...leadDays);

          // Brains the user can access: owner OR member/viewer.
          const ownedR = await fetch(
            `${SB_URL}/rest/v1/brains?owner_id=eq.${encodeURIComponent(user.id)}&select=id,name,owner_id&limit=200`,
            { headers: adminHdrs },
          );
          const owned: Array<{ id: string; name: string; owner_id: string }> = ownedR.ok
            ? await ownedR.json()
            : [];
          const memberR = await fetch(
            `${SB_URL}/rest/v1/brain_members?user_id=eq.${encodeURIComponent(user.id)}&select=brain:brains(id,name,owner_id)&limit=200`,
            { headers: adminHdrs },
          );
          const memberRows: Array<{
            brain: { id: string; name: string; owner_id: string } | null;
          }> = memberR.ok ? await memberR.json() : [];
          const brainMap = new Map<string, { id: string; name: string; owner_id: string }>();
          for (const b of owned) brainMap.set(b.id, b);
          for (const row of memberRows) {
            if (row.brain && !brainMap.has(row.brain.id)) brainMap.set(row.brain.id, row.brain);
          }

          // Per-brain notification levels for this user (default 'all').
          const bnpR = await fetch(
            `${SB_URL}/rest/v1/brain_notification_prefs?user_id=eq.${encodeURIComponent(user.id)}&select=brain_id,level&limit=500`,
            { headers: adminHdrs },
          );
          const bnpRows: Array<{ brain_id: string; level: string }> = bnpR.ok
            ? await bnpR.json()
            : [];
          const levelMap = new Map(bnpRows.map((r) => [r.brain_id, r.level]));

          const todayMs = Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
          );
          const todayIso = new Date(todayMs).toISOString().slice(0, 10);
          const dateFieldOr = [
            `metadata->>due_date.gte.${todayIso}`,
            `metadata->>deadline.gte.${todayIso}`,
            `metadata->>expiry_date.gte.${todayIso}`,
            `metadata->>event_date.gte.${todayIso}`,
          ].join(",");
          // PostgREST `or=(...)` syntax is parenthesised. Encode the comma
          // separators but keep the parens literal.
          const orParam = `or=(${dateFieldOr})`;

          for (const brain of brainMap.values()) {
            const level = levelMap.get(brain.id) ?? "all";
            if (level === "off") {
              expiryR.skipped++;
              continue;
            }
            if (level === "owner_only" && brain.owner_id !== user.id) {
              expiryR.skipped++;
              continue;
            }

            const eR = await fetch(
              `${SB_URL}/rest/v1/entries?brain_id=eq.${encodeURIComponent(brain.id)}&deleted_at=is.null&${orParam}&select=id,title,metadata&limit=200`,
              { headers: adminHdrs },
            );
            if (!eR.ok) {
              expiryR.errors++;
              continue;
            }
            const entries: Array<{
              id: string;
              title: string | null;
              metadata: Record<string, unknown> | null;
            }> = await eR.json();

            for (const entry of entries) {
              const m = entry.metadata ?? {};
              const field: "due_date" | "deadline" | "expiry_date" | "event_date" | null =
                typeof m.due_date === "string" && m.due_date
                  ? "due_date"
                  : typeof m.deadline === "string" && m.deadline
                    ? "deadline"
                    : typeof m.expiry_date === "string" && m.expiry_date
                      ? "expiry_date"
                      : typeof m.event_date === "string" && m.event_date
                        ? "event_date"
                        : null;
              if (!field) continue;
              const dateStr = String(m[field]);
              const dateMs = Date.parse(dateStr);
              if (!Number.isFinite(dateMs)) continue;
              if (dateMs > todayMs + maxLead * 86_400_000) continue;
              if (dateMs < todayMs) continue;
              const dayOffset = Math.round((dateMs - todayMs) / 86_400_000);
              if (!leadDays.includes(dayOffset)) continue;

              const itemLabel = `${field}:${dateStr}`;
              const logR = await fetch(`${SB_URL}/rest/v1/expiry_notification_log`, {
                method: "POST",
                headers: {
                  ...adminHdrs,
                  "Content-Type": "application/json",
                  Prefer: "return=minimal",
                },
                body: JSON.stringify({
                  user_id: user.id,
                  entry_id: entry.id,
                  brain_id: brain.id,
                  item_label: itemLabel,
                  expiry_date: dateStr,
                  lead_days: dayOffset,
                }),
              });
              if (logR.status === 409) {
                expiryR.deduped++;
                continue;
              }
              if (!logR.ok) {
                const t = await logR.text().catch(() => "");
                console.error(
                  `[cron/hourly] expiry log insert HTTP ${logR.status}: ${t.slice(0, 200)}`,
                );
                expiryR.errors++;
                continue;
              }

              const friendlyDate = new Date(dateMs).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              });
              const dayWord = dayOffset === 1 ? "day" : "days";
              const titleStr = `${entry.title || "Reminder"} · ${dayOffset} ${dayWord}`;
              const bodyStr = `${friendlyDate} · ${brain.name || "brain"}`;

              try {
                await webpush.sendNotification(
                  { endpoint: sub.endpoint, keys: sub.keys },
                  JSON.stringify({
                    title: titleStr,
                    body: bodyStr,
                    url: `/?entry=${entry.id}`,
                  }),
                );
                await insertCronNotification(user.id, "expiry_reminder", titleStr, bodyStr, {
                  entry_id: entry.id,
                  brain_id: brain.id,
                  brain_name: brain.name,
                  lead_days: dayOffset,
                  due_date: dateStr,
                  field,
                  url: `/?entry=${entry.id}`,
                  source: "cron-hourly",
                });
                expiryR.sent++;
              } catch (err: any) {
                console.error(`[cron/hourly] expiry push failed:`, err?.message ?? err);
                expiryR.errors++;
              }
            }
          }
        } catch (err: any) {
          console.error(
            `[cron/hourly] expiry block failed for ${user.id}:`,
            err?.message ?? err,
          );
          expiryR.errors++;
        }
      } else {
        expiryR.skipped++;
      }
    } else {
      expiryR.skipped++;
    }
  }

  // ── Enrich sweep (hourly safety net) ──
  // Catches any entry the inline PATCH-time enrichInline call dropped — e.g.
  // a Vercel cold-start that timed out, an LLM 429 that won't retry from
  // user code, or a contact-creation path that never queued enrichment.
  // Together with the daily cron and the inline path this is the third
  // layer that guarantees no entry stays unenriched longer than ~1 hour.
  // Tighter budget than daily (90s total) so we stay inside the function
  // timeout shared with push notifications above.
  const enrichR = envFlagEnabled("ENRICH_CRON_DISABLE")
    ? { brains: 0, processed: 0, mode: "hourly" as const, disabled: true }
    : await enrichAllBrains({ mode: "hourly" }).catch((e) => {
        console.error("[cron/hourly] enrich sweep failed:", e);
        return { brains: 0, processed: 0, mode: "hourly" as const };
      });

  console.log(
    `[cron/hourly] done daily=${JSON.stringify(dailyR)} nudge=${JSON.stringify(nudgeR)} expiry=${JSON.stringify(expiryR)} enrich=${JSON.stringify(enrichR)}`,
  );
  return void res.status(200).json({
    daily: dailyR,
    nudge: nudgeR,
    expiry: expiryR,
    enrich: enrichR,
  });
}

// ── /api/cron/daily (rewritten to /api/user-data?resource=cron-daily) ──
//
// Heavy work that should fire once per day regardless of any user's tz:
// Gmail inbox scan, enrich-all-brains catch-up, persona hygiene. The
// per-user time-aware push notifications now live in handleCronHourly.
async function handleCronDaily(req: ApiRequest, res: ApiResponse): Promise<void> {
  const auth = (req.headers as any).authorization as string | undefined;
  if (!process.env.CRON_SECRET || !verifyCronBearer(auth, process.env.CRON_SECRET)) {
    return void res.status(401).json({ error: "Unauthorized" });
  }

  // VAPID setup is still needed for the admin summary at the end
  const subject = process.env.VAPID_SUBJECT;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (subject && pub && priv) webpush.setVapidDetails(subject, pub, priv);

  // ── Gmail inbox scan ──
  const gmailResults = envFlagEnabled("GMAIL_CRON_DISABLE")
    ? { users: 0, created: 0, errors: 0, disabled: true }
    : await runGmailScanAllUsers().catch((e) => {
        console.error("[cron/daily] gmail scan failed:", e);
        return { users: 0, created: 0, errors: 1 };
      });

  // ── Enrich every brain — daily catch-up pass for entries inline didn't cover ──
  const enrichResults = envFlagEnabled("ENRICH_CRON_DISABLE")
    ? { brains: 0, processed: 0, disabled: true }
    : await enrichAllBrains().catch((e) => {
        console.error("[cron/daily] enrich batch failed:", e);
        return { brains: 0, processed: 0 };
      });

  // ── Persona hygiene ──
  // Decay every day; dedup + digest only on Sundays so users get one summary
  // per week instead of seven. UTC day-of-week to match the cron schedule.
  const personaDecay = await runPersonaDecayPass().catch((e) => {
    console.error("[cron/daily] persona decay failed:", e);
    return { scanned: 0, decayed: 0, faded: 0, archived: 0 };
  });
  let personaWeekly: { dedups_proposed: number; digests_written: number } | null = null;
  if (new Date().getUTCDay() === 0) {
    personaWeekly = await runPersonaWeeklyPass().catch((e) => {
      console.error("[cron/daily] persona weekly failed:", e);
      return { dedups_proposed: 0, digests_written: 0 };
    });
  }

  // ── Admin summary push + in-app notification ──
  // One push to the admin's device so they see the cron ran without opening
  // the app, plus a row inserted into the notifications table so the bell
  // also lights up next time they open Everion. Both are gated by the
  // admin_summary_enabled toggle in Settings → Admin → Daily roundup.
  // Either side can fail independently — the push needs VAPID + a saved
  // subscription, the notification row only needs Supabase reachability.
  const adminEmail = (process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  if (adminEmail) {
    try {
      const adminHdrs = hdrs();
      const localPart = adminEmail.split("@")[0] || adminEmail;
      const r = await fetch(
        `${SB_URL}/auth/v1/admin/users?filter=${encodeURIComponent(localPart)}`,
        { headers: adminHdrs },
      );
      if (r.ok) {
        const data: any = await r.json().catch(() => null);
        const list: any[] = Array.isArray(data?.users) ? data.users : [];
        const admin = list.find((u) => (u.email || "").toLowerCase() === adminEmail);
        const adminSub = admin?.user_metadata?.push_subscription;
        const summaryOn = admin?.user_metadata?.notification_prefs?.admin_summary_enabled === true;
        const summaryBody =
          `gmail ${gmailResults.created}/${gmailResults.users}u · ` +
          `enrich ${enrichResults.processed}/${enrichResults.brains}b · ` +
          `decay ${personaDecay.decayed}d ${personaDecay.archived}a`;
        const summaryTitle = "Everion · daily cron ✓";

        // Push notification — needs VAPID + a registered subscription.
        if (
          summaryOn &&
          subject &&
          pub &&
          priv &&
          adminSub?.endpoint &&
          adminSub?.keys?.p256dh &&
          adminSub?.keys?.auth
        ) {
          await webpush
            .sendNotification(
              { endpoint: adminSub.endpoint, keys: adminSub.keys },
              JSON.stringify({ title: summaryTitle, body: summaryBody, url: "/" }),
            )
            .catch((err: any) =>
              console.error("[cron/daily] admin summary push failed:", err?.message),
            );
        }

        // In-app notification row — fires regardless of VAPID config so the
        // bell lights up even when push isn't reachable (e.g. user on a
        // platform without web-push support, or subscription expired).
        if (summaryOn && admin?.id) {
          await insertCronNotification(admin.id, "cron_summary", summaryTitle, summaryBody, {
            gmail: gmailResults,
            enrich: enrichResults,
            persona_decay: personaDecay,
            persona_weekly: personaWeekly,
            source: "cron-daily",
          });
        }
      }
    } catch (err: any) {
      console.error("[cron/daily] admin summary failed:", err?.message);
    }
  }

  return void res.status(200).json({
    gmail: gmailResults,
    enrich: enrichResults,
    persona_decay: personaDecay,
    persona_weekly: personaWeekly,
  });
}

// ── /api/notifications (rewritten to /api/user-data?resource=notifications) ──
const handleNotifications = withAuth(
  { methods: ["GET", "PATCH", "DELETE"], rateLimit: 60 },
  async ({ req, res, user }) => {
    if (req.method === "GET") {
      const dismissed = req.query.dismissed === "true" ? "eq.true" : "eq.false";
      const r = await fetch(
        `${SB_URL}/rest/v1/notifications?user_id=eq.${encodeURIComponent(user.id)}&dismissed=${dismissed}&order=created_at.desc&limit=50`,
        { headers: hdrs() },
      );
      if (!r.ok) return void res.status(502).json({ error: "Failed to fetch notifications" });
      return void res.status(200).json(await r.json());
    }

    if (req.method === "PATCH") {
      const { id, read, dismissed } = req.body as {
        id: string;
        read?: boolean;
        dismissed?: boolean;
      };
      if (!id) return void res.status(400).json({ error: "Missing id" });
      const patch: Record<string, unknown> = {};
      if (read !== undefined) patch.read = read;
      if (dismissed !== undefined) patch.dismissed = dismissed;
      if (!Object.keys(patch).length)
        return void res.status(400).json({ error: "Nothing to update" });
      const r = await fetch(
        `${SB_URL}/rest/v1/notifications?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
        {
          method: "PATCH",
          headers: hdrs({ Prefer: "return=minimal" }),
          body: JSON.stringify(patch),
        },
      );
      if (!r.ok) return void res.status(502).json({ error: "Failed to update notification" });
      return void res.status(200).json({ ok: true });
    }

    // DELETE — dismiss all, or just a specific type if ?type= is provided
    const typeFilter =
      typeof req.query.type === "string" ? `&type=eq.${encodeURIComponent(req.query.type)}` : "";
    await fetch(
      `${SB_URL}/rest/v1/notifications?user_id=eq.${encodeURIComponent(user.id)}&dismissed=eq.false${typeFilter}`,
      {
        method: "PATCH",
        headers: hdrs({ Prefer: "return=minimal" }),
        body: JSON.stringify({ dismissed: true }),
      },
    );
    return void res.status(200).json({ ok: true });
  },
);

// ── /api/brain-notification-prefs (rewritten to ?resource=brain-notification-prefs) ──
//
// Per-(user, brain) notification level. Members default to 'all' when no row
// exists — the GET response always includes a row for every brain the user
// can access, falling back to 'all' for ones never customised. PUT upserts.
// See EML/Specs/shared-brain-notifications.md.
const handleBrainNotificationPrefs = withAuth(
  { methods: ["GET", "PUT"], rateLimit: 60 },
  async ({ req, res, user }) => {
    if (req.method === "GET") {
      // Brains the user owns.
      const ownedR = await fetch(
        `${SB_URL}/rest/v1/brains?owner_id=eq.${encodeURIComponent(user.id)}&select=id,name,owner_id,is_personal&limit=200`,
        { headers: hdrs() },
      );
      const owned: Array<{ id: string; name: string; owner_id: string; is_personal: boolean }> =
        ownedR.ok ? await ownedR.json() : [];

      // Brains the user is a member/viewer of.
      const memberR = await fetch(
        `${SB_URL}/rest/v1/brain_members?user_id=eq.${encodeURIComponent(user.id)}&select=role,brain:brains(id,name,owner_id,is_personal)&limit=200`,
        { headers: hdrs() },
      );
      const memberRows: Array<{
        role: string;
        brain: { id: string; name: string; owner_id: string; is_personal: boolean } | null;
      }> = memberR.ok ? await memberR.json() : [];

      // Existing per-brain prefs.
      const bnpR = await fetch(
        `${SB_URL}/rest/v1/brain_notification_prefs?user_id=eq.${encodeURIComponent(user.id)}&select=brain_id,level&limit=500`,
        { headers: hdrs() },
      );
      const bnpRows: Array<{ brain_id: string; level: string }> = bnpR.ok ? await bnpR.json() : [];
      const levelMap = new Map(bnpRows.map((r) => [r.brain_id, r.level]));

      const out: Array<{
        brain_id: string;
        brain_name: string;
        is_personal: boolean;
        is_owner: boolean;
        role: "owner" | "member" | "viewer";
        level: "all" | "owner_only" | "off";
      }> = [];
      const seen = new Set<string>();

      for (const b of owned) {
        seen.add(b.id);
        out.push({
          brain_id: b.id,
          brain_name: b.name,
          is_personal: b.is_personal,
          is_owner: true,
          role: "owner",
          level: ((levelMap.get(b.id) as any) ?? "all"),
        });
      }
      for (const row of memberRows) {
        if (!row.brain || seen.has(row.brain.id)) continue;
        seen.add(row.brain.id);
        out.push({
          brain_id: row.brain.id,
          brain_name: row.brain.name,
          is_personal: row.brain.is_personal,
          is_owner: row.brain.owner_id === user.id,
          role: row.role === "viewer" ? "viewer" : "member",
          level: ((levelMap.get(row.brain.id) as any) ?? "all"),
        });
      }
      return void res.status(200).json({ prefs: out });
    }

    // PUT — upsert one row { brain_id, level }
    const body = (req.body ?? {}) as { brain_id?: unknown; level?: unknown };
    const brainId = typeof body.brain_id === "string" ? body.brain_id : "";
    const level = typeof body.level === "string" ? body.level : "";
    if (!brainId) return void res.status(400).json({ error: "brain_id required" });
    if (level !== "all" && level !== "owner_only" && level !== "off") {
      return void res.status(400).json({ error: "level must be all|owner_only|off" });
    }

    // Verify the user actually has access to this brain (owner or member).
    const accessR = await fetch(
      `${SB_URL}/rest/v1/brains?id=eq.${encodeURIComponent(brainId)}&select=id,owner_id&limit=1`,
      { headers: hdrs() },
    );
    const accessRows: Array<{ id: string; owner_id: string }> = accessR.ok
      ? await accessR.json()
      : [];
    const isOwner = accessRows[0]?.owner_id === user.id;
    let isMember = false;
    if (!isOwner) {
      const mr = await fetch(
        `${SB_URL}/rest/v1/brain_members?brain_id=eq.${encodeURIComponent(brainId)}&user_id=eq.${encodeURIComponent(user.id)}&select=user_id&limit=1`,
        { headers: hdrs() },
      );
      const mRows: Array<{ user_id: string }> = mr.ok ? await mr.json() : [];
      isMember = mRows.length > 0;
    }
    if (!isOwner && !isMember) {
      return void res.status(403).json({ error: "Not a member of that brain" });
    }

    const r = await fetch(
      `${SB_URL}/rest/v1/brain_notification_prefs?on_conflict=user_id,brain_id`,
      {
        method: "POST",
        headers: hdrs({
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        }),
        body: JSON.stringify({
          user_id: user.id,
          brain_id: brainId,
          level,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error(`[brain-notification-prefs] upsert HTTP ${r.status}: ${t.slice(0, 200)}`);
      return void res.status(502).json({ error: "Failed to save preference" });
    }
    return void res.status(200).json({ ok: true, brain_id: brainId, level });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Web checkout: LemonSqueezy
//
// LemonSqueezy is the merchant of record for the web. We POST to their
// /v1/checkouts API to mint a one-shot hosted-checkout URL keyed to a variant
// id (per-tier env var) with the user's id + tier embedded in custom_data.
// The webhook handler below uses that custom_data to bridge into RevenueCat
// so the same user's mobile install already shows them as paid.
// ─────────────────────────────────────────────────────────────────────────────

// ── /api/user-data?resource=lemon-checkout ──
const handleLemonCheckout = withAuth(
  { methods: ["POST"], rateLimit: 10 },
  async ({ req, res, user }) => {
    const { plan } = (req.body ?? {}) as { plan?: string };

    // Max is wired in the type system + DB but not yet purchaseable — the
    // env var is intentionally unset until launch. The 500 below covers the
    // case where someone hits this endpoint after manually setting the env
    // var; until then the 400 keeps Max strictly admin-overrideable.
    if (plan !== "starter" && plan !== "pro" && plan !== "max") {
      return void res.status(400).json({ error: "Invalid plan" });
    }

    const variantEnvKey =
      plan === "starter"
        ? "LEMONSQUEEZY_STARTER_VARIANT_ID"
        : plan === "pro"
          ? "LEMONSQUEEZY_PRO_VARIANT_ID"
          : "LEMONSQUEEZY_MAX_VARIANT_ID";
    const variantId = process.env[variantEnvKey];
    if (!variantId) return void res.status(500).json({ error: "Plan not configured" });

    const appOrigin = (process.env.APP_ORIGIN || process.env.APP_URL || "").trim();
    if (!appOrigin) return void res.status(500).json({ error: "App origin not configured" });
    const successUrl = `${appOrigin.replace(/\/$/, "")}/settings?tab=billing&billing=success`;

    let url: string;
    try {
      url = await lemonCreateCheckoutUrl({
        variantId,
        email: user.email ?? null,
        userId: user.id,
        tier: plan,
        successUrl,
      });
    } catch (err) {
      console.error("[lemon-checkout] checkout URL create failed:", err);
      return void res.status(502).json({ error: "Payment provider unavailable" });
    }
    res.status(200).json({ url });
  },
);

// ── /api/user-data?resource=lemon-webhook ──
//
// Bridges LemonSqueezy → RevenueCat. On every active-subscription event we:
//   1. resolve the user (custom_data.user_id is always present because the
//      checkout was minted with it embedded);
//   2. write the tier to user_profiles;
//   3. grant the matching RC promotional entitlement so mobile RC SDK sees
//      the user as entitled even though they paid on web.
// On cancel/expire we revoke the promotional entitlement and revert to free.
async function handleLemonWebhook(
  req: ApiRequest,
  res: ApiResponse,
  rawBody: Buffer,
): Promise<void> {
  const sigHeader = req.headers["x-signature"] as string | undefined;
  const sigCheck = lemonVerifyWebhookSignature(rawBody, sigHeader);
  if (!sigCheck.ok) {
    console.warn(`[lemon-webhook] signature rejected: ${sigCheck.reason}`);
    return void res.status(400).json({ error: `Invalid signature (${sigCheck.reason})` });
  }

  let body: {
    meta?: {
      event_name?: string;
      custom_data?: { user_id?: string; tier?: string };
      webhook_id?: string;
    };
    data?: {
      id?: string;
      attributes?: {
        customer_id?: number | string;
        variant_id?: number | string;
        status?: string;
        renews_at?: string | null;
        ends_at?: string | null;
      };
    };
  };
  try {
    body = JSON.parse(rawBody.toString("utf-8"));
  } catch (err) {
    console.error("[lemon-webhook] body parse failed:", err);
    return void res.status(400).json({ error: "Invalid JSON body" });
  }

  const eventName = body.meta?.event_name ?? "";
  const eventId = body.meta?.webhook_id ?? body.data?.id ?? "";
  if (!eventName || !eventId) {
    return void res.status(400).json({ error: "Missing event metadata" });
  }

  const { firstTime } = await markWebhookEventSeen("lemon", eventId);
  if (!firstTime) {
    console.log(`[lemon-webhook] dropping duplicate event ${eventId} (${eventName})`);
    return void res.status(200).json({ received: true, duplicate: true });
  }

  const userId = body.meta?.custom_data?.user_id ?? "";
  if (!userId) {
    console.warn(`[lemon-webhook] event ${eventId} missing custom_data.user_id`);
    return void res.status(200).json({ received: true, ignored: "missing user_id" });
  }

  const attrs = body.data?.attributes ?? {};
  const customerId = attrs.customer_id != null ? String(attrs.customer_id) : null;
  const subscriptionId = body.data?.id ?? null;
  const variantId = attrs.variant_id != null ? String(attrs.variant_id) : "";
  const renewsAt = attrs.renews_at ?? null;
  const endsAt = attrs.ends_at ?? null;

  const isActive =
    eventName === "subscription_created" ||
    eventName === "subscription_updated" ||
    eventName === "subscription_resumed" ||
    eventName === "subscription_unpaused";

  const isInactive =
    eventName === "subscription_cancelled" ||
    eventName === "subscription_expired" ||
    eventName === "subscription_paused";

  if (!isActive && !isInactive) {
    // Other LS events (subscription_payment_*, subscription_plan_changed, etc.)
    // — ignore for now; renews_at on subsequent _updated events keeps state fresh.
    return void res.status(200).json({ received: true, ignored: eventName });
  }

  let tier: Tier;
  let currentPeriodEnd: string | null;
  let dbOk: { ok: boolean };

  if (isActive) {
    tier = resolveTier("lemonsqueezy", variantId);
    if (tier === "free") {
      // Variant id didn't match either configured tier — log + treat as cancellation
      // rather than silently leaving the user on a stale tier.
      console.warn(`[lemon-webhook] unknown variant_id ${variantId} on event ${eventId}`);
    }
    currentPeriodEnd = renewsAt;
    dbOk = await writePlanChange({
      userId,
      provider: "lemonsqueezy",
      tier,
      lemonCustomerId: customerId,
      lemonSubscriptionId: subscriptionId,
      currentPeriodEnd,
    });
    if (dbOk.ok && tier !== "free") {
      // Bridge to RevenueCat. Failure here doesn't block the user — the web
      // session is paid. Mobile would just need a manual sync until next event.
      const grantRes = await rcGrantEntitlement({
        appUserId: userId,
        entitlementId: tier, // "starter" | "pro"
        duration: "monthly",
      });
      if (!grantRes.ok) {
        console.warn(`[lemon-webhook] RC grant failed for user ${userId} tier ${tier}`);
      }
    }
  } else {
    // Cancellation / expiry — revoke and drop to free.
    tier = "free";
    currentPeriodEnd = endsAt ?? renewsAt;
    dbOk = await writePlanChange({
      userId,
      provider: "lemonsqueezy",
      tier,
      lemonSubscriptionId: null,
      currentPeriodEnd,
    });
    if (dbOk.ok) {
      // Revoke both — caller may have been on either entitlement.
      await rcRevoke(userId, "starter");
      await rcRevoke(userId, "pro");
    }
  }

  if (!dbOk.ok) {
    return void res.status(502).json({ error: "Database write failed — please retry" });
  }
  res.status(200).json({ received: true });
}

// ── /api/user-data?resource=revenuecat-webhook ──
//
// RevenueCat fires on every native subscription state change. We trust RC as
// the source of truth for App Store + Play because it does the receipt
// validation we'd otherwise have to write twice. Authentication is a shared
// bearer secret configured per-app in the RC dashboard.
async function handleRevenueCatWebhook(
  req: ApiRequest,
  res: ApiResponse,
  rawBody: Buffer,
): Promise<void> {
  const auth = req.headers["authorization"] as string | undefined;
  if (!rcVerifyWebhookAuth(auth)) {
    return void res.status(401).json({ error: "Unauthorized" });
  }

  let body: RevenueCatWebhookBody;
  try {
    body = JSON.parse(rawBody.toString("utf-8"));
  } catch (err) {
    console.error("[revenuecat-webhook] body parse failed:", err);
    return void res.status(400).json({ error: "Invalid JSON body" });
  }

  const event = body.event;
  if (!event || !event.type || !event.app_user_id) {
    return void res.status(400).json({ error: "Missing event fields" });
  }

  const eventId =
    event.id ?? `${event.type}:${event.app_user_id}:${event.event_timestamp_ms ?? "?"}`;
  const { firstTime } = await markWebhookEventSeen("revenuecat", eventId);
  if (!firstTime) {
    console.log(`[revenuecat-webhook] dropping duplicate event ${eventId} (${event.type})`);
    return void res.status(200).json({ received: true, duplicate: true });
  }

  const userId = event.app_user_id;
  const productId = event.product_id ?? "";
  const expirationIso = event.expiration_at_ms
    ? new Date(event.expiration_at_ms).toISOString()
    : null;

  // PROMOTIONAL store events come from our own bridge from LemonSqueezy —
  // skip them here (we already wrote the tier in handleLemonWebhook) so we
  // don't echo-loop our own entitlements back into the DB.
  if (event.store === "PROMOTIONAL") {
    return void res.status(200).json({ received: true, ignored: "promotional" });
  }

  const isActive =
    event.type === "INITIAL_PURCHASE" ||
    event.type === "RENEWAL" ||
    event.type === "PRODUCT_CHANGE" ||
    event.type === "UNCANCELLATION";

  const isInactive =
    event.type === "CANCELLATION" ||
    event.type === "EXPIRATION" ||
    event.type === "BILLING_ISSUE";

  if (!isActive && !isInactive) {
    return void res.status(200).json({ received: true, ignored: event.type });
  }

  const tier: Tier = isActive ? resolveTier("revenuecat", productId) : "free";

  const writeRes = await writePlanChange({
    userId,
    provider: "revenuecat",
    tier,
    appleOriginalTransactionId:
      event.store === "APP_STORE" || event.store === "MAC_APP_STORE"
        ? (event.original_transaction_id ?? null)
        : undefined,
    playPurchaseToken: event.store === "PLAY_STORE" ? (event.purchase_token ?? null) : undefined,
    playProductId: event.store === "PLAY_STORE" ? productId : undefined,
    currentPeriodEnd: expirationIso,
  });

  if (!writeRes.ok) {
    return void res.status(502).json({ error: "Database write failed — please retry" });
  }
  res.status(200).json({ received: true });
}

// ── /api/user-data?resource=lemon-portal ──
const handleLemonPortal = withAuth(
  { methods: ["POST"], rateLimit: 10 },
  async ({ res, user }) => {
    const profileRes = await fetch(
      `${SB_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(user.id)}&select=lemonsqueezy_customer_id`,
      { headers: sbHeaders() },
    );
    if (!profileRes.ok) {
      return void res.status(502).json({ error: "Payment provider unavailable" });
    }
    const [profile] = await profileRes.json();

    if (!profile?.lemonsqueezy_customer_id) {
      return void res.status(400).json({ error: "No active subscription found" });
    }

    let url: string;
    try {
      url = await lemonGetCustomerPortalUrl(String(profile.lemonsqueezy_customer_id));
    } catch (err) {
      console.error("[lemon-portal] Failed to fetch portal url:", err);
      return void res.status(502).json({ error: "Payment provider unavailable" });
    }
    res.status(200).json({ url });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Admin CRM
//
// Internal support console: lookup, view, and (cautiously) mutate any user's
// tier. Gated on `app_metadata.is_admin === true` in the JWT — same model as
// the entries.ts admin endpoints so support knows one mechanism. All mutations
// land in audit_log so we can reconstruct who changed what when.
// ─────────────────────────────────────────────────────────────────────────────

interface AdminUserRow {
  id: string;
  email: string | null;
  tier: string;
  billing_provider: string | null;
  current_period_end: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

// ── /api/user-data?resource=admin_users ──
// Search + pagination. Empty q returns the most recently created users so
// opening the console always shows fresh signups first.
const handleAdminUsers = withAuth(
  { methods: ["GET"], rateLimit: 60 },
  async ({ req, res, user }) => {
    if (!isAdminUser(user)) return void res.status(403).json({ error: "Forbidden" });

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const r = await fetch(`${SB_URL}/rest/v1/rpc/admin_list_users`, {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify({ p_q: q || null, p_limit: limit, p_offset: offset }),
    });
    if (!r.ok) {
      console.error(`[admin_users] RPC failed: ${r.status}`, await r.text());
      return void res.status(502).json({ error: "Lookup failed" });
    }
    const rows = (await r.json()) as AdminUserRow[];
    res.status(200).json({ users: rows, limit, offset, q });
  },
);

// ── /api/user-data?resource=admin_user_overview ──
// One user — profile + billing + this month's usage + last 50 audit events.
const handleAdminUserOverview = withAuth(
  { methods: ["GET"], rateLimit: 60 },
  async ({ req, res, user }) => {
    if (!isAdminUser(user)) return void res.status(403).json({ error: "Forbidden" });

    const target = typeof req.query.id === "string" ? req.query.id.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target)) {
      return void res.status(400).json({ error: "id must be a UUID" });
    }

    const r = await fetch(`${SB_URL}/rest/v1/rpc/admin_user_overview`, {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify({ p_user_id: target }),
    });
    if (!r.ok) {
      console.error(`[admin_user_overview] RPC failed: ${r.status}`, await r.text());
      return void res.status(502).json({ error: "Lookup failed" });
    }
    const data = await r.json();
    if (data?.error === "user not found") {
      return void res.status(404).json({ error: "User not found" });
    }
    res.status(200).json(data);
  },
);

// ── /api/user-data?resource=admin_set_tier ──
// Manual tier override. Reason is required (free-text 1-200 chars) so the
// audit trail is meaningful. Idempotency-Key header dedups accidental
// double-submits within 24h. Writes audit_log AFTER the tier update so the
// log only records actually-applied changes.
const handleAdminSetTier = withAuth(
  { methods: ["POST"], rateLimit: 30 },
  async ({ req, res, user }) => {
    if (!isAdminUser(user)) return void res.status(403).json({ error: "Forbidden" });

    const body = (req.body ?? {}) as {
      target_user_id?: string;
      tier?: string;
      reason?: string;
    };
    const target = (body.target_user_id ?? "").trim();
    const newTier = (body.tier ?? "").trim();
    const reason = (body.reason ?? "").trim();

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target)) {
      return void res.status(400).json({ error: "target_user_id must be a UUID" });
    }
    if (
      newTier !== "free" &&
      newTier !== "starter" &&
      newTier !== "pro" &&
      newTier !== "max"
    ) {
      return void res.status(400).json({ error: "tier must be free | starter | pro | max" });
    }
    if (reason.length < 1 || reason.length > 200) {
      return void res.status(400).json({ error: "reason required (1-200 chars)" });
    }

    // Idempotency: optional client-supplied Idempotency-Key header. If a
    // duplicate request arrives (double-click, retry on flaky network), the
    // second one short-circuits to "already processed" without re-PATCHing.
    let idemKey: string | null = null;
    try {
      idemKey = normalizeIdempotencyKey(req.headers["idempotency-key"]);
    } catch (e) {
      if (e instanceof IdempotencyError) {
        return void res.status(e.status).json({ error: e.message });
      }
      throw e;
    }
    const namespacedKey = idemKey ? `admin_set_tier:${target}:${idemKey}` : null;
    if (namespacedKey) {
      const result = await reserveActionIdempotency(user.id, namespacedKey);
      if (result.kind === "replay") {
        return void res.status(200).json({ ok: true, replay: true });
      }
    }

    // Read previous tier so the audit log captures before/after.
    const prevRes = await fetch(
      `${SB_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(target)}&select=tier`,
      { headers: sbHeaders() },
    );
    if (!prevRes.ok) {
      if (namespacedKey) await releaseIdempotency(user.id, namespacedKey);
      return void res.status(502).json({ error: "Lookup failed" });
    }
    const [prevRow] = (await prevRes.json()) as Array<{ tier?: string }>;
    if (!prevRow) {
      if (namespacedKey) await releaseIdempotency(user.id, namespacedKey);
      return void res.status(404).json({ error: "User not found" });
    }
    const prevTier = prevRow.tier ?? "free";

    const patchRes = await fetch(
      `${SB_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(target)}`,
      {
        method: "PATCH",
        headers: sbHeaders({ Prefer: "return=minimal" }),
        body: JSON.stringify({ tier: newTier }),
      },
    );
    if (!patchRes.ok) {
      if (namespacedKey) await releaseIdempotency(user.id, namespacedKey);
      console.error(`[admin_set_tier] PATCH failed: ${patchRes.status}`, await patchRes.text());
      return void res.status(502).json({ error: "Update failed" });
    }

    // Audit-log entry. Fire-and-forget so a logging hiccup doesn't undo the
    // tier change. The PATCH already succeeded — losing one log row is the
    // less-bad failure mode than a confused customer.
    fetch(`${SB_URL}/rest/v1/audit_log`, {
      method: "POST",
      headers: sbHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({
        user_id: target,
        action: "admin_tier_changed",
        metadata: {
          actor_id: user.id,
          actor_email: user.email ?? null,
          previous_tier: prevTier,
          new_tier: newTier,
          reason,
        },
      }),
    }).catch((err) => {
      console.error("[admin_set_tier] audit_log write failed:", err);
    });

    res.status(200).json({ ok: true, previous_tier: prevTier, new_tier: newTier });
  },
);
