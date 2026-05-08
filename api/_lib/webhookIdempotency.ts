// Provider-agnostic webhook event de-dup. Both LemonSqueezy and RevenueCat
// retry on non-2xx and transient network failures. We only mark an event
// processed after the side-effect succeeds, so a failed DB write can be
// retried by the provider instead of being permanently swallowed.
//
// Webhooks fail closed if Upstash is unavailable. Running payment side-effects
// without the dedupe layer is worse than returning 503 and letting providers
// retry.

const TTL_SECONDS = 7 * 24 * 60 * 60;

function config(namespace: string): { url: string; token: string } {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(`[webhookIdempotency:${namespace}] Upstash is required for webhooks`);
  }
  return { url, token };
}

function eventKey(namespace: "lemon" | "revenuecat", eventId: string): string {
  return `${namespace}:event:${eventId}`;
}

export async function hasWebhookEventBeenProcessed(
  namespace: "lemon" | "revenuecat",
  eventId: string,
): Promise<boolean> {
  const { url, token } = config(namespace);
  const key = eventKey(namespace, eventId);
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`[webhookIdempotency:${namespace}] Upstash GET HTTP ${res.status}`);
  }
  const data = (await res.json()) as { result?: string | null };
  return data?.result === "1";
}

export async function markWebhookEventSeen(
  namespace: "lemon" | "revenuecat",
  eventId: string,
): Promise<void> {
  const { url, token } = config(namespace);
  const key = eventKey(namespace, eventId);
  const res = await fetch(`${url}/set/${encodeURIComponent(key)}/1?ex=${TTL_SECONDS}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`[webhookIdempotency:${namespace}] Upstash SET HTTP ${res.status}`);
  }
}
