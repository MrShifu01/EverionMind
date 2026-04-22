import type { ApiRequest, ApiResponse } from "../_lib/types";
import { applySecurityHeaders } from "../_lib/securityHeaders.js";
import { verifyAuth } from "../_lib/verifyAuth.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function refreshGoogleToken(integration: any): Promise<string | null> {
  if (new Date(integration.token_expires_at) > new Date(Date.now() + 60_000)) {
    return integration.access_token;
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: integration.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const tokens = await res.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await fetch(`${SB_URL}/rest/v1/calendar_integrations?id=eq.${integration.id}`, {
    method: "PATCH",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: tokens.access_token, token_expires_at: expiresAt }),
  });
  return tokens.access_token;
}

async function refreshMicrosoftToken(integration: any): Promise<string | null> {
  if (new Date(integration.token_expires_at) > new Date(Date.now() + 60_000)) {
    return integration.access_token;
  }
  const tenantId = process.env.MICROSOFT_TENANT_ID ?? "common";
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: integration.refresh_token,
      grant_type: "refresh_token",
      scope: "Calendars.Read User.Read offline_access",
    }),
  });
  if (!res.ok) return null;
  const tokens = await res.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await fetch(`${SB_URL}/rest/v1/calendar_integrations?id=eq.${integration.id}`, {
    method: "PATCH",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: tokens.access_token, token_expires_at: expiresAt }),
  });
  return tokens.access_token;
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
    id: ev.id,
    title: ev.summary ?? "(no title)",
    start: ev.start?.dateTime ?? ev.start?.date,
    end: ev.end?.dateTime ?? ev.end?.date,
    allDay: !ev.start?.dateTime,
    provider: "google",
  }));
}

async function fetchMicrosoftEvents(token: string): Promise<any[]> {
  const startDateTime = new Date(Date.now() - 30 * 86400000).toISOString();
  const endDateTime = new Date(Date.now() + 90 * 86400000).toISOString();
  const url = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
  url.searchParams.set("startDateTime", startDateTime);
  url.searchParams.set("endDateTime", endDateTime);
  url.searchParams.set("$top", "250");
  url.searchParams.set("$select", "subject,start,end,isAllDay,id");
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.value ?? []).map((ev: any) => ({
    id: ev.id,
    title: ev.subject ?? "(no title)",
    start: ev.start?.dateTime ? `${ev.start.dateTime}Z` : ev.start?.dateTime,
    end: ev.end?.dateTime ? `${ev.end.dateTime}Z` : ev.end?.dateTime,
    allDay: ev.isAllDay ?? false,
    provider: "microsoft",
  }));
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  res.setHeader("Cache-Control", "private, max-age=300");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyAuth(req);
  if (!user) return res.status(200).json({ events: [] }); // graceful: return empty for unauthenticated

  const intRes = await fetch(
    `${SB_URL}/rest/v1/calendar_integrations?user_id=eq.${user.id}&sync_enabled=eq.true`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
  );
  if (!intRes.ok) return res.status(200).json({ events: [] });

  const integrations: any[] = await intRes.json();
  const allEvents: any[] = [];

  await Promise.all(
    integrations.map(async (integration) => {
      try {
        if (integration.provider === "google") {
          const token = await refreshGoogleToken(integration);
          if (token) allEvents.push(...(await fetchGoogleEvents(token)));
        } else if (integration.provider === "microsoft") {
          const token = await refreshMicrosoftToken(integration);
          if (token) allEvents.push(...(await fetchMicrosoftEvents(token)));
        }
      } catch {
        // skip failed provider — don't break the whole response
      }
    }),
  );

  res.status(200).json({ events: allEvents });
}
