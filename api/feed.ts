import type { ApiRequest, ApiResponse } from "./_lib/types";
import { verifyAuth } from "./_lib/verifyAuth.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { applySecurityHeaders } from "./_lib/securityHeaders.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SB_HEADERS: Record<string, string> = { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}` };
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const GEMINI_MODEL = (process.env.GEMINI_MODEL || "gemini-2.5-flash-lite").trim();

const SUGGESTIONS_PROMPT = `You are a second brain assistant helping a user build a rich personal knowledge base. Given a list of entries already captured and a random category seed, generate exactly 3 questions.

MIX RULE: Each set of 3 questions must blend two modes — vary this randomly based on the seed:
- DEEPEN (grounded): questions that fill specific gaps in existing entries (e.g. they have suppliers but no pricing → ask about pricing)
- EXPLORE (expansive): questions from the Second Brain category list below that the user has NOT covered yet

SECOND BRAIN CATEGORY LIST (use as inspiration, rephrase naturally, pick randomly based on seed):
- Memories of significant life events you don't want to fade
- Personal reflections and lessons learned from the past year
- Random shower ideas or spontaneous insights you haven't written down
- Stories or anecdotes — yours or someone else's — worth remembering
- Realizations from conversations that shifted your perspective
- Personal breakthroughs from meditation, therapy, or meaningful experiences
- Observations on your own recurring patterns or habits
- Inspiring quotes that evoke wonder or curiosity
- Surprising facts that challenged your beliefs
- Takeaways from a course, conference, or book you recently finished
- Answers to questions you frequently get asked
- A project retrospective — what went well, what didn't
- A checklist or template you use repeatedly
- Household facts (appliance models, paint colors, maintenance history)
- Health records or goals (exercise routines, supplements, doctor notes)
- Financial research (investments, budget notes, tax info)
- Travel itineraries or dream destinations
- Industry trends you want to track
- Your Twelve Favourite Problems — open questions you keep returning to
- Mental models that help you make better decisions
- Hobby research (recipes, gear reviews, language notes)
- Drafts or brainstorms for creative projects
- Books you own or plan to read
- Strategic career questions (how to spend more time on high-value work)
- People worth keeping closer contact with and why

Rules:
- Aim for roughly 1-2 DEEPEN + 1-2 EXPLORE per set (vary the ratio randomly)
- DEEPEN questions must reference something specific already in the brain
- EXPLORE questions should feel personal and curious, not corporate or generic
- All questions must be concise, directly answerable, and feel like a friend asked them
- cat is a short label (1-3 words) for the domain
- Return ONLY valid JSON, no markdown: {"suggestions":[{"q":"...","cat":"..."},{"q":"...","cat":"..."},{"q":"...","cat":"..."}]}`;

const MERGE_PROMPT = `You are a personal knowledge assistant reviewing a user's second-brain entries.

Identify groups of 2-3 entries that are clearly fragmented pieces of the same real-world entity and should be merged into one entry. The most common case is a person/contact split across multiple entries (e.g. one entry has their phone number, another has their ID, another has their address). Also flag near-duplicate notes or entries where one is a clear subset of another.

Rules:
- Only suggest merges you are highly confident about — false positives are worse than misses
- Each group must have a plain-English reason (1 sentence)
- At most 3 suggestions
- Return ONLY valid JSON, no markdown: {"merges":[{"ids":["id1","id2"],"titles":["title1","title2"],"reason":"..."}]}
- If no clear candidates, return {"merges":[]}`;

const WOW_PROMPT = `You are a personal insight synthesizer for a second-brain app.

Given the user's recent AI-generated insights AND their top brain concepts and relationships, find 1-3 genuine "wow" moments — surprising cross-domain connections, unexpected patterns, or profound implications the user has NOT consciously noticed.

Rules:
- Be specific to THIS user's actual data, never generic advice
- Name the real connection — e.g. "Your supplier notes and pricing research both circle the same margin pressure"
- Headline: under 10 words, punchy, specific
- Detail: 1-2 sentences, direct and insightful
- Skip anything obvious or motivational-poster-level generic
- Return ONLY valid JSON, no markdown: {"wows":[{"headline":"...","detail":"..."}]}
- If data is too sparse for genuine wow moments, return {"wows":[]}`;

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
  if (!GEMINI_API_KEY || entries.length < 2) return [];

  const entryLines = entries
    .map((e) => `- id:${e.id} [${e.type}] ${e.title}`)
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
    if (!Array.isArray(parsed.merges)) return [];
    return parsed.merges
      .filter((m: any) => Array.isArray(m.ids) && m.ids.length >= 2 && m.reason)
      .slice(0, 3);
  } catch {
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

  try {
    // Run independent fetches in parallel
    const [resurfacedRes, statsRes, userRes, insightRes, sparseRes, graphRes, mergeEntriesRes] = await Promise.all([
      // 1. Resurfaced entries: random entries from 1-6 months ago
      fetch(
        `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&created_at=gte.${new Date(Date.now() - 180 * 86400000).toISOString()}&created_at=lte.${new Date(Date.now() - 30 * 86400000).toISOString()}&deleted_at=is.null&select=id,title,content,type,tags,created_at&order=random&limit=2`,
        { headers: SB_HEADERS },
      ),
      // 2. Stats: entry count
      fetch(
        `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&deleted_at=is.null&select=id`,
        { headers: { ...SB_HEADERS, Prefer: "count=exact" } },
      ),
      // 3. User metadata (streak)
      fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, { headers: SB_HEADERS }),
      // 4. Recent entries that have an ai_insight in metadata (last 10)
      fetch(
        `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&metadata->>ai_insight=not.is.null&deleted_at=is.null&select=id,title,metadata&order=created_at.desc&limit=10`,
        { headers: SB_HEADERS },
      ),
      // 5. Recent entries for suggestions context (last 20)
      fetch(
        `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&deleted_at=is.null&select=id,title,type,tags&order=created_at.desc&limit=20`,
        { headers: SB_HEADERS },
      ),
      // 6. Concept graph
      fetch(
        `${SB_URL}/rest/v1/concept_graphs?brain_id=eq.${encodeURIComponent(brainId)}&select=graph`,
        { headers: SB_HEADERS },
      ),
      // 7. Wider entry sample for merge detection (50 entries, older entries included)
      fetch(
        `${SB_URL}/rest/v1/entries?brain_id=eq.${brainId}&deleted_at=is.null&select=id,title,type&order=created_at.desc&limit=50`,
        { headers: SB_HEADERS },
      ),
    ]);

    const resurfaced = resurfacedRes.ok ? await resurfacedRes.json() : [];
    const entryCount = parseInt(statsRes.headers.get("content-range")?.split("/")[1] || "0", 10);
    const userData = userRes.ok ? await userRes.json() : {};
    const meta = userData.user_metadata || {};
    const streak = { current: meta.current_streak || 0, longest: meta.longest_streak || 0 };
    const insightRows: any[] = insightRes.ok ? await insightRes.json() : [];
    // Map to {title, content} shape expected by synthesizeWows
    const insights = insightRows.map((e) => ({
      title: e.title,
      content: String(e.metadata?.ai_insight || ""),
    }));
    const recentEntries: any[] = sparseRes.ok ? await sparseRes.json() : [];
    const mergeEntries: any[] = mergeEntriesRes.ok ? await mergeEntriesRes.json() : [];

    // Extract top concepts + relationships from graph for wow/suggestions synthesis
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

    // Run all LLM calls in parallel
    const [wows, suggestions, merges] = await Promise.all([
      synthesizeWows(insights, topConcepts, relationships),
      generateSuggestions(recentEntries, topConcepts),
      generateMergeSuggestions(mergeEntries),
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
