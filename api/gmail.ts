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
import {
  type GmailPreferences,
  defaultPreferences,
  scanGmailForUser,
} from "./_lib/gmailScan.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SB_HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

const GMAIL_SCOPE = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

function gmailRedirectUri(): string {
  return process.env.GMAIL_REDIRECT_URI ?? `${process.env.APP_URL ?? ""}/api/gmail-auth?provider=google`;
}

/* ── OAuth ── */

function initiateGoogle(res: ApiResponse, userId: string, preferences: GmailPreferences) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "GOOGLE_CLIENT_ID not set" });
  const state = Buffer.from(JSON.stringify({ userId, preferences })).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", gmailRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  res.redirect(302, url.toString());
}

async function callbackGoogle(req: ApiRequest, res: ApiResponse) {
  const appUrl = process.env.APP_URL ?? "";
  const { code, state, error } = req.query as Record<string, string>;
  if (error) return res.redirect(302, `${appUrl}/settings?gmailError=google_denied`);
  if (!code || !state) return res.redirect(302, `${appUrl}/settings?gmailError=missing_params`);

  let userId: string;
  let preferences: GmailPreferences;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    userId = decoded.userId;
    preferences = decoded.preferences ?? defaultPreferences();
    if (!userId) throw new Error("missing userId");
  } catch {
    return res.redirect(302, `${appUrl}/settings?gmailError=invalid_state`);
  }

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
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      gmail_email: profile.email ?? null,
      preferences,
    }),
  });
  if (!dbRes.ok) return res.redirect(302, `${appUrl}/settings?gmailError=db_write_failed`);
  res.redirect(302, `${appUrl}/settings?gmailConnected=true`);
}

async function handleAuth(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const { provider, code } = req.query as Record<string, string>;
  if (provider !== "google") return res.status(400).json({ error: "Only google provider supported" });
  if (code) return callbackGoogle(req, res);

  let preferences: GmailPreferences;
  try {
    preferences = JSON.parse(decodeURIComponent((req.query.prefs as string) ?? ""));
  } catch {
    preferences = defaultPreferences();
  }

  const { token: queryToken } = req.query as Record<string, string>;
  if (queryToken && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${queryToken}`;
  }
  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  return initiateGoogle(res, user.id, preferences);
}

/* ── Main handler ── */

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);

  const action = (req.query.action as string) ?? "";

  if (action === "auth") return handleAuth(req, res);

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "DELETE") {
    await fetch(`${SB_URL}/rest/v1/gmail_integrations?user_id=eq.${user.id}`, {
      method: "DELETE",
      headers: SB_HEADERS,
    });
    return res.status(200).json({ ok: true });
  }

  if (req.method === "GET" && action === "integration") {
    const r = await fetch(
      `${SB_URL}/rest/v1/gmail_integrations?user_id=eq.${user.id}&select=id,gmail_email,scan_enabled,last_scanned_at,preferences`,
      { headers: SB_HEADERS },
    );
    const rows: any[] = r.ok ? await r.json() : [];
    return res.status(200).json(rows[0] ?? null);
  }

  if (req.method === "PUT" && action === "preferences") {
    const { preferences } = req.body ?? {};
    if (!preferences) return res.status(400).json({ error: "preferences required" });
    await fetch(`${SB_URL}/rest/v1/gmail_integrations?user_id=eq.${user.id}`, {
      method: "PATCH",
      headers: SB_HEADERS,
      body: JSON.stringify({ preferences }),
    });
    return res.status(200).json({ ok: true });
  }

  if (req.method === "POST" && action === "scan") {
    const r = await fetch(
      `${SB_URL}/rest/v1/gmail_integrations?user_id=eq.${user.id}&select=*`,
      { headers: SB_HEADERS },
    );
    const rows: any[] = r.ok ? await r.json() : [];
    if (!rows[0]) return res.status(404).json({ error: "No Gmail integration found" });
    const result = await scanGmailForUser(rows[0]);
    return res.status(200).json(result);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
