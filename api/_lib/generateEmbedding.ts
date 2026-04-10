/**
 * Shared embedding generation logic.
 * Used by api/embed.ts, api/search.ts, and api/chat.ts.
 *
 * Supports:
 *   - OpenAI text-embedding-3-small at 768 dims (via `dimensions` param)
 *   - Google text-embedding-004 at 768 dims (native)
 *
 * Both return float[768], stored in the same vector(768) column.
 */

/**
 * Generate an embedding vector for a single text string.
 */
export async function generateEmbedding(text: string, provider: "openai" | "google" | "openrouter", apiKey: string, model?: string): Promise<number[]> {
  const truncated = String(text).slice(0, 8000);
  if (provider === "google") {
    return generateGoogleEmbedding(truncated, apiKey);
  }
  if (provider === "openrouter") {
    const modelId = model || "nvidia/llama-nemotron-embed-vl-1b-v2:free";
    return generateOpenRouterEmbedding([truncated], modelId, apiKey).then(vs => vs[0]);
  }
  return generateOpenAIEmbedding([truncated], apiKey).then(vs => vs[0]);
}

/**
 * Generate embeddings for multiple texts in one API call.
 */
export async function generateEmbeddingsBatch(texts: string[], provider: "openai" | "google" | "openrouter", apiKey: string, model?: string): Promise<number[][]> {
  const truncated = texts.map(t => String(t).slice(0, 8000));
  if (provider === "google") {
    return Promise.all(truncated.map(t => generateGoogleEmbedding(t, apiKey)));
  }
  if (provider === "openrouter") {
    const modelId = model || "nvidia/llama-nemotron-embed-vl-1b-v2:free";
    return generateOpenRouterEmbedding(truncated, modelId, apiKey);
  }
  return generateOpenAIEmbedding(truncated, apiKey);
}

/**
 * Build the text to embed for an entry (title + content + tags).
 */
export function buildEntryText(entry: { title?: string; content?: string; tags?: string[] }): string {
  return [
    entry.title,
    entry.content,
    (entry.tags || []).join(" "),
  ]
    .filter(Boolean)
    .join(" ");
}

async function generateOpenRouterEmbedding(inputs: string[], model: string, apiKey: string): Promise<number[][]> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: inputs, dimensions: 768 }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => String(res.status));
    throw new Error(`OpenRouter embedding error ${res.status}: ${err}`);
  }
  const data: any = await res.json();
  return data.data.map((d: any) => d.embedding as number[]);
}

async function generateOpenAIEmbedding(inputs: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: inputs,
      dimensions: 768,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => String(res.status));
    throw new Error(`OpenAI embedding error ${res.status}: ${err}`);
  }
  const data: any = await res.json();
  // data.data is sorted by index
  return data.data.map((d: any) => d.embedding);
}

const GOOGLE_EMBED_MODEL = "gemini-embedding-001";

async function generateGoogleEmbedding(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_EMBED_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${GOOGLE_EMBED_MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: 768,
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text().catch(() => String(res.status));
    throw new Error(`Google embedding error ${res.status}: ${err}`);
  }
  const data: any = await res.json();
  const values: number[] = data.embedding.values;
  if (values.length !== 768) {
    throw new Error(`${GOOGLE_EMBED_MODEL} returned ${values.length} dims, expected 768`);
  }
  return values;
}
