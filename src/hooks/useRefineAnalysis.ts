import { useState, useCallback } from "react";
import { authFetch } from "../lib/authFetch";
import { callAI } from "../lib/ai";
import { PROMPTS } from "../config/prompts";
import { recordDecision } from "../lib/learningEngine";
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

type RefineSuggestion = EntrySuggestion | LinkSuggestion;

interface RefineLink {
  from: string;
  to: string;
  rel?: string;
  similarity?: number;
}

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
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<RefineSuggestion[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<Set<string>>(new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const analyze = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setSuggestions(null);
    setDismissed(new Set());
    setEditingKey(null);

    const existingLinkKeys = new Set((links || []).map((l: RefineLink) => `${l.from}-${l.to}`));
    const BATCH = 25;
    const entrySuggestions: RefineSuggestion[] = [];

    const batches = [];
    for (let i = 0; i < entries.length; i += BATCH) batches.push(entries.slice(i, i + BATCH));

    await Promise.all(
      batches.map(async (batch) => {
        const slim = batch.map((e: Entry) => ({
          id: e.id,
          title: e.title,
          content: (e.content || "").slice(0, 400),
          type: e.type,
          metadata: e.metadata || {},
          tags: e.tags || [],
        }));
        try {
          const res = await callAI({
            max_tokens: 1500,
            system: PROMPTS.ENTRY_AUDIT,
            brainId: activeBrain?.id,
            messages: [{ role: "user", content: `Review these ${slim.length} entries:\n\n${JSON.stringify(slim)}` }],
          });
          const data = await res.json();
          const raw = (data.content?.[0]?.text || "[]").replace(/```json|```/g, "").trim();
          try {
            const p = JSON.parse(raw);
            if (Array.isArray(p)) entrySuggestions.push(...p);
          } catch (err) { console.error("[useRefineAnalysis]", err); }
        } catch (err) { console.error("[useRefineAnalysis]", err); }
      }),
    );

    let linkSuggestions: RefineSuggestion[] = [];
    const namedLinkKeys = new Set(
      (links || [])
        .filter((l: RefineLink) => l.rel)
        .flatMap((l: RefineLink) => [`${l.from}-${l.to}`, `${l.to}-${l.from}`]),
    );
    const similarityPairs = (links || [])
      .filter(
        (l: RefineLink) =>
          typeof l.similarity === "number" &&
          !namedLinkKeys.has(`${l.from}-${l.to}`) &&
          !namedLinkKeys.has(`${l.to}-${l.from}`),
      )
      .sort((a: RefineLink, b: RefineLink) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, 30);

    const entryMap: Record<string, Entry> = Object.fromEntries(entries.map((e: Entry) => [e.id, e]));

    if (similarityPairs.length > 0) {
      const PAIR_BATCH = 15;
      const pairBatches = [];
      for (let i = 0; i < similarityPairs.length; i += PAIR_BATCH)
        pairBatches.push(similarityPairs.slice(i, i + PAIR_BATCH));

      await Promise.all(
        pairBatches.map(async (batch: RefineLink[]) => {
          const candidates = batch
            .map((l: RefineLink) => {
              const a = entryMap[l.from], b = entryMap[l.to];
              if (!a || !b) return null;
              return {
                fromId: a.id, fromTitle: a.title, fromType: a.type,
                fromContent: (a.content || "").slice(0, 200), fromTags: (a.tags || []).slice(0, 6),
                toId: b.id, toTitle: b.title, toType: b.type,
                toContent: (b.content || "").slice(0, 200), toTags: (b.tags || []).slice(0, 6),
              };
            })
            .filter(Boolean);
          if (candidates.length === 0) return;
          try {
            const res = await callAI({
              max_tokens: 1200,
              system: PROMPTS.LINK_DISCOVERY_PAIRS,
              brainId: activeBrain?.id,
              messages: [{ role: "user", content: `CANDIDATE PAIRS:\n${JSON.stringify(candidates)}` }],
            });
            const data = await res.json();
            const raw = (data.content?.[0]?.text || "[]").replace(/```json|```/g, "").trim();
            try {
              const p = JSON.parse(raw);
              if (Array.isArray(p)) {
                linkSuggestions.push(
                  ...p
                    .filter((l: any) =>
                      l.fromId && l.toId &&
                      !existingLinkKeys.has(`${l.fromId}-${l.toId}`) &&
                      !existingLinkKeys.has(`${l.toId}-${l.fromId}`),
                    )
                    .map((l: any) => ({ ...l, type: "LINK_SUGGESTED" as const })),
                );
              }
            } catch (err) { console.error("[useRefineAnalysis]", err); }
          } catch (err) { console.error("[useRefineAnalysis]", err); }
        }),
      );
    } else {
      try {
        const slim = entries.slice(0, 60).map((e: Entry) => ({
          id: e.id, title: e.title, type: e.type,
          content: (e.content || "").slice(0, 200), tags: (e.tags || []).slice(0, 6),
        }));
        const res = await callAI({
          max_tokens: 1200,
          system: PROMPTS.LINK_DISCOVERY,
          brainId: activeBrain?.id,
          messages: [{ role: "user", content: `Entries:\n${JSON.stringify(slim)}\n\nExisting links (do NOT re-suggest these):\n${JSON.stringify([...existingLinkKeys])}` }],
        });
        const data = await res.json();
        const raw = (data.content?.[0]?.text || "[]").replace(/```json|```/g, "").trim();
        try {
          const p = JSON.parse(raw);
          if (Array.isArray(p)) {
            linkSuggestions = p
              .filter((l: any) =>
                l.fromId && l.toId &&
                !existingLinkKeys.has(`${l.fromId}-${l.toId}`) &&
                !existingLinkKeys.has(`${l.toId}-${l.fromId}`),
              )
              .map((l: any) => ({ ...l, type: "LINK_SUGGESTED" as const }));
          }
        } catch (err) { console.error("[useRefineAnalysis]", err); }
      } catch (err) { console.error("[useRefineAnalysis]", err); }
    }

    setSuggestions([...entrySuggestions, ...linkSuggestions]);
    setLoading(false);
  }, [loading, entries, links, activeBrain]);

  const applyEntry = useCallback(
    async (s: EntrySuggestion, override?: string) => {
      const value = override ?? s.suggestedValue;
      const key = `entry:${s.entryId}:${s.field}`;
      setApplying((p) => new Set(p).add(key));

      if (activeBrain?.id) {
        recordDecision(activeBrain.id, {
          source: "refine", type: s.type,
          action: override ? "edit" : "accept",
          field: s.field, originalValue: s.suggestedValue, finalValue: value, reason: s.reason,
        });
      }

      const entry = entries.find((e: Entry) => e.id === s.entryId);
      if (!entry) {
        setApplying((p) => { const n = new Set(p); n.delete(key); return n; });
        return;
      }

      if (s.type === "MERGE_SUGGESTED") {
        const mergeTarget = entries.find((e: Entry) => e.id === s.suggestedValue);
        if (mergeTarget) {
          const combinedContent = [entry.content, mergeTarget.content].filter(Boolean).join("\n\n");
          const combinedTags = [...new Set([...(entry.tags || []), ...(mergeTarget.tags || [])])];
          const combinedMeta = { ...(mergeTarget.metadata || {}), ...(entry.metadata || {}) };
          try {
            await authFetch("/api/update-entry", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: entry.id, content: combinedContent, tags: combinedTags, metadata: combinedMeta }),
            });
            await authFetch("/api/delete-entry", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: s.suggestedValue }),
            });
            setEntries((prev) =>
              prev.map((e) =>
                e.id === entry.id ? { ...e, content: combinedContent, tags: combinedTags, metadata: combinedMeta } : e,
              ).filter((e) => e.id !== s.suggestedValue),
            );
          } catch (err) { console.error("[useRefineAnalysis]", err); }
        }
      } else {
        const body: Record<string, any> = { id: entry.id };
        if (s.field === "type") body.type = value;
        else if (s.field === "title") body.title = value;
        else if (s.field === "tags") body.tags = value.split(",").map((t: string) => t.trim()).filter(Boolean);
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
              if (s.field === "tags") return { ...e, tags: value.split(",").map((t: string) => t.trim()).filter(Boolean) };
              if (s.field === "content") return { ...e, content: value };
              if (s.field.startsWith("metadata.")) {
                const k = s.field.slice("metadata.".length);
                return { ...e, metadata: { ...(e.metadata || {}), [k]: value } };
              }
              return e;
            }),
          );
        } catch (err) { console.error("[useRefineAnalysis]", err); }
      }

      setDismissed((p) => new Set(p).add(key));
      setApplying((p) => { const n = new Set(p); n.delete(key); return n; });
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
          source: "refine", type: "LINK_SUGGESTED",
          action: relOverride ? "edit" : "accept",
          originalValue: s.rel, finalValue: rel, reason: s.reason,
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
      } catch (err) { console.error("[useRefineAnalysis]", err); }

      setDismissed((p) => new Set(p).add(key));
      setApplying((p) => { const n = new Set(p); n.delete(key); return n; });
      setEditingKey(null);
    },
    [addLinks, activeBrain],
  );

  const reject = useCallback(
    (key: string, s?: RefineSuggestion) => {
      setDismissed((p) => new Set(p).add(key));
      setEditingKey(null);
      if (s && activeBrain?.id) {
        recordDecision(activeBrain.id, {
          source: "refine", type: s.type, action: "reject",
          field: s.type === "LINK_SUGGESTED" ? undefined : (s as EntrySuggestion).field,
          originalValue: s.type === "LINK_SUGGESTED" ? (s as LinkSuggestion).rel : (s as EntrySuggestion).suggestedValue,
          reason: s.type === "LINK_SUGGESTED" ? (s as LinkSuggestion).reason : (s as EntrySuggestion).reason,
        });
      }
    },
    [activeBrain],
  );

  const keyOf = (s: RefineSuggestion): string =>
    s.type === "LINK_SUGGESTED"
      ? `link:${(s as LinkSuggestion).fromId}:${(s as LinkSuggestion).toId}`
      : `entry:${(s as EntrySuggestion).entryId}:${(s as EntrySuggestion).field}`;

  const visible = (suggestions ?? []).filter((s) => !dismissed.has(keyOf(s)));
  const linkCount = visible.filter((s) => s.type === "LINK_SUGGESTED").length;
  const entryCount = visible.filter((s) => s.type !== "LINK_SUGGESTED").length;
  const allDone = suggestions !== null && suggestions.length > 0 && visible.length === 0;
  const noneFound = suggestions !== null && suggestions.length === 0;

  return {
    loading,
    suggestions,
    dismissed,
    applying,
    editingKey, setEditingKey,
    editValue, setEditValue,
    visible, linkCount, entryCount, allDone, noneFound,
    analyze,
    applyEntry,
    applyLink,
    reject,
    keyOf,
  };
}
