import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import { Cosmograph } from "@cosmograph/react";
import type { CosmographRef } from "@cosmograph/react";
import { TC } from "../data/constants";
import { loadGraph, loadGraphFromDB, saveGraphToDB, mergeGraph, extractConcepts, extractRelationships, detectCommunities } from "../lib/conceptGraph";
import { callAI } from "../lib/ai";
import type { Entry, Brain } from "../types";

interface GraphPoint {
  [key: string]: unknown;
  _idx: number;
  id: string;
  label: string;
  type: string;
  connections: number;
  community: number;
  color: string;
}

interface GraphLink {
  [key: string]: unknown;
  source: number;
  target: number;
  label: string;
  value: number;
}

interface GraphViewProps {
  entries: Entry[];
  activeBrain: Brain | null;
  onSelectEntry?: (entry: Entry) => void;
}

// Warm earth-tone palette harmonized with gold/bronze theme
const COMMUNITY_COLORS = [
  "#b8956a", // warm gold
  "#c4785a", // terracotta
  "#8fa878", // sage
  "#7a9bb5", // dusty blue
  "#b07aa3", // muted mauve
  "#c9a84c", // amber
  "#6b9e9e", // teal stone
  "#c47e6e", // copper rose
  "#8b8b6b", // olive
  "#9a7eb8", // lavender stone
];

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
  let truncated = cleaned.slice(start);
  truncated = truncated.replace(/,\s*"[^"]*$/, "").replace(/,\s*$/, "");
  // Fix truncated numbers (e.g. "0." or "3.1" cut mid-value) that cause "Unterminated fractional number"
  truncated = truncated.replace(/:\s*-?\d+\.\s*$/, ": 0").replace(/,\s*-?\d+\.\s*$/, "");
  const opens: string[] = [];
  let inString = false;
  let escape = false;
  for (const ch of truncated) {
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") opens.push(ch);
    else if (ch === "}" || ch === "]") opens.pop();
  }
  while (opens.length) {
    const o = opens.pop();
    truncated += o === "[" ? "]" : "}";
  }
  return truncated;
}

const BUILD_GRAPH_PROMPT = `You are a knowledge-graph builder. Given a list of entries from a personal/business knowledge base, extract concepts and relationships.

TASK — CONCEPT EXTRACTION:
Identify key concepts (recurring themes, entities, ideas) across entries and meaningful relationships between them.

Return ONLY this JSON structure, no markdown:
{
  "concepts": [{"label":"concept name","entry_ids":["id1","id2"]}],
  "relationships": [{"source":"concept A","target":"concept B","relation":"related_to|depends_on|part_of|supplies|works_at|used_in|etc","confidence":"extracted"|"inferred","confidence_score":0.0-1.0,"entry_ids":["id1"]}]
}

Rules:
- Max 20 concepts, max 15 relationships
- Concepts should be specific and meaningful (not generic like "note" or "item")
- Each concept must reference at least 2 entries
- Relationships should describe HOW concepts connect with a specific verb phrase
- confidence_score: 0.8+ for explicit connections, 0.5-0.8 for inferred ones`;

/** Resolve a CSS custom property to a computed string */
function resolveCSSVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Resolve a type color from TC, falling back if it's a CSS var() */
function resolveTypeColor(type: string, fallback: string): string {
  const c = (TC as Record<string, { c?: string }>)[type]?.c;
  if (!c || c.startsWith("var(")) return fallback;
  return c;
}

export default function GraphView({ entries, activeBrain, onSelectEntry }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cosmographRef = useRef<CosmographRef>(undefined);
  const [filter, setFilter] = useState("");
  const [building, setBuilding] = useState(false);
  const [graphVersion, setGraphVersion] = useState(0);

  // Hydrate graph from DB on mount (populates localStorage cache)
  useEffect(() => {
    if (activeBrain?.id) {
      loadGraphFromDB(activeBrain.id).then(() => setGraphVersion((v) => v + 1));
    }
  }, [activeBrain?.id]);

  // Resolve theme colors for Cosmograph (CSS vars → computed values)
  const [tc, setTc] = useState({
    surface: "#1a1816",
    primary: "#a68b67",
    onSurface: "#f5f0ea",
    onSurfaceVariant: "#9a9590",
    outlineVariant: "#3a3835",
  });

  useEffect(() => {
    setTc({
      surface: resolveCSSVar("--color-surface", "#1a1816"),
      primary: resolveCSSVar("--color-primary", "#a68b67"),
      onSurface: resolveCSSVar("--color-on-surface", "#f5f0ea"),
      onSurfaceVariant: resolveCSSVar("--color-on-surface-variant", "#9a9590"),
      outlineVariant: resolveCSSVar("--color-outline-variant", "#3a3835"),
    });
  }, []);

  const buildGraph = useCallback(async () => {
    if (!activeBrain?.id || building) return;
    setBuilding(true);
    try {
      const visible = entries.filter((e) => !e.encrypted);
      const allSlim = visible.slice(0, 40).map(
        (e) => `- [${e.type}] ${e.title} (id:${e.id})${e.tags?.length ? ` [${e.tags.join(",")}]` : ""}:${(e.content || "").slice(0, 80)}`,
      );
      const res = await callAI({
        task: "refine",
        max_tokens: 4096,
        system: BUILD_GRAPH_PROMPT,
        brainId: activeBrain.id,
        messages: [{ role: "user", content: `ENTRIES (${visible.length} total):\n${allSlim.join("\n")}` }],
      });
      const data = await res.json();
      const raw = extractJSON(data.content?.[0]?.text || "{}");
      const p = JSON.parse(raw);
      if (p.concepts || p.relationships) {
        const newConcepts = p.concepts ? extractConcepts(p.concepts) : [];
        const newRels = p.relationships ? extractRelationships(p.relationships) : [];
        const existing = await loadGraphFromDB(activeBrain.id);
        const merged = mergeGraph(existing, { concepts: newConcepts, relationships: newRels });
        await saveGraphToDB(activeBrain.id, merged);
        setGraphVersion((v) => v + 1);
      }
    } catch (err) {
      console.error("[GraphView] build graph failed:", err);
    } finally {
      setBuilding(false);
    }
  }, [entries, activeBrain, building]);

  const { points, links } = useMemo(() => {
    if (!activeBrain?.id) return { points: [] as GraphPoint[], links: [] as GraphLink[] };
    const graph = loadGraph(activeBrain.id);
    const communities = detectCommunities(graph);

    const entryCommunity = new Map<string, number>();
    communities.forEach((c, i) => {
      for (const eid of c.entryIds) entryCommunity.set(eid, i);
    });

    const connectionCount = new Map<string, number>();
    for (const concept of graph.concepts) {
      for (const eid of concept.source_entries) {
        connectionCount.set(eid, (connectionCount.get(eid) || 0) + 1);
      }
    }

    const filteredEntries = filter
      ? entries.filter(
          (e) =>
            e.type.includes(filter.toLowerCase()) ||
            e.title.toLowerCase().includes(filter.toLowerCase()) ||
            (e.tags || []).some((t) => t.toLowerCase().includes(filter.toLowerCase())),
        )
      : entries;

    const connectedEntryIds = new Set<string>();
    for (const concept of graph.concepts) {
      for (const eid of concept.source_entries) connectedEntryIds.add(eid);
    }

    const pointsRaw = filteredEntries
      .filter((e) => !e.encrypted && connectedEntryIds.has(e.id));

    const idToIdx = new Map<string, number>();
    const points: GraphPoint[] = pointsRaw.map((e, i) => {
        idToIdx.set(e.id, i);
        const comm = entryCommunity.get(e.id) ?? -1;
        return {
          _idx: i,
          id: e.id,
          label: e.title.length > 24 ? e.title.slice(0, 22) + "\u2026" : e.title,
          type: e.type,
          connections: connectionCount.get(e.id) || 0,
          community: comm,
          color: comm >= 0
            ? COMMUNITY_COLORS[comm % COMMUNITY_COLORS.length]
            : resolveTypeColor(e.type, tc.primary),
        };
      });

    const links: GraphLink[] = [];
    const seen = new Set<string>();
    for (const rel of graph.relationships) {
      const srcEntries = graph.concepts.find((c) => c.id === rel.source_concept)?.source_entries || [];
      const tgtEntries = graph.concepts.find((c) => c.id === rel.target_concept)?.source_entries || [];
      for (const se of srcEntries) {
        for (const te of tgtEntries) {
          if (se === te) continue;
          const si = idToIdx.get(se);
          const ti = idToIdx.get(te);
          if (si === undefined || ti === undefined) continue;
          const key = [se, te].sort().join("|");
          if (seen.has(key)) continue;
          seen.add(key);
          links.push({ source: si, target: ti, label: rel.relation, value: rel.confidence_score });
        }
      }
    }

    return { points, links };
  }, [entries, activeBrain, filter, graphVersion, tc.primary]);

  const entryMap = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  // Cosmograph click: index-based, look up point to find entry
  const handleClick = useCallback(
    (index: number | undefined) => {
      if (index === undefined) return;
      const point = points[index];
      if (!point) return;
      const entry = entryMap.get(point.id);
      if (entry) onSelectEntry?.(entry);
    },
    [points, entryMap, onSelectEntry],
  );

  const handleSimulationEnd = useCallback(() => {
    cosmographRef.current?.fitView(400);
  }, []);

  if (!activeBrain?.id) {
    return (
      <div className="flex items-center justify-center p-8" style={{ color: "var(--color-on-surface-variant)" }}>
        Select a brain to view its knowledge graph
      </div>
    );
  }

  const hasEntries = entries.filter((e) => !e.encrypted).length > 0;

  if (!hasEntries) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 p-8 text-center"
        style={{ color: "var(--color-on-surface-variant)", minHeight: "100%" }}
      >
        <div className="text-4xl">&#x1f578;&#xfe0f;</div>
        <p className="text-sm font-medium" style={{ color: "var(--color-on-surface)" }}>
          No entries yet
        </p>
        <p className="text-xs">Add some entries to build your knowledge graph.</p>
      </div>
    );
  }

  if (links.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 p-8 text-center"
        style={{ color: "var(--color-on-surface-variant)", minHeight: "100%" }}
      >
        <div className="text-4xl">&#x1f578;&#xfe0f;</div>
        <p className="text-sm font-medium" style={{ color: "var(--color-on-surface)" }}>
          No connections yet
        </p>
        <p className="max-w-xs text-xs">
          Analyze your entries to discover concepts and connections between them.
        </p>
        <button
          onClick={buildGraph}
          disabled={building}
          className="press-scale text-on-primary bg-primary hover:bg-primary-dim mt-2 flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
        >
          {building ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" />
              </svg>
              Building Graph...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
              Build Knowledge Graph
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col"
      style={{ background: "var(--color-surface)", height: "calc(100dvh - 120px)" }}
    >
      {/* Filter bar */}
      <div className="flex items-center gap-2 px-4 py-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by type, tag, or title..."
          className="flex-1 rounded-xl px-3 py-2 text-xs outline-none"
          style={{
            background: "var(--color-surface-container)",
            border: "1px solid var(--color-outline-variant)",
            color: "var(--color-on-surface)",
          }}
        />
        <span className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
          {points.length} nodes · {links.length} edges
        </span>
        <button
          onClick={buildGraph}
          disabled={building}
          className="press-scale rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60"
          style={{
            background: "var(--color-surface-container)",
            color: "var(--color-primary)",
            border: "1px solid var(--color-outline-variant)",
          }}
          title="Re-analyze entries and discover new connections"
        >
          {building ? "Building..." : "Rebuild"}
        </button>
      </div>

      {/* Graph */}
      <div className="cosmograph-container" style={{ flex: 1, minHeight: 0 }}>
        <Cosmograph
          ref={cosmographRef}
          /* ── Data ── */
          points={points.length ? points : undefined}
          pointIndexBy="_idx"
          pointIdBy="id"
          links={links.length ? links : undefined}
          linkSourceBy="source"
          linkTargetBy="target"
          /* ── Point appearance ── */
          pointColorBy="color"
          pointSizeBy="connections"
          pointSizeRange={[8, 24]}
          pointDefaultColor={tc.primary}
          pointGreyoutOpacity={0.15}
          /* ── Link appearance ── */
          linkDefaultColor={tc.outlineVariant}
          linkWidthBy="value"
          linkWidthRange={[1, 4]}
          linkGreyoutOpacity={0.08}
          linkDefaultArrows
          /* ── Labels ── */
          pointLabelBy="label"
          pointLabelWeightBy="connections"
          showDynamicLabels
          showTopLabels
          showTopLabelsLimit={10}
          showHoveredPointLabel
          pointLabelColor={tc.onSurfaceVariant}
          pointLabelClassName="cosmograph-label"
          hoveredPointLabelClassName="cosmograph-label--hovered"
          pointLabelFontSize={11}
          /* ── Interaction ── */
          hoveredPointRingColor={tc.primary}
          focusedPointRingColor={tc.primary}
          hoveredPointCursor="pointer"
          selectPointOnClick="single"
          onClick={handleClick}
          /* ── Canvas ── */
          backgroundColor={tc.surface}
          fitViewOnInit
          fitViewDelay={800}
          fitViewPadding={0.05}
          fitViewDuration={600}
          scalePointsOnZoom
          /* ── Simulation ── */
          simulationFriction={0.85}
          simulationGravity={0.5}
          simulationRepulsion={0.4}
          simulationLinkSpring={1.0}
          simulationLinkDistance={8}
          simulationDecay={5000}
          onSimulationEnd={handleSimulationEnd}
          disableLogging
        />
      </div>
    </div>
  );
}
