/**
 * Client-side repository for /api/entries.
 *
 * Every call to /api/entries used to be assembled inline at the call site —
 * query-string building, response-shape normalization (array vs. {entries}),
 * and error handling were duplicated in 8+ places. This repository is the
 * single seam so callers never construct /api/entries URLs directly.
 */
import { authFetch } from "./authFetch";
import type { Entry } from "../types";

/** Server responds with either a raw array (legacy) or { entries: Entry[] }. Normalize to array. */
function normalizeList(data: unknown): Entry[] {
  if (Array.isArray(data)) return data as Entry[];
  if (data && typeof data === "object" && Array.isArray((data as any).entries)) {
    return (data as any).entries as Entry[];
  }
  return [];
}

interface ListOptions {
  brainId?: string;
  limit?: number;
  trash?: boolean;
  onError?: (status: number, body: string) => void;
}

export const entryRepo = {
  /**
   * List entries for a brain (or across brains if brainId omitted — used by settings/data-export).
   * Returns [] on error rather than throwing, matching the existing UI behavior.
   */
  async list(options: ListOptions = {}): Promise<Entry[]> {
    const params = new URLSearchParams();
    if (options.brainId) params.set("brain_id", options.brainId);
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    if (options.trash) params.set("trash", "true");

    const qs = params.toString();
    const url = qs ? `/api/entries?${qs}` : "/api/entries";

    try {
      const r = await authFetch(url);
      if (!r.ok) {
        if (options.onError) {
          const body = await r.text().catch(() => "");
          options.onError(r.status, body);
        }
        return [];
      }
      return normalizeList(await r.json());
    } catch {
      return [];
    }
  },

  /** Partial-update an entry. Server merges metadata. Returns true if the patch succeeded. */
  async patch(
    id: string,
    changes: Partial<Entry> & { metadata?: Record<string, unknown> },
  ): Promise<boolean> {
    try {
      const r = await authFetch("/api/entries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...changes }),
      });
      return r.ok;
    } catch {
      return false;
    }
  },

  /** Restore a trashed entry. */
  async restore(id: string): Promise<boolean> {
    try {
      const r = await authFetch("/api/entries?action=restore", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      return r.ok;
    } catch {
      return false;
    }
  },

  /** Permanently delete a trashed entry (no undo). */
  async deletePermanent(id: string): Promise<boolean> {
    try {
      const r = await authFetch("/api/entries?permanent=true", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      return r.ok;
    } catch {
      return false;
    }
  },

  /** Permanently delete every trashed entry for the authed user. */
  async emptyTrash(): Promise<boolean> {
    try {
      const r = await authFetch("/api/entries?action=empty-trash", { method: "POST" });
      return r.ok;
    } catch {
      return false;
    }
  },
};
