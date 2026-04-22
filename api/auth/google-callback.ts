import type { ApiRequest, ApiResponse } from "../_lib/types";
import { applySecurityHeaders } from "../_lib/securityHeaders.js";

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { code, state, error } = req.query as Record<string, string>;
  const appUrl = process.env.APP_URL ?? "";

  if (error) return res.redirect(302, `${appUrl}/settings?calendarError=google_denied`);
  if (!code || !state) return res.redirect(302, `${appUrl}/settings?calendarError=missing_params`);

  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    userId = decoded.userId;
    if (!userId) throw new Error("no userId");
  } catch {
    return res.redirect(302, `${appUrl}/settings?calendarError=invalid_state`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? `${appUrl}/api/auth/google-callback`;

  /* Exchange code for tokens */
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });

  if (!tokenRes.ok) return res.redirect(302, `${appUrl}/settings?calendarError=token_exchange`);

  const tokens = await tokenRes.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  /* Get user email from Google */
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = profileRes.ok ? await profileRes.json() : {};

  /* Upsert into Supabase */
  await fetch(`${SB_URL}/rest/v1/calendar_integrations`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      user_id: userId,
      provider: "google",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
      calendar_email: profile.email ?? null,
    }),
  });

  res.redirect(302, `${appUrl}/settings?calendarConnected=google`);
}
