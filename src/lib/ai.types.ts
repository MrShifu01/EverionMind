/**
 * Boundary types for AI responses.
 * Shape covers both Gemini (/api/llm, /api/chat) and internal responses.
 */

/** A single content block returned by the AI. */
export interface AIContentBlock {
  type?: string;
  text?: string;
}

/** Token accounting (varies by response format — read from here). */
export interface AIUsageBlock {
  input_tokens?: number;
  output_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
}

/**
 * Union shape covering Gemini and our internal `/api/chat` responses.
 * All fields are optional — the reader must handle missing values.
 */
export interface AIResponseBody {
  /** Content blocks (our normalized format). */
  content?: AIContentBlock[];
  /** Freeform text some internal endpoints return. */
  text?: string;
  /** Token usage. */
  usage?: AIUsageBlock;
  /** Error bag. */
  error?: string | { message?: string };
}

/** Persisted vault metadata returned by `GET /api/vault`. */
export interface VaultData {
  exists?: boolean;
  salt: string;
  verify_token: string;
  recovery_blob: string;
}

/** A secret entry after client-side decryption. */
export interface DecryptedSecret {
  title: string;
  content?: string;
  tags?: string[];
}
