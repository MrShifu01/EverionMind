import { callAI } from "./ai";
import { authFetch } from "./authFetch";
import { PROMPTS } from "../config/prompts";
import { getEmbedHeaders } from "./aiFetch";
import type { Entry, Link } from "../types";

interface ConnectionCandidate {
  id: string;
  title: string;
  type: string;
  tags?: string[];
  content: string;
}

interface RawConnection {
  from: string;
  to: string;
  rel: string;
}

/** Simple fuzzy title similarity score 0–100 */
export function scoreTitle(a: string, b: string): number {
  if (!a || !b) return 0;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return 100;
  const wordsA = new Set(na.split(/\s+/));
  const wordsB = nb.split(/\s+/);
  const shared = wordsB.filter((w) => wordsA.has(w)).length;
  return Math.round((shared / Math.max(wordsA.size, wordsB.length)) * 100);
}

export async function findConnections(
  newEntry: Entry,
  existingEntries: Entry[],
  existingLinks: Array<{ from: string; to: string } | Link>,
  brainId?: string,
): Promise<RawConnection[]> {
  let candidates: ConnectionCandidate[] | undefined;

  const embedHeaders = getEmbedHeaders();
  if (embedHeaders && brainId) {
    try {
      const query = [newEntry.title, newEntry.content, (newEntry.tags || []).join(" ")]
        .filter(Boolean)
        .join(" ")
        .slice(0, 500);
      const res = await authFetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...embedHeaders },
        body: JSON.stringify({ query, brain_id: brainId, limit: 20 }),
      });
      if (res.ok) {
        const similar: Entry[] = await res.json();
        candidates = similar
          .filter((e) => e.id !== newEntry.id)
          .map((e) => ({
            id: e.id,
            title: e.title,
            type: e.type,
            tags: e.tags,
            content: (e.content || "").slice(0, 120),
          }));
      }
    } catch {
      // fall through to random-50 below
    }
  }

  if (!candidates) {
    candidates = existingEntries
      .filter((e) => e.id !== newEntry.id)
      .slice(0, 50)
      .map((e) => ({
        id: e.id,
        title: e.title,
        type: e.type,
        tags: e.tags,
        content: (e.content || "").slice(0, 120),
      }));
  }

  if (candidates.length === 0) return [];

  const existingKeys = new Set(
    existingLinks.map((l) => {
      const from = "from_id" in l ? l.from_id : (l as { from: string }).from;
      const to = "to_id" in l ? l.to_id : (l as { to: string }).to;
      return `${from}-${to}`;
    }),
  );
  try {
    const res = await callAI({
      max_tokens: 600,
      system: PROMPTS.CONNECTION_FINDER,
      brainId,
      messages: [
        {
          role: "user",
          content: `NEW ENTRY:\n${JSON.stringify({ id: newEntry.id, title: newEntry.title, type: newEntry.type, content: newEntry.content, tags: newEntry.tags })}\n\nEXISTING ENTRIES:\n${JSON.stringify(candidates)}`,
        },
      ],
    });
    const data = await res.json();
    const raw = (data.content?.[0]?.text || "[]").replace(/```json|```/g, "").trim();
    const parsed: RawConnection[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l) =>
        l.from &&
        l.to &&
        l.rel &&
        candidates!.some((c) => c.id === l.to) &&
        !existingKeys.has(`${l.from}-${l.to}`) &&
        !existingKeys.has(`${l.to}-${l.from}`),
    );
  } catch {
    return [];
  }
}
