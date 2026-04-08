/**
 * Shared Supabase request header factories.
 * Single source of truth — imported by all api/* handlers.
 */

export function sbHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  };
}

/** Same as sbHeaders but without Content-Type — for GET/DELETE requests. */
export function sbHeadersNoContent(extra: Record<string, string> = {}): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  };
}
