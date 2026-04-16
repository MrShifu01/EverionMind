import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";
import { SERVER_PROMPTS } from "./_lib/prompts.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SB_HEADERS: Record<string, string> = { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}` };
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const GEMINI_MODEL = (process.env.GEMINI_MODEL || "gemini-2.5-flash-lite").trim();

const SUGGESTIONS_PROMPT = SERVER_PROMPTS.SUGGESTIONS;
const MERGE_PROMPT = SERVER_PROMPTS.MERGE;
const WOW_PROMPT = SERVER_PROMPTS.WOW;

function getGreeting(name?: string): string {
  return name ? `Hi, ${name}.` : `Hi there.`;
}

async function generateSuggestions(
  entries: any[],
  topConcepts: string[],
): Promise<Array<{ q: string; cat: string }>> {
  if (!GEMINI_API_KEY || entries.length === 0) return [];

  const entryLines = entries
    .map((e) => `- [${e.type}] ${e.title}${e.tags?.length ? ` (${e.tags.join(", ")})` : ""}`)
    .join("\n");
  const conceptLine = topConcepts.length ? `\n\nTop concepts: ${topConcepts.join(", ")}` : "";
  const seed = Math.floor(Math.random() * 10000);

  const userText = `Seed: ${seed}\n\nMy brain entries:\n${entryLines}${conceptLine}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: userText }] }],
          systemInstruction: { parts: [{ text: SUGGESTIONS_PROMPT }] },
          generationConfig: { maxOutputTokens: 512 },
        }),
      },
    );
    if (!res.ok) return [];
    const data: any = await res.json();
    const text: string = (data.candidates?.[0]?.content?.parts || [])
      .filter((p: any) => !p.thought)
      .map((p: any) => p.text || "")
      .join("")
      .trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.suggestions)) return [];
    return parsed.suggestions
      .filter((s: any) => s.q && s.cat)
      .slice(0, 3);
  } catch {
    return [];
  }
}

async function generateMergeSuggestions(
  entries: any[],
): Promise<Array<{ ids: string[]; titles: string[]; reason: string }>> {
  if (!GEMINI_API_KEY) {
    console.error("[feed:merges] GEMINI_API_KEY not configured");
    return [];
  }
  if (entries.length < 2) return [];

  const validIds = new Set(entries.map((e) => e.id));
  const entryLines = entries
    .map((e) => `- id:${e.id} [${e.type}] ${e.title}${e.content ? ` — ${String(e.content).slice(0, 120)}` : ""}`)
    .join("\n");

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `My entries:\n${entryLines}` }] }],
          systemInstruction: { parts: [{ text: MERGE_PROMPT }] },
          generationConfig: { maxOutputTokens: 512 },
        }),
      },
    );
    if (!res.ok) {
      console.error("[feed:merges] Gemini HTTP error", res.status, await res.text().catch(() => ""));
      return [];
    }
    const data: any = await res.json();
    const text: string = (data.candidates?.[0]?.content?.parts || [])
      .filter((p: any) => !p.thought)
      .map((p: any) => p.text || "")
      .join("")
      .trim();
    console.log("[feed:merges] LLM response chars:", text.length, "| preview:", text.slice(0, 300));
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.log("[feed:merges] no JSON object found in response");
      return [];
    }
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.merges)) return [];
    const results = parsed.merges
      .filter((m: any) => Array.isArray(m.ids) && m.ids.length >= 2 && m.reason)
      // Reject any suggestion containing IDs the LLM hallucinated
      .filter((m: any) => m.ids.every((id: string) => validIds.has(id)))
      .slice(0, 5);
    console.log("[feed:merges] valid suggestions:", results.length, "/ raw:", parsed.merges.length);
    return results;
  } catch (e: any) {
    console.error("[feed:merges] exception:", e?.message ?? e);
    return [];
  }
}

async function synthesizeWows(
  insights: any[],
  topConcepts: string[],
  relationships: string[],
): Promise<Array<{ headline: string; detail: string }>> {
  if (!GEMINI_API_KEY || insights.length < 2) return [];

  const insightLines = insights
    .map((e) => `- ${e.title}: ${String(e.content || "").slice(0, 200)}`)
    .join("\n");

  const conceptLine = topConcepts.length ? `Top concepts: ${topConcepts.join(", ")}` : "";
  const relLine = relationships.length ? `Relationships: ${relationships.join("; ")}` : "";

  const userText = `Recent insights:\n${insightLines}${conceptLine ? `\n\n${conceptLine}` : ""}${relLine ? `\n${relLine}` : ""}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: userText }] }],
          systemInstruction: { parts: [{ text: WOW_PROMPT }] },
          generationConfig: { maxOutputTokens: 512 },
        }),
      },
    );
    if (!res.ok) return [];
    const data: any = await res.json();
    const text: string = (data.candidates?.[0]?.content?.parts || [])
      .filter((p: any) => !p.thought)
      .map((p: any) => p.text || "")
      .join("")
      .trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.wows)) return [];
    return parsed.wows
      .filter((w: any) => w.headline && w.detail)
      .slice(0, 3);
  } catch {
    return [];
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  applySecurityHeaders(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });

  const user: any = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const brainId = (req.query.brain_id as string) || "";
  if (!brainId) return res.status(400).json({ error: "brain_id required" });

  const section = (req.query.section as string) || "all";
  const skipMerges = req.query.skip_merges === "true";

  try {
    // ── QUICK section: DB-only, returns in ~200ms ──────────────────────────────
    if (section === "quick") {
      const [resurfacedRes, statsRes, userRes] = await Promise.all([
        fetch(
          `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&created_at=gte.${new Date(Date.now() - 180 * 86400000).toISOString()}&created_at=lte.${new Date(Date.now() - 30 * 86400000).toISOString()}&deleted_at=is.null&select=id,title,content,type,tags,created_at&order=random&limit=2`,
          { headers: SB_HEADERS },
        ),
        fetch(
          `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&deleted_at=is.null&select=id`,
          { headers: { ...SB_HEADERS, Prefer: "count=exact" } },
        ),
        fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, { headers: SB_HEADERS }),
      ]);

      const resurfaced = resurfacedRes.ok ? await resurfacedRes.json() : [];
      const entryCount = parseInt(statsRes.headers.get("content-range")?.split("/")[1] || "0", 10);
      const userData = userRes.ok ? await userRes.json() : {};
      const meta = userData.user_metadata || {};
      const streak = { current: meta.current_streak || 0, longest: meta.longest_streak || 0 };
      const name = meta.display_name || meta.full_name || meta.name || "";

      return res.status(200).json({
        greeting: getGreeting(name),
        resurfaced,
        streak,
        stats: { entries: entryCount, connections: 0, insights: 0 },
      });
    }

    // ── INSIGHTS section: LLM calls, returns in ~2-5s ─────────────────────────
    if (section === "insights") {
      const mergeOldestPromise = skipMerges ? Promise.resolve(null) : fetch(
        `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&deleted_at=is.null&select=id,title,type,content&order=created_at.asc&limit=40`,
        { headers: SB_HEADERS },
      );
      const mergeNewestPromise = skipMerges ? Promise.resolve(null) : fetch(
        `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&deleted_at=is.null&select=id,title,type,content&order=created_at.desc&limit=40`,
        { headers: SB_HEADERS },
      );

      const [insightRes, sparseRes, graphRes, mergeOldestRes, mergeNewestRes] = await Promise.all([
        fetch(
          `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&metadata->>ai_insight=not.is.null&deleted_at=is.null&select=id,title,metadata&order=created_at.desc&limit=10`,
          { headers: SB_HEADERS },
        ),
        fetch(
          `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&deleted_at=is.null&select=id,title,type,tags&order=created_at.desc&limit=20`,
          { headers: SB_HEADERS },
        ),
        fetch(
          `${SB_URL}/rest/v1/concept_graphs?brain_id=eq.${encodeURIComponent(brainId)}&select=graph`,
          { headers: SB_HEADERS },
        ),
        mergeOldestPromise,
        mergeNewestPromise,
      ]);

      const insightRows: any[] = insightRes.ok ? await insightRes.json() : [];
      const insights = insightRows.map((e) => ({
        title: e.title,
        content: String(e.metadata?.ai_insight || ""),
      }));
      const recentEntries: any[] = sparseRes.ok ? await sparseRes.json() : [];

      let mergeEntries: any[] = [];
      if (!skipMerges) {
        const oldest: any[] = mergeOldestRes?.ok ? await mergeOldestRes.json() : [];
        const newest: any[] = mergeNewestRes?.ok ? await mergeNewestRes.json() : [];
        const seen = new Set<string>();
        const combined: any[] = [];
        for (const e of [...oldest, ...newest]) {
          if (!seen.has(e.id)) { seen.add(e.id); combined.push(e); }
        }
        for (let i = combined.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [combined[i], combined[j]] = [combined[j], combined[i]];
        }
        mergeEntries = combined;
      }

      let topConcepts: string[] = [];
      let relationships: string[] = [];
      if (graphRes.ok) {
        const graphRows: any[] = await graphRes.json();
        const graph = graphRows[0]?.graph;
        if (graph) {
          topConcepts = (graph.concepts || [])
            .sort((a: any, b: any) => (b.frequency || 0) - (a.frequency || 0))
            .slice(0, 12)
            .map((c: any) => c.label);
          relationships = (graph.relationships || [])
            .slice(0, 15)
            .map((r: any) => `${r.source} → ${r.target}`);
        }
      }

      const [wows, suggestions, merges] = await Promise.all([
        synthesizeWows(insights, topConcepts, relationships),
        generateSuggestions(recentEntries, topConcepts),
        skipMerges ? Promise.resolve([]) : generateMergeSuggestions(mergeEntries),
      ]);

      return res.status(200).json({ wows, suggestions, merges });
    }

    // ── ALL section: legacy full response (backward compat) ───────────────────
    const mergeOldestPromise = skipMerges ? Promise.resolve(null) : fetch(
      `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&deleted_at=is.null&select=id,title,type,content&order=created_at.asc&limit=40`,
      { headers: SB_HEADERS },
    );
    const mergeNewestPromise = skipMerges ? Promise.resolve(null) : fetch(
      `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&deleted_at=is.null&select=id,title,type,content&order=created_at.desc&limit=40`,
      { headers: SB_HEADERS },
    );

    const [resurfacedRes, statsRes, userRes, insightRes, sparseRes, graphRes, mergeOldestRes, mergeNewestRes] = await Promise.all([
      fetch(
        `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&created_at=gte.${new Date(Date.now() - 180 * 86400000).toISOString()}&created_at=lte.${new Date(Date.now() - 30 * 86400000).toISOString()}&deleted_at=is.null&select=id,title,content,type,tags,created_at&order=random&limit=2`,
        { headers: SB_HEADERS },
      ),
      fetch(
        `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&deleted_at=is.null&select=id`,
        { headers: { ...SB_HEADERS, Prefer: "count=exact" } },
      ),
      fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, { headers: SB_HEADERS }),
      fetch(
        `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&metadata->>ai_insight=not.is.null&deleted_at=is.null&select=id,title,metadata&order=created_at.desc&limit=10`,
        { headers: SB_HEADERS },
      ),
      fetch(
        `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&deleted_at=is.null&select=id,title,type,tags&order=created_at.desc&limit=20`,
        { headers: SB_HEADERS },
      ),
      fetch(
        `${SB_URL}/rest/v1/concept_graphs?brain_id=eq.${encodeURIComponent(brainId)}&select=graph`,
        { headers: SB_HEADERS },
      ),
      mergeOldestPromise,
      mergeNewestPromise,
    ]);

    const resurfaced = resurfacedRes.ok ? await resurfacedRes.json() : [];
    const entryCount = parseInt(statsRes.headers.get("content-range")?.split("/")[1] || "0", 10);
    const userData = userRes.ok ? await userRes.json() : {};
    const meta = userData.user_metadata || {};
    const streak = { current: meta.current_streak || 0, longest: meta.longest_streak || 0 };
    const insightRows: any[] = insightRes.ok ? await insightRes.json() : [];
    const insights = insightRows.map((e) => ({
      title: e.title,
      content: String(e.metadata?.ai_insight || ""),
    }));
    const recentEntries: any[] = sparseRes.ok ? await sparseRes.json() : [];

    let mergeEntries: any[] = [];
    if (!skipMerges) {
      const oldest: any[] = mergeOldestRes?.ok ? await mergeOldestRes.json() : [];
      const newest: any[] = mergeNewestRes?.ok ? await mergeNewestRes.json() : [];
      const seen = new Set<string>();
      const combined: any[] = [];
      for (const e of [...oldest, ...newest]) {
        if (!seen.has(e.id)) { seen.add(e.id); combined.push(e); }
      }
      for (let i = combined.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [combined[i], combined[j]] = [combined[j], combined[i]];
      }
      mergeEntries = combined;
    }

    let topConcepts: string[] = [];
    let relationships: string[] = [];
    if (graphRes.ok) {
      const graphRows: any[] = await graphRes.json();
      const graph = graphRows[0]?.graph;
      if (graph) {
        topConcepts = (graph.concepts || [])
          .sort((a: any, b: any) => (b.frequency || 0) - (a.frequency || 0))
          .slice(0, 12)
          .map((c: any) => c.label);
        relationships = (graph.relationships || [])
          .slice(0, 15)
          .map((r: any) => `${r.source} → ${r.target}`);
      }
    }

    const [wows, suggestions, merges] = await Promise.all([
      synthesizeWows(insights, topConcepts, relationships),
      generateSuggestions(recentEntries, topConcepts),
      skipMerges ? Promise.resolve([]) : generateMergeSuggestions(mergeEntries),
    ]);

    const name = meta.display_name || meta.full_name || meta.name || "";

    return res.status(200).json({
      greeting: getGreeting(name),
      resurfaced,
      wows,
      suggestions,
      merges,
      streak,
      stats: { entries: entryCount, connections: 0, insights: insights.length },
    });
  } catch (err: any) {
    console.error("[feed]", err);
    return res.status(500).json({ error: "Failed to load feed" });
  }
}
