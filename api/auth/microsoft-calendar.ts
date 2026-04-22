import type { ApiRequest, ApiResponse } from "../_lib/types";
import { applySecurityHeaders } from "../_lib/securityHeaders.js";
import { verifyAuth } from "../_lib/verifyAuth.js";

const SCOPES = "Calendars.Read User.Read offline_access";

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI ?? `${process.env.APP_URL}/api/auth/microsoft-callback`;

  if (!clientId) return res.status(500).json({ error: "Microsoft OAuth not configured. Set MICROSOFT_CLIENT_ID." });

  const state = Buffer.from(JSON.stringify({ userId: user.id })).toString("base64url");
  const tenantId = process.env.MICROSOFT_TENANT_ID ?? "common";

  const url = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("state", state);

  res.redirect(302, url.toString());
}
