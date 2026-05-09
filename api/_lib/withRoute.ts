// withRoute — public/data-driven route wrapper (audit task 1314).
//
// Builds on withAuth / withApiKey by adding two capabilities the existing
// wrappers don't expose:
//
//   1. `auth: "public"` — runs the security-headers + method check + rate
//      limit chain WITHOUT requiring a Supabase JWT or em_ API key. Useful
//      for OAuth discovery / token endpoints that previously rolled their
//      own pre-auth path inline (see api/mcp.ts handler — the discovery
//      block at the top of that file).
//
//   2. Declarative `dispatch` — reduces the if-chain in handlers like
//      api/entries.ts (24+ branches at the top of the default export).
//      Each route is `{ method, action?, resource?, handle }`. The first
//      match wins; if no route matches and a `fallback` impl is supplied,
//      it runs.
//
// withRoute does not replace withAuth / withApiKey — those remain the
// stable entry points for endpoint-by-endpoint adoption. Phase 1 (this
// file) adds the wrapper and lets new endpoints opt in. Phase 2 will
// migrate existing endpoints that benefit (mcp.ts discovery routes,
// entries.ts dispatch).

import type { ApiRequest, ApiResponse } from "./types";
import { withAuth, withApiKey, ApiError, type HandlerContext } from "./withAuth.js";
import { applySecurityHeaders } from "./securityHeaders.js";
import { rateLimit } from "./rateLimit.js";
import { getReqId, createLogger } from "./logger.js";

export type RouteAuth = "user" | "apiKey" | "public";

export interface DispatchRule<Ctx> {
  /** HTTP method, e.g. "POST". Omit to match any method allowed by the route. */
  method?: string;
  /** Match req.query.action (e.g. "merge", "bulk-patch"). */
  action?: string;
  /** Match req.query.resource (e.g. "audit", "graph"). */
  resource?: string;
  /** Free-form predicate for cases the field-based matcher can't express. */
  when?: (req: ApiRequest) => boolean;
  /** Handler invoked on match. */
  handle: (ctx: Ctx) => Promise<void> | void;
}

export interface WithRouteOptions<Ctx> {
  auth: RouteAuth;
  methods?: string[];
  rateLimit?: number | ((req: ApiRequest) => number) | false;
  rateLimitKey?: (req: ApiRequest) => string | undefined;
  cacheControl?: string;
  dispatch?: ReadonlyArray<DispatchRule<Ctx>>;
  /** Catch-all when no dispatch rule matches. */
  fallback?: (ctx: Ctx) => Promise<void> | void;
}

function pickMatchingRule<Ctx>(
  rules: ReadonlyArray<DispatchRule<Ctx>> | undefined,
  req: ApiRequest,
): DispatchRule<Ctx> | undefined {
  if (!rules?.length) return undefined;
  const action = (req.query.action as string | undefined) ?? undefined;
  const resource = (req.query.resource as string | undefined) ?? undefined;
  for (const rule of rules) {
    if (rule.method && rule.method !== req.method) continue;
    if (rule.action !== undefined && rule.action !== action) continue;
    if (rule.resource !== undefined && rule.resource !== resource) continue;
    if (rule.when && !rule.when(req)) continue;
    return rule;
  }
  return undefined;
}

async function dispatchOrFallback<Ctx>(
  ctx: Ctx,
  req: ApiRequest,
  opts: WithRouteOptions<Ctx>,
): Promise<void> {
  const rule = pickMatchingRule(opts.dispatch, req);
  if (rule) {
    await rule.handle(ctx);
    return;
  }
  if (opts.fallback) {
    await opts.fallback(ctx);
    return;
  }
  throw new ApiError(404, "No route matched");
}

// ── User-auth variant ───────────────────────────────────────────────────────
export function withRouteUser(
  opts: Omit<WithRouteOptions<HandlerContext>, "auth">,
): (req: ApiRequest, res: ApiResponse) => Promise<void> {
  return withAuth(
    {
      methods: opts.methods,
      rateLimit: opts.rateLimit,
      rateLimitKey: opts.rateLimitKey,
      cacheControl: opts.cacheControl,
    },
    async (ctx) => dispatchOrFallback(ctx, ctx.req, { ...opts, auth: "user" }),
  );
}

// ── ApiKey-auth variant ─────────────────────────────────────────────────────
interface ApiKeyCtx {
  req: ApiRequest;
  res: ApiResponse;
  auth: { userId: string; keyId: string; brainId: string };
  log: ReturnType<typeof createLogger>;
  req_id: string;
}

export function withRouteApiKey(
  opts: Omit<WithRouteOptions<ApiKeyCtx>, "auth">,
): (req: ApiRequest, res: ApiResponse) => Promise<void> {
  return withApiKey(
    {
      methods: opts.methods,
      rateLimit: opts.rateLimit,
      rateLimitKey: opts.rateLimitKey,
      cacheControl: opts.cacheControl,
    },
    async (ctx) => dispatchOrFallback(ctx, ctx.req, { ...opts, auth: "apiKey" }),
  );
}

// ── Public (unauthenticated) variant ────────────────────────────────────────
// For OAuth discovery / health probes / static metadata endpoints. Still
// applies security headers, method check, and rate limit (default 60 rpm
// per IP) — just doesn't require a bearer.
export interface PublicCtx {
  req: ApiRequest;
  res: ApiResponse;
  log: ReturnType<typeof createLogger>;
  req_id: string;
}

export function withRoutePublic(
  opts: Omit<WithRouteOptions<PublicCtx>, "auth">,
): (req: ApiRequest, res: ApiResponse) => Promise<void> {
  return async (req, res) => {
    applySecurityHeaders(res);
    if (opts.cacheControl) res.setHeader("Cache-Control", opts.cacheControl);

    const req_id = getReqId(req);
    res.setHeader("x-request-id", req_id);

    const methods = opts.methods ?? ["GET"];
    if (!methods.includes(req.method || "")) {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const limitSpec = opts.rateLimit ?? 60;
    if (limitSpec !== false) {
      const limit = typeof limitSpec === "function" ? limitSpec(req) : limitSpec;
      const suffix = opts.rateLimitKey?.(req);
      const bucket = suffix ? `public:${suffix}` : "public";
      if (!(await rateLimit(req, limit, 60_000, bucket))) {
        res.status(429).json({ error: "Too many requests" });
        return;
      }
    }

    const log = createLogger(req_id);
    try {
      await dispatchOrFallback({ req, res, log, req_id }, req, { ...opts, auth: "public" });
    } catch (err) {
      if (err instanceof ApiError) {
        res.status(err.status).json({ error: err.publicMessage });
        return;
      }
      log.error("unhandled error in withRoutePublic", { err: String(err) });
      if (!(res as any).headersSent) {
        res.status(500).json({ error: "Internal Server Error" });
      }
    }
  };
}

// ── Convenience: single entry point that picks the variant by auth mode ────
export function withRoute(
  opts: WithRouteOptions<HandlerContext>,
): (req: ApiRequest, res: ApiResponse) => Promise<void>;
export function withRoute(
  opts: WithRouteOptions<ApiKeyCtx>,
): (req: ApiRequest, res: ApiResponse) => Promise<void>;
export function withRoute(
  opts: WithRouteOptions<PublicCtx>,
): (req: ApiRequest, res: ApiResponse) => Promise<void>;
export function withRoute(opts: WithRouteOptions<any>) {
  if (opts.auth === "user") return withRouteUser(opts as any);
  if (opts.auth === "apiKey") return withRouteApiKey(opts as any);
  return withRoutePublic(opts as any);
}
