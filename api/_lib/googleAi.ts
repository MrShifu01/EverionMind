const GOOGLE_AI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export function googleAiModelUrl(model: string, endpoint: string): string {
  return `${GOOGLE_AI_BASE}/models/${encodeURIComponent(model)}:${endpoint}`;
}

export function googleAiModelsUrl(params?: Record<string, string | number | boolean>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    qs.set(key, String(value));
  }
  const suffix = qs.toString();
  return `${GOOGLE_AI_BASE}/models${suffix ? `?${suffix}` : ""}`;
}

export function googleAiHeaders(
  apiKey: string,
  extra: HeadersInit = {},
): HeadersInit {
  return {
    ...headersToRecord(extra),
    "x-goog-api-key": apiKey,
  };
}

export async function googleAiFetch(
  apiKey: string,
  input: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: googleAiHeaders(apiKey, init.headers),
    signal: init.signal ?? timeoutSignal(timeoutMs),
  });
}

function timeoutSignal(timeoutMs: number): AbortSignal | undefined {
  if (timeoutMs <= 0) return undefined;
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    return (AbortSignal as unknown as { timeout(ms: number): AbortSignal }).timeout(timeoutMs);
  }
  return undefined;
}

function headersToRecord(headers: HeadersInit): Record<string, string> {
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([key, value]) => [key, value]));
  }
  return { ...headers };
}
