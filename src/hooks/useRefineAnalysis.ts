import { useState, useCallback, useEffect } from "react";
import { authFetch } from "../lib/authFetch";
import { callAI } from "../lib/ai";
import { PROMPTS } from "../config/prompts";
import { recordDecision } from "../lib/learningEngine";
import { computeCompletenessScore } from "../lib/completenessScore";
import type { Entry, Brain } from "../types";

interface EntrySuggestion {
  type: string;
  entryId: string;
  entryTitle?: string;
  field: string;
  currentValue?: string;
  suggestedValue: string;
  reason: string;
}

interface LinkSuggestion {
  type: "LINK_SUGGESTED";
  fromId: string;
  toId: string;
  fromTitle?: string;
  toTitle?: string;
  rel: string;
  reason: string;
}

interface WeakLabelSuggestion {
  type: "WEAK_LABEL";
  fromId: string;
  toId: string;
  fromTitle?: string;
  toTitle?: string;
  currentRel: string;
  rel: string;
  reason: string;
}

type RefineSuggestion = EntrySuggestion | LinkSuggestion | WeakLabelSuggestion;

interface RefineLink {
  from: string;
  to: string;
  rel?: string;
  similarity?: number;
}

// ─── Priority weights (higher = shown first) ───────────────────────────────

export const PRIORITY_WEIGHTS: Record<string, number> = {
  SENSITIVE_DATA: 10,
  MERGE_SUGGESTED: 9,
  STALE_REMINDER: 8,
  DEAD_URL: 7,
  DUPLICATE_ENTRY: 7,
  TYPE_MISMATCH: 6,
  PHONE_FOUND: 5,
  EMAIL_FOUND: 5,
  DATE_FOUND: 5,
  LINK_SUGGESTED: 4,
  CLUSTER_SUGGESTED: 4,
  CONTENT_WEAK: 3,
  TAG_SUGGESTED: 2,
  TITLE_POOR: 2,
  ORPHAN_DETECTED: 2,
  SPLIT_SUGGESTED: 2,
  GAP_DETECTED: 1,
  URL_FOUND: 1,
  WEAK_LABEL: 1,
};

export function sortBySuggestionPriority<T extends { type: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => (PRIORITY_WEIGHTS[b.type] ?? 0) - (PRIORITY_WEIGHTS[a.type] ?? 0),
  );
}

// ─── Pure detection functions (no AI, no side-effects) ─────────────────────

export function detectOrphans(
  entries: Entry[],
  links: Array<{ from: string; to: string }>,
): EntrySuggestion[] {
  const linked = new Set(links.flatMap((l) => [l.from, l.to]));
  return entries
    .filter((e) => !e.encrypted && !linked.has(e.id) && !(e.tags && e.tags.length > 0))
    .map((e) => ({
      type: "ORPHAN_DETECTED",
      entryId: e.id,
      entryTitle: e.title,
      field: "tags",
      currentValue: "",
      suggestedValue: "",
      reason: "No links and no tags — Accept to auto-generate tags",
    }));
}

export function detectStaleReminders(entries: Entry[]): EntrySuggestion[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return entries
    .filter((e) => {
      if (e.encrypted) return false;
      const due = e.metadata?.due_date;
      if (!due) return false;
      const d = new Date(due as string);
      return !isNaN(d.getTime()) && d < today;
    })
    .map((e) => ({
      type: "STALE_REMINDER",
      entryId: e.id,
      entryTitle: e.title,
      field: "metadata.due_date",
      currentValue: e.metadata?.due_date as string | undefined,
      suggestedValue: "",
      reason: `Due date ${e.metadata?.due_date} is in the past — update or archive`,
    }));
}

export async function checkDeadUrls(entries: Entry[]): Promise<EntrySuggestion[]> {
  const candidates = entries.filter(
    (e) => !e.encrypted && e.metadata?.url && typeof e.metadata.url === "string",
  );
  if (candidates.length === 0) return [];

  const results = await Promise.all(
    candidates.map(async (e) => {
      const url = e.metadata!.url as string;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        await fetch(url, { method: "HEAD", mode: "no-cors", signal: controller.signal });
        clearTimeout(timeout);
        return null; // opaque response = probably alive
      } catch {
        return {
          type: "DEAD_URL",
          entryId: e.id,
          entryTitle: e.title,
          field: "metadata.url",
          currentValue: url,
          suggestedValue: "",
          reason: "URL appears unreachable — check or remove it",
        } as EntrySuggestion;
      }
    }),
  );

  return results.filter((r): r is EntrySuggestion => r !== null);
}

function deltaKey(brainId: string) {
  return `refine_last_scan_${brainId}`;
}
function suggestionsKey(brainId: string) {
  return `refine_suggestions_${brainId}`;
}
function dismissedKey(brainId: string) {
  return `refine_dismissed_${brainId}`;
}
function acceptedKey(brainId: string) {
  return `refine_accepted_${brainId}`;
}

export function getChangedEntries(entries: Entry[], lastScannedAt: string | null): Entry[] {
  if (!lastScannedAt) return entries;
  const cutoff = new Date(lastScannedAt).getTime();
  return entries.filter((e) => {
    if (!e.updated_at) return true;
    return new Date(e.updated_at).getTime() > cutoff;
  });
}

const WEAK_LABELS = new Set([
  "relates to",
  "related",
  "related to",
  "similar",
  "connected",
  "linked",
  "link",
  "connection",
]);

export function findWeakLinks(links: RefineLink[]): RefineLink[] {
  return links.filter((l) => l.rel && WEAK_LABELS.has(l.rel.toLowerCase().trim()));
}

export function normalizeName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

export function findNameCandidates(entries: Entry[]): [Entry, Entry][] {
  const eligible = entries.filter((e) => !e.encrypted && e.title && e.title.length >= 3);
  const pairs: [Entry, Entry][] = [];
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = normalizeName(eligible[i].title);
      const b = normalizeName(eligible[j].title);
      const tokensA = new Set(a.split(/\s+/).filter((t) => t.length >= 3));
      const tokensB = new Set(b.split(/\s+/).filter((t) => t.length >= 3));
      const shared = [...tokensA].filter((t) => tokensB.has(t));
      const meaningful = shared.filter((t) => t.length >= 5);
      if (shared.length >= 2 || meaningful.length >= 1) {
        pairs.push([eligible[i], eligible[j]]);
      }
    }
  }
  return pairs;
}

interface ClusterInfo {
  sharedTags: string[];
  memberIds: string[];
}

export function detectClusters(entries: Entry[], links: RefineLink[]): ClusterInfo[] {
  const clusters: ClusterInfo[] = [];
  const seen = new Set<string>();

  // Tag-based: tags shared by 3+ entries
  const tagToEntries: Record<string, string[]> = {};
  for (const e of entries) {
    for (const tag of e.tags || []) {
      if (!tagToEntries[tag]) tagToEntries[tag] = [];
      tagToEntries[tag].push(e.id);
    }
  }
  for (const [, ids] of Object.entries(tagToEntries).filter(([, ids]) => ids.length >= 3)) {
    const sorted = [...ids].sort();
    const key = sorted.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    const sharedTags = Object.entries(tagToEntries)
      .filter(([, members]) => sorted.every((id) => members.includes(id)))
      .map(([t]) => t);
    clusters.push({ sharedTags, memberIds: sorted });
  }

  // Link-density: triangles of 3+ mutually connected entries
  const adjacency: Record<string, Set<string>> = {};
  for (const l of links) {
    if (!adjacency[l.from]) adjacency[l.from] = new Set();
    if (!adjacency[l.to]) adjacency[l.to] = new Set();
    adjacency[l.from].add(l.to);
    adjacency[l.to].add(l.from);
  }
  for (const e of entries) {
    const neighbors = [...(adjacency[e.id] || [])];
    if (neighbors.length < 2) continue;
    const clique = [e.id, ...neighbors.filter((n) => (adjacency[n] || new Set()).has(e.id))];
    if (clique.length >= 3) {
      const key = [...clique].sort().join(",");
      if (!seen.has(key)) {
        seen.add(key);
        clusters.push({ sharedTags: [], memberIds: [...clique].sort() });
      }
    }
  }

  return clusters;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function extractJSON(text: string): string {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.search(/[{[]/);
  if (start === -1) return cleaned;
  const opener = cleaned[start];
  const closer = opener === "[" ? "]" : "}";
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === opener) depth++;
    else if (cleaned[i] === closer && --depth === 0) return cleaned.slice(start, i + 1);
  }
  return cleaned;
}

// ─── Rate-limit helper ───────────────────────────────────────────────────
let lastCallTime = 0;
async function throttledCallAI(opts: Parameters<typeof callAI>[0], minGap = 1500) {
  const now = Date.now();
  const wait = Math.max(0, minGap - (now - lastCallTime));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallTime = Date.now();
  return callAI(opts);
}

// ─── Hook ──────────────────────────────────────────────────────────────────

interface UseRefineAnalysisOptions {
  entries: Entry[];
  links?: RefineLink[];
  activeBrain: Brain | null;
  setEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  addLinks?: (links: Array<{ from: string; to: string; rel: string }>) => void;
}

export function useRefineAnalysis({
  entries,
  links,
  activeBrain,
  setEntries,
  addLinks,
}: UseRefineAnalysisOptions) {
  const brainId = activeBrain?.id ?? "default";

  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<RefineSuggestion[] | null>(() => {
    try {
      const raw = sessionStorage.getItem(suggestionsKey(activeBrain?.id ?? "default"));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem(dismissedKey(activeBrain?.id ?? "default"));
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [accepted, setAccepted] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem(acceptedKey(activeBrain?.id ?? "default"));
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [applying, setApplying] = useState<Set<string>>(new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Persist suggestions and dismissed across page refreshes
  useEffect(() => {
    if (suggestions === null) return;
    try {
      sessionStorage.setItem(suggestionsKey(brainId), JSON.stringify(suggestions));
    } catch {
      /* quota */
    }
  }, [suggestions, brainId]);

  useEffect(() => {
    try {
      sessionStorage.setItem(dismissedKey(brainId), JSON.stringify([...dismissed]));
    } catch {
      /* quota */
    }
  }, [dismissed, brainId]);

  useEffect(() => {
    try {
      sessionStorage.setItem(acceptedKey(brainId), JSON.stringify([...accepted]));
    } catch {
      /* quota */
    }
  }, [accepted, brainId]);

  const analyze = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setSuggestions(null);
    setDismissed(new Set());
    setAccepted(new Set());
    setEditingKey(null);
    try {
      sessionStorage.removeItem(suggestionsKey(brainId));
      sessionStorage.removeItem(dismissedKey(brainId));
      sessionStorage.removeItem(acceptedKey(brainId));
    } catch {
      /* ignore */
    }

    // Score any unscored entries client-side and persist via API
    const unscored = entries.filter(
      (e) => !e.encrypted && typeof (e.metadata as any)?.completeness_score !== "number",
    );
    for (const e of unscored) {
      const score = computeCompletenessScore(e);
      const newMeta = { ...(e.metadata || {}), completeness_score: score };
      e.metadata = newMeta;
      authFetch("/api/update-entry", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.id, metadata: newMeta }),
      }).catch(() => {});
    }

    // Sort entries by completeness score (lowest first) — pick 3 weakest for AI
    const scoredEntries = entries
      .filter((e) => !e.encrypted)
      .sort(
        (a, b) =>
          ((a.metadata as any)?.completeness_score ?? 0) -
          ((b.metadata as any)?.completeness_score ?? 0),
      );
    const weakest3 = scoredEntries.slice(0, 3);

    const existingLinkKeys = new Set((links || []).map((l: RefineLink) => `${l.from}-${l.to}`));

    // Pure logic checks (no AI needed)
    const orphanSuggestions = detectOrphans(entries, links || []);
    const staleSuggestions = detectStaleReminders(entries);
    const deadUrlSuggestions = await checkDeadUrls(entries);

    // ─── SINGLE AI CALL: entry audit + link suggestions + gap detection ───
    let entrySuggestions: RefineSuggestion[] = [];
    let linkSuggestions: RefineSuggestion[] = [];
    let gapSuggestions: EntrySuggestion[] = [];

    const brainType = activeBrain?.type || "personal";
    const brainContext =
      brainType === "family"
        ? "family shared knowledge base"
        : brainType === "business"
          ? "business knowledge base"
          : "personal knowledge base";

    const weakSlim = weakest3.map((e: Entry) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      content: (e.content || "").slice(0, 400),
      metadata: e.metadata || {},
      tags: e.tags || [],
    }));
    const allSlim = entries
      .filter((e) => !e.encrypted)
      .slice(0, 40)
      .map(
        (e: Entry) => `- [${e.type}] ${e.title} (id:${e.id}): ${(e.content || "").slice(0, 100)}`,
      );

    const userMessage = `WEAKEST ENTRIES TO AUDIT:\n${JSON.stringify(weakSlim)}\n\nALL ENTRIES (${entries.length} total, for link/gap analysis):\n${allSlim.join("\n")}\n\nEXISTING LINKS (do NOT re-suggest):\n${JSON.stringify([...existingLinkKeys])}`;

    try {
      const res = await throttledCallAI({
        task: "refine",
        max_tokens: 2000,
        system: `Today's date is ${new Date().toISOString().slice(0, 10)}. Brain type: ${brainContext}. ${PROMPTS.COMBINED_AUDIT}`,
        brainId: activeBrain?.id,
        messages: [{ role: "user", content: userMessage }],
      });
      const data = await res.json();
      const raw = extractJSON(data.content?.[0]?.text || "{}");
      try {
        const p = JSON.parse(raw);
        if (p.entries && Array.isArray(p.entries)) entrySuggestions.push(...p.entries);
        if (p.links && Array.isArray(p.links)) {
          linkSuggestions = p.links
            .filter(
              (l: any) =>
                l.fromId &&
                l.toId &&
                !existingLinkKeys.has(`${l.fromId}-${l.toId}`) &&
                !existingLinkKeys.has(`${l.toId}-${l.fromId}`),
            )
            .map((l: any) => ({ ...l, type: "LINK_SUGGESTED" as const }));
        }
        if (p.gaps && Array.isArray(p.gaps)) {
          gapSuggestions = p.gaps.slice(0, 3).map((g: any, i: number) => ({
            type: "GAP_DETECTED",
            entryId: `gap-${i}-${Date.now()}`,
            entryTitle: g.cat || "Missing info",
            field: "content",
            currentValue: "",
            suggestedValue: g.q,
            reason: g.q,
          }));
        }
      } catch (err) {
        console.error("[Improve Brain] JSON parse failed:", err, "raw:", raw);
      }
    } catch (err) {
      console.error("[Improve Brain] AI call failed (429?):", err);
    }

    // Cap at 3 improvement suggestions + 3 gap suggestions (6 total max)
    const improvementPool = [
      ...entrySuggestions,
      ...linkSuggestions,
      ...orphanSuggestions,
      ...staleSuggestions,
      ...deadUrlSuggestions,
    ];
    const cappedImprovements = sortBySuggestionPriority(improvementPool).slice(0, 3);
    const cappedGaps = gapSuggestions.slice(0, 3);

    setSuggestions([...cappedImprovements, ...cappedGaps]);

    localStorage.setItem(deltaKey(brainId), new Date().toISOString());
    setLoading(false);
  }, [loading, entries, links, activeBrain]);

  const applyEntry = useCallback(
    async (s: EntrySuggestion, override?: string) => {
      const value = override ?? s.suggestedValue;
      const key = `entry:${s.entryId}:${s.type}:${s.field}`;
      setApplying((p) => new Set(p).add(key));

      if (activeBrain?.id) {
        recordDecision(activeBrain.id, {
          source: "refine",
          type: s.type,
          action: override ? "edit" : "accept",
          field: s.field,
          originalValue: s.suggestedValue,
          finalValue: value,
          reason: s.reason,
        });
      }

      const entry = entries.find((e: Entry) => e.id === s.entryId);
      if (!entry) {
        setApplying((p) => {
          const n = new Set(p);
          n.delete(key);
          return n;
        });
        return;
      }

      // ORPHAN_DETECTED: auto-generate tags with AI before applying
      if (s.type === "ORPHAN_DETECTED") {
        try {
          const res = await throttledCallAI({
            task: "refine",
            max_tokens: 200,
            system: `You are a knowledge base organizer. Given an entry, suggest 2-4 short, useful tags that would help categorize and find it later. Return ONLY a valid JSON array of tag strings, e.g. ["health","supplements"]. No markdown, no explanation.`,
            brainId: activeBrain?.id,
            messages: [
              {
                role: "user",
                content: `Entry title: ${entry.title}\nEntry content: ${entry.content || "(empty)"}\nEntry type: ${entry.type}`,
              },
            ],
          });
          const data = await res.json();
          const raw = extractJSON(data.content?.[0]?.text || "[]");
          const tags = JSON.parse(raw);
          if (Array.isArray(tags) && tags.length > 0) {
            const mergedTags = [
              ...new Set([
                ...(entry.tags || []),
                ...tags.map((t: string) => t.toLowerCase().trim()),
              ]),
            ];
            await authFetch("/api/update-entry", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: entry.id, tags: mergedTags }),
            });
            setEntries((prev) =>
              prev.map((e) => (e.id === entry.id ? { ...e, tags: mergedTags } : e)),
            );
          }
        } catch (err) {
          console.error("[useRefineAnalysis] orphan tag gen", err);
        }
        setAccepted((p) => new Set(p).add(key));
        setDismissed((p) => new Set(p).add(key));
        setApplying((p) => {
          const n = new Set(p);
          n.delete(key);
          return n;
        });
        setEditingKey(null);
        return;
      }

      if (s.type === "CLUSTER_SUGGESTED") {
        try {
          const parsed = JSON.parse(s.suggestedValue);
          await authFetch("/api/create-entry", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: parsed.parentTitle,
              type: parsed.parentType || "note",
              content: `Hub entry for: ${(s.currentValue || "").slice(0, 200)}`,
              tags: [],
              brain_id: activeBrain?.id,
            }),
          });
        } catch (err) {
          console.error("[useRefineAnalysis]", err);
        }
        setAccepted((p) => new Set(p).add(key));
        setDismissed((p) => new Set(p).add(key));
        setApplying((p) => {
          const n = new Set(p);
          n.delete(key);
          return n;
        });
        setEditingKey(null);
        return;
      }

      if (s.type === "SENSITIVE_DATA") {
        try {
          await authFetch("/api/update-entry", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: entry.id, type: "secret" }),
          });
          setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, type: "secret" } : e)));
        } catch (err) {
          console.error("[useRefineAnalysis]", err);
        }
        setAccepted((p) => new Set(p).add(key));
        setDismissed((p) => new Set(p).add(key));
        setApplying((p) => {
          const n = new Set(p);
          n.delete(key);
          return n;
        });
        setEditingKey(null);
        return;
      }

      if (s.type === "MERGE_SUGGESTED" || s.type === "DUPLICATE_ENTRY") {
        const mergeTarget = entries.find((e: Entry) => e.id === s.suggestedValue);
        if (mergeTarget) {
          const combinedContent = [entry.content, mergeTarget.content].filter(Boolean).join("\n\n");
          const combinedTags = [...new Set([...(entry.tags || []), ...(mergeTarget.tags || [])])];
          const combinedMeta = { ...(mergeTarget.metadata || {}), ...(entry.metadata || {}) };
          try {
            await authFetch("/api/update-entry", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: entry.id,
                content: combinedContent,
                tags: combinedTags,
                metadata: combinedMeta,
              }),
            });
            await authFetch("/api/delete-entry", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: s.suggestedValue }),
            });
            setEntries((prev) =>
              prev
                .map((e) =>
                  e.id === entry.id
                    ? { ...e, content: combinedContent, tags: combinedTags, metadata: combinedMeta }
                    : e,
                )
                .filter((e) => e.id !== s.suggestedValue),
            );
          } catch (err) {
            console.error("[useRefineAnalysis]", err);
          }
        }
      } else {
        const body: Record<string, any> = { id: entry.id };
        if (s.field === "type") body.type = value;
        else if (s.field === "title") body.title = value;
        else if (s.field === "tags")
          body.tags = value
            .split(",")
            .map((t: string) => t.trim())
            .filter(Boolean);
        else if (s.field === "content") body.content = value;
        else if (s.field.startsWith("metadata.")) {
          const k = s.field.slice("metadata.".length);
          body.metadata = { ...(entry.metadata || {}), [k]: value };
        }
        try {
          await authFetch("/api/update-entry", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          setEntries((prev) =>
            prev.map((e) => {
              if (e.id !== entry.id) return e;
              if (s.field === "type") return { ...e, type: value as any };
              if (s.field === "title") return { ...e, title: value };
              if (s.field === "tags")
                return {
                  ...e,
                  tags: value
                    .split(",")
                    .map((t: string) => t.trim())
                    .filter(Boolean),
                };
              if (s.field === "content") return { ...e, content: value };
              if (s.field.startsWith("metadata.")) {
                const k = s.field.slice("metadata.".length);
                return { ...e, metadata: { ...(e.metadata || {}), [k]: value } };
              }
              return e;
            }),
          );
        } catch (err) {
          console.error("[useRefineAnalysis]", err);
        }
      }

      setAccepted((p) => new Set(p).add(key));
      setDismissed((p) => new Set(p).add(key));
      setApplying((p) => {
        const n = new Set(p);
        n.delete(key);
        return n;
      });
      setEditingKey(null);
    },
    [entries, setEntries, activeBrain],
  );

  const applyLink = useCallback(
    async (s: LinkSuggestion, relOverride?: string) => {
      const rel = relOverride ?? s.rel;
      const key = `link:${s.fromId}:${s.toId}`;
      setApplying((p) => new Set(p).add(key));

      if (activeBrain?.id) {
        recordDecision(activeBrain.id, {
          source: "refine",
          type: "LINK_SUGGESTED",
          action: relOverride ? "edit" : "accept",
          originalValue: s.rel,
          finalValue: rel,
          reason: s.reason,
        });
      }

      const newLink = { from: s.fromId, to: s.toId, rel };
      try {
        await authFetch("/api/save-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ links: [newLink] }),
        });
        addLinks?.([newLink]);
      } catch (err) {
        console.error("[useRefineAnalysis]", err);
      }

      setAccepted((p) => new Set(p).add(key));
      setDismissed((p) => new Set(p).add(key));
      setApplying((p) => {
        const n = new Set(p);
        n.delete(key);
        return n;
      });
      setEditingKey(null);
    },
    [addLinks, activeBrain],
  );

  const applyWeakLabel = useCallback(
    async (s: WeakLabelSuggestion, relOverride?: string) => {
      const rel = relOverride ?? s.rel;
      const key = `weak:${s.fromId}:${s.toId}`;
      setApplying((p) => new Set(p).add(key));

      if (activeBrain?.id) {
        recordDecision(activeBrain.id, {
          source: "refine",
          type: "WEAK_LABEL",
          action: relOverride ? "edit" : "accept",
          originalValue: s.currentRel,
          finalValue: rel,
          reason: s.reason,
        });
      }

      try {
        await authFetch("/api/save-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ links: [{ from: s.fromId, to: s.toId, rel }] }),
        });
      } catch (err) {
        console.error("[useRefineAnalysis]", err);
      }

      setAccepted((p) => new Set(p).add(key));
      setDismissed((p) => new Set(p).add(key));
      setApplying((p) => {
        const n = new Set(p);
        n.delete(key);
        return n;
      });
      setEditingKey(null);
    },
    [activeBrain],
  );

  const reject = useCallback(
    (key: string, s?: RefineSuggestion) => {
      setDismissed((p) => new Set(p).add(key));
      setEditingKey(null);
      if (s && activeBrain?.id) {
        if (s.type === "LINK_SUGGESTED") {
          const ls = s as LinkSuggestion;
          recordDecision(activeBrain.id, {
            source: "refine",
            type: s.type,
            action: "reject",
            originalValue: ls.rel,
            reason: ls.reason,
          });
        } else if (s.type === "WEAK_LABEL") {
          const ws = s as WeakLabelSuggestion;
          recordDecision(activeBrain.id, {
            source: "refine",
            type: s.type,
            action: "reject",
            originalValue: ws.currentRel,
            reason: ws.reason,
          });
        } else {
          const es = s as EntrySuggestion;
          recordDecision(activeBrain.id, {
            source: "refine",
            type: s.type,
            action: "reject",
            field: es.field,
            originalValue: es.suggestedValue,
            reason: es.reason,
          });
        }
      }
    },
    [activeBrain],
  );

  const keyOf = (s: RefineSuggestion): string => {
    if (s.type === "LINK_SUGGESTED")
      return `link:${(s as LinkSuggestion).fromId}:${(s as LinkSuggestion).toId}`;
    if (s.type === "WEAK_LABEL")
      return `weak:${(s as WeakLabelSuggestion).fromId}:${(s as WeakLabelSuggestion).toId}`;
    return `entry:${(s as EntrySuggestion).entryId}:${(s as EntrySuggestion).type}:${(s as EntrySuggestion).field}`;
  };

  const visible = sortBySuggestionPriority(
    (suggestions ?? []).filter((s) => !dismissed.has(keyOf(s))),
  );
  const linkCount = visible.filter(
    (s) => s.type === "LINK_SUGGESTED" || s.type === "WEAK_LABEL",
  ).length;
  const entryCount = visible.filter(
    (s) => s.type !== "LINK_SUGGESTED" && s.type !== "WEAK_LABEL",
  ).length;
  const allDone = suggestions !== null && suggestions.length > 0 && visible.length === 0;
  const noneFound = suggestions !== null && suggestions.length === 0;

  return {
    loading,
    suggestions,
    dismissed,
    accepted,
    applying,
    editingKey,
    setEditingKey,
    editValue,
    setEditValue,
    visible,
    linkCount,
    entryCount,
    allDone,
    noneFound,
    analyze,
    applyEntry,
    applyLink,
    applyWeakLabel,
    reject,
    keyOf,
  };
}
