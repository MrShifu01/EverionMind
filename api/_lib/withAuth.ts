import type { ApiRequest, ApiResponse } from "./types";
import { applySecurityHeaders } from "./securityHeaders.js";
import { rateLimit } from "./rateLimit.js";
import { verifyAuth } from "./verifyAuth.js";
import { checkBrainAccess } from "./checkBrainAccess.js";
import { resolveApiKey } from "./resolveApiKey.js";
import { getReqId, createLogger, type Logger } from "./logger.js";

export class ApiError extends Error {
  constructor(public status: number, public publicMessage: string, public details?: unknown) {
    super(publicMessage);
    this.name = "ApiError";
  }
}

export interface AuthedUser {
  id: string;
  email?: string;
  aud?: string;
  role?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface HandlerContext {
  req: ApiRequest;
  res: ApiResponse;
  user: AuthedUser;
  log: Logger;
  req_id: string;
}

export interface WithAuthOptions {
  /** HTTP methods allowed (default ["POST"]). Request with other methods → 405. */
  methods?: string[];
  /**
   * Rate limit budget for this handler. Pass a number for a single budget,
   * or a function to compute per-request (e.g. different budgets per ?action=).
   * Pass false to skip the outer rate-limit (sub-handlers must call rateLimit themselves).
   */
  rateLimit?: number | ((req: ApiRequest) => number) | false;
  /** Cache-Control header to set (e.g. "no-store" or "private, max-age=60"). */
  cacheControl?: string;
}

type Impl = (ctx: HandlerContext) => Promise<void> | void;

/**
 * Wraps a handler with the standard middleware chain:
 *   apply security headers → check method → rate limit → verify auth → business logic
 *
 * Business logic may throw `ApiError` to short-circuit with a typed response.
 * Any other thrown error becomes a 500 with the body "Internal Server Error".
 */
export function withAuth(opts: WithAuthOptions, impl: Impl): (req: ApiRequest, res: ApiResponse) => Promise<void> {
  const methods = opts.methods ?? ["POST"];
  const limitSpec = opts.rateLimit ?? 30;

  return async (req, res) => {
    applySecurityHeaders(res);
    if (opts.cacheControl) res.setHeader("Cache-Control", opts.cacheControl);

    const req_id = getReqId(req);
    res.setHeader("x-request-id", req_id);

    if (!methods.includes(req.method || "")) {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      if (limitSpec !== false) {
        const limit = typeof limitSpec === "function" ? limitSpec(req) : limitSpec;
        if (!(await rateLimit(req, limit))) {
          res.status(429).json({ error: "Too many requests" });
          return;
        }
      }

      const user = await verifyAuth(req);
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const log = createLogger(req_id, { user_id: user.id });
      await impl({ req, res, user, log, req_id });
    } catch (err) {
      if (err instanceof ApiError) {
        res.status(err.status).json({ error: err.publicMessage });
        return;
      }
      const log = createLogger(req_id);
      log.error("unhandled error in withAuth", { err: String(err) });
      if (!(res as any).headersSent) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    }
  };
}

/**
 * Assert the authenticated user has access to the given brain. Throws ApiError(403) if not.
 * Pass an empty/invalid brainId → ApiError(400).
 */
export async function requireBrainAccess(userId: string, brainId: string | undefined | null): Promise<void> {
  if (!brainId || typeof brainId !== "string" || brainId.length > 100) {
    throw new ApiError(400, "Invalid brain_id");
  }
  const ok = await checkBrainAccess(userId, brainId);
  if (!ok) throw new ApiError(403, "Forbidden");
}

// ── API key auth variant ─────────────────────────────────────────────────────
// Used by endpoints authenticated via em_* personal API keys (v1, mcp, etc.)
// where the "identity" is (userId, keyId, brainId) rather than a Supabase user.

export interface ApiKeyContext {
  req: ApiRequest;
  res: ApiResponse;
  auth: { userId: string; keyId: string; brainId: string };
  log: Logger;
  req_id: string;
}

type ApiKeyImpl = (ctx: ApiKeyContext) => Promise<void> | void;

/**
 * Wraps a handler requiring Authorization: Bearer em_<key>.
 * Same middleware chain as withAuth, but the identity comes from resolveApiKey().
 */
export function withApiKey(
  opts: WithAuthOptions,
  impl: ApiKeyImpl,
): (req: ApiRequest, res: ApiResponse) => Promise<void> {
  const methods = opts.methods ?? ["POST"];
  const limitSpec = opts.rateLimit ?? 30;

  return async (req, res) => {
    applySecurityHeaders(res);
    if (opts.cacheControl) res.setHeader("Cache-Control", opts.cacheControl);

    const req_id = getReqId(req);
    res.setHeader("x-request-id", req_id);

    if (!methods.includes(req.method || "")) {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      if (limitSpec !== false) {
        const limit = typeof limitSpec === "function" ? limitSpec(req) : limitSpec;
        if (!(await rateLimit(req, limit))) {
          res.status(429).json({ error: "Too many requests" });
          return;
        }
      }

      const authHeader = (req.headers["authorization"] as string) ?? "";
      const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      if (!rawKey) {
        res.status(401).json({ error: "Missing Authorization header" });
        return;
      }

      const auth = await resolveApiKey(rawKey);
      if (!auth) {
        res.status(401).json({ error: "Invalid or revoked API key" });
        return;
      }

      const log = createLogger(req_id, { user_id: auth.userId, key_id: auth.keyId });
      await impl({ req, res, auth, log, req_id });
    } catch (err) {
      if (err instanceof ApiError) {
        res.status(err.status).json({ error: err.publicMessage });
        return;
      }
      if ((err as any)?.status) {
        res.status((err as any).status).json({ error: (err as any).message });
        return;
      }
      const log = createLogger(req_id);
      log.error("unhandled error in withApiKey", { err: String(err) });
      if (!(res as any).headersSent) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    }
  };
}
