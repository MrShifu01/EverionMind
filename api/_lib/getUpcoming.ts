/**
 * Shared "upcoming entries" query — entries whose metadata holds a date
 * (due_date / deadline / expiry_date / event_date) within `days` from today.
 *
 * Previously inlined in three places (memory-api, mcp, llm) with subtle
 * divergence — memory-api was missing the `type=neq.secret` filter, which
 * could leak vault entries through GET /api/memory/upcoming.
 */

import { sbHeadersNoContent } from "./sbHeaders.js";

const SB_URL = process.env.SUPABASE_URL!;

export const UPCOMING_DATE_FIELDS = [
  "due_date",
  "deadline",
  "expiry_date",
  "event_date",
] as const;

export interface UpcomingEntry {
  id: string;
  title: string | null;
  type: string | null;
  tags: string[] | null;
  content: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
  /** The date field this row matched on. Useful for UI grouping. */
  _date_field: (typeof UPCOMING_DATE_FIELDS)[number];
}

export interface UpcomingResult {
  entries: UpcomingEntry[];
  days: number;
  from: string;
  to: string;
}

/**
 * Returns entries with at least one of the four date fields between today and
 * `today + days`, deduplicated by id, sorted by earliest matching date.
 *
 * Always excludes type=secret to keep vault entries out of upcoming views,
 * regardless of the calling endpoint.
 */
export async function getUpcomingEntries(
  brainId: string,
  days: number,
): Promise<UpcomingResult> {
  const safeDays = Math.min(Math.max(1, days), 365);
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + safeDays * 86400000)
    .toISOString()
    .slice(0, 10);

  const fetches = await Promise.all(
    UPCOMING_DATE_FIELDS.map(async (field) => {
      const params = new URLSearchParams({
        brain_id: `eq.${brainId}`,
        deleted_at: "is.null",
        type: "neq.secret",
        [`metadata->>${field}`]: `gte.${today}`,
        select: "id,title,type,tags,content,metadata,created_at",
        limit: "100",
      });
      const url = `${SB_URL}/rest/v1/entries?${params.toString()}&metadata->>${field}=lte.${future}`;
      const r = await fetch(url, { headers: sbHeadersNoContent() });
      if (!r.ok) return [] as UpcomingEntry[];
      const rows: any[] = await r.json();
      return rows.map((e) => ({ ...e, _date_field: field }) as UpcomingEntry);
    }),
  );

  const seen = new Set<string>();
  const merged: UpcomingEntry[] = [];
  for (const rows of fetches) {
    for (const row of rows) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        merged.push(row);
      }
    }
  }
  merged.sort((a, b) => {
    const aDate =
      UPCOMING_DATE_FIELDS.map((f) => a.metadata?.[f])
        .filter(Boolean)
        .sort()[0] ?? "9999";
    const bDate =
      UPCOMING_DATE_FIELDS.map((f) => b.metadata?.[f])
        .filter(Boolean)
        .sort()[0] ?? "9999";
    return aDate.localeCompare(bDate);
  });

  return { entries: merged, days: safeDays, from: today, to: future };
}
