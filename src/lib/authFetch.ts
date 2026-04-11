import { supabase } from "./supabase";

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });

  // Auto-track embedding usage when backend reports it via header
  const embeddingHeader = response.headers.get("X-Embedding-Usage");
  if (embeddingHeader) {
    try {
      const { provider, model, count } = JSON.parse(embeddingHeader) as {
        provider: string;
        model: string;
        count: number;
      };
      import("./usageTracker")
        .then((m) => {
          m.recordUsage({
            date: new Date().toISOString().slice(0, 10),
            type: "embedding",
            provider,
            model,
            embeddingCount: count,
          });
        })
        .catch((err) => console.error("[authFetch] background refresh failed", err));
    } catch (err) {
      console.error("[authFetch]", err);
    }
  }

  return response;
}
