/**
 * Shared embedding generation logic.
 * Used by api/embed.js, api/search.js, and api/chat.js.
 *
 * Supports:
 *   - OpenAI text-embedding-3-small at 768 dims (via `dimensions` param)
 *   - Google text-embedding-004 at 768 dims (native)
 *
 * Both return float[768], stored in the same vector(768) column.
 */

/**
 * Generate an embedding vector for a single text string.
 * @param {string} text
 * @param {"openai"|"google"} provider
 * @param {string} apiKey
 * @returns {Promise<number[]>} float[768]
 */
export async function generateEmbedding(text, provider, apiKey) {
  const truncated = String(text).slice(0, 8000);
  if (provider === "google") {
    return generateGoogleEmbedding(truncated, apiKey);
  }
  return generateOpenAIEmbedding([truncated], apiKey).then(vs => vs[0]);
}

/**
 * Generate embeddings for multiple texts in one OpenAI API call.
 * Falls back to sequential Google calls for Google provider.
 * @param {string[]} texts
 * @param {"openai"|"google"} provider
 * @param {string} apiKey
 * @returns {Promise<number[][]>} array of float[768]
 */
export async function generateEmbeddingsBatch(texts, provider, apiKey) {
  const truncated = texts.map(t => String(t).slice(0, 8000));
  if (provider === "google") {
    return Promise.all(truncated.map(t => generateGoogleEmbedding(t, apiKey)));
  }
  return generateOpenAIEmbedding(truncated, apiKey);
}

/**
 * Build the text to embed for an entry (title + content + tags).
 */
export function buildEntryText(entry) {
  return [
    entry.title,
    entry.content,
    (entry.tags || []).join(" "),
  ]
    .filter(Boolean)
    .join(" ");
}

async function generateOpenAIEmbedding(inputs, apiKey) {
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
    const err = await res.text().catch(() => res.status);
    throw new Error(`OpenAI embedding error ${res.status}: ${err}`);
  }
  const data = await res.json();
  // data.data is sorted by index
  return data.data.map(d => d.embedding);
}

async function generateGoogleEmbedding(text, apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: { parts: [{ text }] } }),
    }
  );
  if (!res.ok) {
    const err = await res.text().catch(() => res.status);
    throw new Error(`Google embedding error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.embedding.values;
}
