/**
 * GET  /api/calendar?action=events       → fetch merged Google+Microsoft events
 * GET  /api/calendar?action=integrations → list connected calendar accounts
 * DELETE /api/calendar                   → disconnect a provider (body: { provider })
 *
 * GET  /api/calendar-auth?provider=google            → initiate Google OAuth
 * GET  /api/calendar-auth?provider=google&code=...   → Google OAuth callback
 * GET  /api/calendar-auth?provider=microsoft          → initiate Microsoft OAuth
 * GET  /api/calendar-auth?provider=microsoft&code=... → Microsoft OAuth callback
 * (Routed via vercel.json rewrite: /api/calendar-auth → /api/calendar?action=auth)
 *
 * Register these redirect URIs in your OAuth apps:
 *   Google:    https://<your-domain>/api/calendar-auth?provider=google
 *   Microsoft: https://<your-domain>/api/calendar-auth?provider=microsoft
 */
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { verifyAuth } from "./_lib/verifyAuth.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SB_HEADERS = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");
const MICROSOFT_SCOPES = "Calendars.Read User.Read offline_access";

/* ── OAuth helpers ── */

function redirectUri(provider: string): string {
  const base = process.env.APP_URL ?? "";
  const custom = provider === "google" ? process.env.GOOGLE_REDIRECT_URI : process.env.MICROSOFT_REDIRECT_URI;
  return custom ?? `${base}/api/calendar-auth?provider=${provider}`;
}

function initiateGoogle(res: ApiResponse, userId: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "GOOGLE_CLIENT_ID not set" });
  const state = Buffer.from(JSON.stringify({ userId })).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri("google"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  res.redirect(302, url.toString());
}

async function callbackGoogle(req: ApiRequest, res: ApiResponse) {
  const appUrl = process.env.APP_URL ?? "";
  const { code, state, error } = req.query as Record<string, string>;
  if (error) return res.redirect(302, `${appUrl}/settings?calendarError=google_denied`);
  if (!code || !state) return res.redirect(302, `${appUrl}/settings?calendarError=missing_params`);

  let userId: string;
  try {
    userId = JSON.parse(Buffer.from(state, "base64url").toString()).userId;
    if (!userId) throw new Error();
  } catch {
    return res.redirect(302, `${appUrl}/settings?calendarError=invalid_state`);
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri("google"), grant_type: "authorization_code" }),
  });
  if (!tokenRes.ok) return res.redirect(302, `${appUrl}/settings?calendarError=token_exchange`);

  const tokens = await tokenRes.json();
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const profile = profileRes.ok ? await profileRes.json() : {};

  const dbRes = await fetch(`${SB_URL}/rest/v1/calendar_integrations`, {
    method: "POST",
    headers: { ...SB_HEADERS, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ user_id: userId, provider: "google", access_token: tokens.access_token, refresh_token: tokens.refresh_token, token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), calendar_email: profile.email ?? null }),
  });
  if (!dbRes.ok) return res.redirect(302, `${appUrl}/settings?calendarError=db_write_failed`);
  res.redirect(302, `${appUrl}/settings?calendarConnected=google`);
}

function initiateMicrosoft(res: ApiResponse, userId: string) {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "MICROSOFT_CLIENT_ID not set" });
  const tenantId = process.env.MICROSOFT_TENANT_ID ?? "common";
  const state = Buffer.from(JSON.stringify({ userId })).toString("base64url");
  const url = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri("microsoft"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", MICROSOFT_SCOPES);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("state", state);
  res.redirect(302, url.toString());
}

async function callbackMicrosoft(req: ApiRequest, res: ApiResponse) {
  const appUrl = process.env.APP_URL ?? "";
  const tenantId = process.env.MICROSOFT_TENANT_ID ?? "common";
  const { code, state, error } = req.query as Record<string, string>;
  if (error) return res.redirect(302, `${appUrl}/settings?calendarError=microsoft_denied`);
  if (!code || !state) return res.redirect(302, `${appUrl}/settings?calendarError=missing_params`);

  let userId: string;
  try {
    userId = JSON.parse(Buffer.from(state, "base64url").toString()).userId;
    if (!userId) throw new Error();
  } catch {
    return res.redirect(302, `${appUrl}/settings?calendarError=invalid_state`);
  }

  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.MICROSOFT_CLIENT_ID!, client_secret: process.env.MICROSOFT_CLIENT_SECRET!, redirect_uri: redirectUri("microsoft"), grant_type: "authorization_code", scope: MICROSOFT_SCOPES }),
  });
  if (!tokenRes.ok) return res.redirect(302, `${appUrl}/settings?calendarError=token_exchange`);

  const tokens = await tokenRes.json();
  const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const profile = profileRes.ok ? await profileRes.json() : {};

  const dbRes = await fetch(`${SB_URL}/rest/v1/calendar_integrations`, {
    method: "POST",
    headers: { ...SB_HEADERS, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ user_id: userId, provider: "microsoft", access_token: tokens.access_token, refresh_token: tokens.refresh_token, token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), calendar_email: profile.mail ?? profile.userPrincipalName ?? null }),
  });
  if (!dbRes.ok) return res.redirect(302, `${appUrl}/settings?calendarError=db_write_failed`);
  res.redirect(302, `${appUrl}/settings?calendarConnected=microsoft`);
}

async function handleAuth(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const { provider, code } = req.query as Record<string, string>;
  if (!provider || !["google", "microsoft"].includes(provider)) {
    return res.status(400).json({ error: "provider must be google or microsoft" });
  }
  if (code) {
    return provider === "google" ? callbackGoogle(req, res) : callbackMicrosoft(req, res);
  }
  const { token: queryToken } = req.query as Record<string, string>;
  if (queryToken && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${queryToken}`;
  }
  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  return provider === "google" ? initiateGoogle(res, user.id) : initiateMicrosoft(res, user.id);
}

/* ── Token refresh helpers ── */

async function refreshGoogle(integration: any): Promise<string | null> {
  if (new Date(integration.token_expires_at) > new Date(Date.now() + 60_000)) return integration.access_token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: integration.refresh_token, grant_type: "refresh_token" }),
  });
  if (!res.ok) return null;
  const t = await res.json();
  await fetch(`${SB_URL}/rest/v1/calendar_integrations?id=eq.${integration.id}`, {
    method: "PATCH",
    headers: SB_HEADERS,
    body: JSON.stringify({ access_token: t.access_token, token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() }),
  });
  return t.access_token;
}

async function refreshMicrosoft(integration: any): Promise<string | null> {
  if (new Date(integration.token_expires_at) > new Date(Date.now() + 60_000)) return integration.access_token;
  const tenantId = process.env.MICROSOFT_TENANT_ID ?? "common";
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.MICROSOFT_CLIENT_ID!, client_secret: process.env.MICROSOFT_CLIENT_SECRET!, refresh_token: integration.refresh_token, grant_type: "refresh_token", scope: "Calendars.Read User.Read offline_access" }),
  });
  if (!res.ok) return null;
  const t = await res.json();
  await fetch(`${SB_URL}/rest/v1/calendar_integrations?id=eq.${integration.id}`, {
    method: "PATCH",
    headers: SB_HEADERS,
    body: JSON.stringify({ access_token: t.access_token, token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() }),
  });
  return t.access_token;
}

async function fetchGoogleEvents(token: string): Promise<any[]> {
  const timeMin = new Date(Date.now() - 30 * 86400000).toISOString();
  const timeMax = new Date(Date.now() + 90 * 86400000).toISOString();
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "250");
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items ?? []).map((ev: any) => ({
    id: ev.id, title: ev.summary ?? "(no title)",
    start: ev.start?.dateTime ?? ev.start?.date,
    end: ev.end?.dateTime ?? ev.end?.date,
    allDay: !ev.start?.dateTime, provider: "google",
  }));
}

async function fetchMicrosoftEvents(token: string): Promise<any[]> {
  const start = new Date(Date.now() - 30 * 86400000).toISOString();
  const end = new Date(Date.now() + 90 * 86400000).toISOString();
  const url = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
  url.searchParams.set("startDateTime", start);
  url.searchParams.set("endDateTime", end);
  url.searchParams.set("$top", "250");
  url.searchParams.set("$select", "subject,start,end,isAllDay,id");
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.value ?? []).map((ev: any) => ({
    id: ev.id, title: ev.subject ?? "(no title)",
    start: ev.start?.dateTime ? `${ev.start.dateTime}Z` : ev.start?.dateTime,
    end: ev.end?.dateTime ? `${ev.end.dateTime}Z` : ev.end?.dateTime,
    allDay: ev.isAllDay ?? false, provider: "microsoft",
  }));
}

/* ── Main handler ── */
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);

  const action = (req.query.action as string) ?? "events";

  if (action === "auth") return handleAuth(req, res);

  const user = await verifyAuth(req);
  if (!user) return res.status(200).json({ events: [], integrations: [] });

  if (req.method === "DELETE") {
    const { provider } = req.body ?? {};
    if (!provider || !["google", "microsoft"].includes(provider)) {
      return res.status(400).json({ error: "Invalid provider" });
    }
    await fetch(`${SB_URL}/rest/v1/calendar_integrations?user_id=eq.${user.id}&provider=eq.${provider}`, {
      method: "DELETE",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  if (action === "integrations") {
    const r = await fetch(
      `${SB_URL}/rest/v1/calendar_integrations?user_id=eq.${user.id}&select=id,provider,calendar_email,sync_enabled`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
    );
    return res.status(200).json(r.ok ? await r.json() : []);
  }

  res.setHeader("Cache-Control", "private, max-age=300");
  const intRes = await fetch(
    `${SB_URL}/rest/v1/calendar_integrations?user_id=eq.${user.id}&sync_enabled=eq.true`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
  );
  if (!intRes.ok) return res.status(200).json({ events: [] });

  const integrations: any[] = await intRes.json();
  const allEvents: any[] = [];

  await Promise.all(integrations.map(async (int) => {
    try {
      if (int.provider === "google") {
        const token = await refreshGoogle(int);
        if (token) allEvents.push(...await fetchGoogleEvents(token));
      } else if (int.provider === "microsoft") {
        const token = await refreshMicrosoft(int);
        if (token) allEvents.push(...await fetchMicrosoftEvents(token));
      }
    } catch { /* skip failed provider */ }
  }));

  res.status(200).json({ events: allEvents });
}
