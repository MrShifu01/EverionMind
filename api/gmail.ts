/**
 * GET  /api/gmail-auth?provider=google            → initiate Gmail OAuth
 * GET  /api/gmail-auth?provider=google&code=...   → Gmail OAuth callback
 * (Routed via vercel.json: /api/gmail-auth → /api/gmail?action=auth)
 *
 * GET    /api/gmail?action=integration  → current integration status
 * PUT    /api/gmail?action=preferences  → update scan preferences
 * POST   /api/gmail?action=scan         → manual scan trigger
 * DELETE /api/gmail                     → disconnect Gmail
 *
 * Register redirect URI in Google Cloud Console:
 *   https://<your-domain>/api/gmail-auth?provider=google
 */
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { withAuth, requireBrainAccess } from "./_lib/withAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { encryptToken } from "./_lib/gmailTokenCrypto.js";
import { signOAuthState, verifyOAuthState } from "./_lib/oauthState.js";
import {
  type GmailPreferences,
  defaultPreferences,
  scanGmailForUser,
  deepScanBatch,
} from "./_lib/gmailScan.js";
import { optionalBodyObject } from "./_lib/requestBody.js";
import { sbHeaders } from "./_lib/sbHeaders.js";
import { distillPatternSummary } from "./_lib/distillPatternSummary.js";
import { callAI } from "./_lib/aiProvider.js";
import { resolveProviderForUser } from "./_lib/resolveProvider.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_HEADERS = sbHeaders();

const GMAIL_SCOPE = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

function gmailRedirectUri(): string {
  return (
    process.env.GMAIL_REDIRECT_URI ?? `${process.env.APP_URL ?? ""}/api/gmail-auth?provider=google`
  );
}

async function generateIgnoreRule(
  userId: string,
  params: {
    subject?: string;
    from?: string;
    email_type?: string;
    content_preview?: string;
  },
): Promise<string> {
  // Routes through callAI so the rule generator works for BYOK and
  // managed-Gemini users, not just env ANTHROPIC_API_KEY (unset on this
  // project).
  const fallback = `Ignore emails from ${params.from ?? "this sender"}.`;
  const cfg = await resolveProviderForUser(userId);
  if (!cfg) return fallback;
  const text = await callAI(
    cfg,
    "",
    `Generate a specific exclusion rule for a personal email scanning system.

The rule must describe WHAT TYPE of email to ignore based on its content, subject, or purpose — NOT the sender's address or domain.
The same sender may send both wanted and unwanted emails, so address-based rules block too much.

Email details:
- From: ${params.from ?? "unknown"}
- Subject: ${params.subject ?? ""}
- Type: ${params.email_type ?? ""}
- Preview: ${params.content_preview ?? ""}

Write ONE sentence starting with "Ignore" that targets the specific content pattern or email purpose.
Bad: "Ignore emails from capitec.co.za" (blocks everything from that sender)
Good: "Ignore Capitec promotional emails about credit card offers or insurance"
Return only the rule text, no explanation.`,
    { maxTokens: 150 },
  );
  return text.trim() || fallback;
}

/* ── OAuth ── */

function buildGoogleAuthUrl(userId: string, preferences: GmailPreferences): string | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return null;
  const state = signOAuthState({ userId, data: { preferences } });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", gmailRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

async function callbackGoogle(req: ApiRequest, res: ApiResponse) {
  const appUrl = process.env.APP_URL ?? "";
  const { code, state, error } = req.query as Record<string, string>;
  if (error) return res.redirect(302, `${appUrl}/settings?gmailError=google_denied`);
  if (!code || !state) return res.redirect(302, `${appUrl}/settings?gmailError=missing_params`);

  const verified = verifyOAuthState(state);
  if (!verified.ok) {
    const reason = verified.reason === "expired" ? "expired_state" : "invalid_state";
    return res.redirect(302, `${appUrl}/settings?gmailError=${reason}`);
  }
  const userId = verified.payload.userId;
  const prefRaw = verified.payload.data?.preferences;
  const preferences: GmailPreferences =
    prefRaw && typeof prefRaw === "object" ? (prefRaw as GmailPreferences) : defaultPreferences();

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: gmailRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return res.redirect(302, `${appUrl}/settings?gmailError=token_exchange`);

  const tokens = await tokenRes.json();
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = profileRes.ok ? await profileRes.json() : {};

  const dbRes = await fetch(`${SB_URL}/rest/v1/gmail_integrations`, {
    method: "POST",
    headers: { ...SB_HEADERS, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      user_id: userId,
      access_token: encryptToken(tokens.access_token),
      refresh_token: encryptToken(tokens.refresh_token),
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      gmail_email: profile.email ?? null,
      preferences,
    }),
  });
  if (!dbRes.ok) return res.redirect(302, `${appUrl}/settings?gmailError=db_write_failed`);
  res.redirect(302, `${appUrl}/settings?gmailConnected=true`);
}

async function handleAuth(req: ApiRequest, res: ApiResponse): Promise<void> {
  // IP-based limit on the OAuth bootstrap. Both initiate (POST → JSON) and
  // callback (token exchange + DB write) hit external services and writes;
  // unbounded grinding would burn Google quota and pollute integrations.
  if (!(await rateLimit(req, 30, 60_000, "gmail-auth"))) {
    return void res.status(429).json({ error: "Too many requests" });
  }

  const { provider, code } = req.query as Record<string, string>;
  if (provider !== "google")
    return res.status(400).json({ error: "Only google provider supported" });

  // Google's redirect comes back here as a GET with `?code=`. Anything else
  // hitting this path is the legitimate user-driven start of the flow.
  if (req.method === "GET" && code) return callbackGoogle(req, res);

  // Initiation no longer accepts a Supabase bearer in the URL — the previous
  // `?token=<JWT>` pattern leaked tokens into server access logs, browser
  // history, and Referer headers. Clients now POST with a normal
  // Authorization header and receive a redirect URL to navigate to.
  if (req.method !== "POST" && req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  // Reject GET initiation outright — only POST can start the flow now.
  if (req.method === "GET") {
    return res
      .status(405)
      .json({ error: "Use POST with Authorization header to start OAuth" });
  }

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  let preferences: GmailPreferences;
  try {
    const body = optionalBodyObject(req.body) as { preferences?: GmailPreferences };
    preferences =
      body.preferences && typeof body.preferences === "object"
        ? body.preferences
        : defaultPreferences();
  } catch {
    preferences = defaultPreferences();
  }

  const redirectUrl = buildGoogleAuthUrl(user.id, preferences);
  if (!redirectUrl) return res.status(500).json({ error: "GOOGLE_CLIENT_ID not set" });
  return void res.status(200).json({ redirect_url: redirectUrl });
}

/* ── Main handler ── */

// Authed sub-handler covering all non-OAuth actions (integration, scan, deep-scan,
// preferences, delete-entries, ignore, DELETE). The OAuth `auth` action stays
// outside the wrapper because it has its own queryToken-based bootstrap and a
// 302 redirect response that doesn't fit withAuth.
const authedHandler = withAuth(
  // Outer baseline 60/min catches the cheap actions (GET integration, PUT
  // preferences, POST ignore, DELETE) that don't have inner action-specific
  // limits. Expensive actions (scan: 5/min, deep-scan: 3/min) still throttle
  // tighter inside the handler.
  { methods: ["GET", "POST", "PUT", "DELETE"], rateLimit: 60 },
  async ({ req, res, user }) => {
    const action = (req.query.action as string) ?? "";

    if (req.method === "DELETE") {
      await fetch(`${SB_URL}/rest/v1/gmail_integrations?user_id=eq.${user.id}`, {
        method: "DELETE",
        headers: SB_HEADERS,
      });
      return void res.status(200).json({ ok: true });
    }

    if (req.method === "GET" && action === "integration") {
      const r = await fetch(
        `${SB_URL}/rest/v1/gmail_integrations?user_id=eq.${user.id}&select=id,gmail_email,scan_enabled,last_scanned_at,preferences`,
        { headers: SB_HEADERS },
      );
      const rows: any[] = r.ok ? await r.json() : [];
      return void res.status(200).json(rows[0] ?? null);
    }

    if (req.method === "PUT" && action === "preferences") {
      const { preferences } = optionalBodyObject(req.body);
      if (!preferences) return void res.status(400).json({ error: "preferences required" });
      await fetch(`${SB_URL}/rest/v1/gmail_integrations?user_id=eq.${user.id}`, {
        method: "PATCH",
        headers: SB_HEADERS,
        body: JSON.stringify({ preferences }),
      });
      return void res.status(200).json({ ok: true });
    }

    if (req.method === "POST" && action === "scan") {
      // §2.3: 5 manual scans/min per user — prevents DoS via repeat triggering
      if (!(await rateLimit(req, 5, 60_000, `gmail-scan:${user.id}`))) {
        return void res
          .status(429)
          .json({ error: "Too many scan requests — wait a minute and try again." });
      }
      const r = await fetch(`${SB_URL}/rest/v1/gmail_integrations?user_id=eq.${user.id}&select=*`, {
        headers: SB_HEADERS,
      });
      const rows: any[] = r.ok ? await r.json() : [];
      if (!rows[0]) return void res.status(404).json({ error: "No Gmail integration found" });
      // Gmail entries always land in the user's personal brain (see
      // gmailScan.getUserBrainId) so the caller's brain_id is no longer
      // honoured. Re-enrichment is targeted at the personal brain.
      try {
        const result = await scanGmailForUser(rows[0], true);
        return void res.status(200).json(result);
      } catch (e: any) {
        console.error("[gmail/scan]", e);
        return void res
          .status(500)
          .json({ error: String(e?.message ?? e), created: 0, entries: [], debug: null });
      }
    }

    if (req.method === "POST" && action === "delete-entries") {
      const { entryIds } = optionalBodyObject(req.body);
      if (!Array.isArray(entryIds) || entryIds.length === 0)
        return void res.status(400).json({ error: "entryIds required" });
      // Audit #6: validate UUIDs and cap length so a malicious client cannot
      // explode the URL or sneak operators past encodeURIComponent.
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const cleanIds = entryIds
        .filter((id): id is string => typeof id === "string" && uuidRe.test(id))
        .slice(0, 200);
      if (!cleanIds.length) return void res.status(400).json({ error: "entryIds must be UUIDs" });
      const ids = cleanIds.map((id: string) => encodeURIComponent(id)).join(",");
      await fetch(`${SB_URL}/rest/v1/entries?id=in.(${ids})&user_id=eq.${user.id}`, {
        method: "DELETE",
        headers: SB_HEADERS,
      });
      return void res.status(200).json({ ok: true, deleted: cleanIds.length });
    }

    if (req.method === "POST" && action === "deep-scan") {
      // §2.3: 3 deep-scans/min per user — more expensive than regular scan
      if (!(await rateLimit(req, 3, 60_000, `gmail-deep-scan:${user.id}`))) {
        return void res
          .status(429)
          .json({ error: "Too many deep-scan requests — wait a minute and try again." });
      }
      const r = await fetch(`${SB_URL}/rest/v1/gmail_integrations?user_id=eq.${user.id}&select=*`, {
        headers: SB_HEADERS,
      });
      const rows: any[] = r.ok ? await r.json() : [];
      if (!rows[0]) return void res.status(404).json({ error: "No Gmail integration found" });
      const { cursor, sinceMs } = optionalBodyObject(req.body);
      // Deep-scan output also locks to the personal brain — see
      // gmailScan.getUserBrainId. brain_id from body is ignored.
      const result = await deepScanBatch(rows[0], {
        cursor: typeof cursor === "string" ? cursor : undefined,
        sinceMs: typeof sinceMs === "number" ? sinceMs : Date.now() - 365 * 24 * 60 * 60 * 1000,
      });
      return void res.status(200).json(result);
    }

    // ── Pattern rules CRUD ────────────────────────────────────────────────
    // Backs the Settings → Patterns UI. All scoped to user_id; RLS guards
    // the table independently in case a request slips past withAuth.

    if (req.method === "GET" && action === "patterns-list") {
      // PostgREST does NOT accept SQL function calls (greatest/least/etc.)
      // inside `order=`. Fetch by created_at, sort by dominant score
      // client-side. Previous version returned 400 silently → UI showed 0
      // patterns even when rows existed.
      const r = await fetch(
        `${SB_URL}/rest/v1/gmail_pattern_rules?user_id=eq.${user.id}` +
          `&select=id,summary,example_subject,example_from,accept_score,reject_score,accept_hits,reject_hits,last_accept_at,last_reject_at,auto_accept_eligible_at,created_at,recent_matches,summary_distilled_at` +
          `&order=created_at.desc` +
          `&limit=200`,
        { headers: SB_HEADERS },
      );
      const rows: any[] = r.ok ? await r.json() : [];
      rows.sort((a, b) => {
        const aMax = Math.max(a.accept_score ?? 0, a.reject_score ?? 0);
        const bMax = Math.max(b.accept_score ?? 0, b.reject_score ?? 0);
        if (bMax !== aMax) return bMax - aMax;
        return (b.created_at || "").localeCompare(a.created_at || "");
      });
      return void res.status(200).json({ patterns: rows });
    }

    if (req.method === "DELETE" && action === "patterns-delete") {
      const { id } = req.query as Record<string, string>;
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!id || !uuidRe.test(id))
        return void res.status(400).json({ error: "valid pattern id required" });
      await fetch(
        `${SB_URL}/rest/v1/gmail_pattern_rules?id=eq.${encodeURIComponent(id)}&user_id=eq.${user.id}`,
        { method: "DELETE", headers: SB_HEADERS },
      );
      return void res.status(200).json({ ok: true });
    }

    if (req.method === "PATCH" && action === "patterns-update") {
      const body = optionalBodyObject(req.body);
      const id: unknown = body.id;
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (typeof id !== "string" || !uuidRe.test(id))
        return void res.status(400).json({ error: "valid pattern id required" });
      const patch: Record<string, unknown> = {};
      if (typeof body.summary === "string") patch.summary = body.summary.slice(0, 500);
      if (typeof body.accept_score === "number")
        patch.accept_score = Math.max(0, Math.min(10, Math.round(body.accept_score)));
      if (typeof body.reject_score === "number")
        patch.reject_score = Math.max(0, Math.min(10, Math.round(body.reject_score)));
      // Manual probation toggle: setting auto_accept_eligible_at to null
      // re-arms probation; setting it to "now" or a past ISO clears it.
      if (body.auto_accept_eligible_at === null) patch.auto_accept_eligible_at = null;
      else if (typeof body.auto_accept_eligible_at === "string")
        patch.auto_accept_eligible_at = body.auto_accept_eligible_at;
      if (Object.keys(patch).length === 0)
        return void res.status(400).json({ error: "no updatable fields supplied" });
      const r = await fetch(
        `${SB_URL}/rest/v1/gmail_pattern_rules?id=eq.${encodeURIComponent(id)}&user_id=eq.${user.id}`,
        {
          method: "PATCH",
          headers: { ...SB_HEADERS, Prefer: "return=minimal" },
          body: JSON.stringify(patch),
        },
      );
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        return void res.status(502).json({ error: `update failed: ${txt.slice(0, 200)}` });
      }
      return void res.status(200).json({ ok: true });
    }

    if (req.method === "POST" && action === "patterns-redistill") {
      // One-shot backfill: ask the LLM to rewrite each pattern's summary
      // into a generic label. Targets rows that haven't been distilled
      // (summary_distilled_at IS NULL) and have at least one example to
      // anchor on. Force=true bypasses the 2-sample minimum since the
      // existing rows pre-date recent_matches tracking.
      const idsRes = await fetch(
        `${SB_URL}/rest/v1/gmail_pattern_rules?user_id=eq.${user.id}` +
          `&summary_distilled_at=is.null` +
          `&example_subject=not.is.null` +
          `&select=id&limit=200`,
        { headers: SB_HEADERS },
      );
      if (!idsRes.ok) {
        return void res.status(502).json({ error: "failed to load patterns" });
      }
      const rows: Array<{ id: string }> = await idsRes.json();
      // Run in small parallel batches so a 200-pattern user doesn't
      // serialise N Gemini calls. Each is fire-and-forget at the row
      // level; we wait for the batch only to keep the response honest
      // about how many succeeded.
      const BATCH = 4;
      let processed = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        await Promise.all(
          batch.map((row) =>
            distillPatternSummary(row.id, { force: true }).catch((e) =>
              console.error("[patterns-redistill]", row.id, e),
            ),
          ),
        );
        processed += batch.length;
      }
      return void res.status(200).json({ ok: true, processed });
    }

    if (req.method === "POST" && action === "ignore") {
      const { subject, from, email_type, content_preview } = optionalBodyObject(req.body);
      const rule = await generateIgnoreRule(user.id, {
        subject: typeof subject === "string" ? subject : undefined,
        from: typeof from === "string" ? from : undefined,
        email_type: typeof email_type === "string" ? email_type : undefined,
        content_preview: typeof content_preview === "string" ? content_preview : undefined,
      });
      const intRes = await fetch(
        `${SB_URL}/rest/v1/gmail_integrations?user_id=eq.${user.id}&select=preferences`,
        { headers: SB_HEADERS },
      );
      const rows: any[] = intRes.ok ? await intRes.json() : [];
      if (!rows[0]) return void res.status(404).json({ error: "No Gmail integration found" });
      const prefs = rows[0].preferences ?? { categories: [], custom: "" };
      const existing = (prefs.custom ?? "").trim();
      const newCustom = existing ? `${existing}\n${rule}` : rule;
      await fetch(`${SB_URL}/rest/v1/gmail_integrations?user_id=eq.${user.id}`, {
        method: "PATCH",
        headers: SB_HEADERS,
        body: JSON.stringify({ preferences: { ...prefs, custom: newCustom } }),
      });
      return void res.status(200).json({ ok: true, rule });
    }

    return void res.status(405).json({ error: "Method not allowed" });
  },
);

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const action = (req.query.action as string) ?? "";
  if (action === "auth") {
    applySecurityHeaders(res);
    return handleAuth(req, res);
  }
  return authedHandler(req, res);
}
