import { useMemo, useCallback, useRef, useState, useEffect, lazy, Suspense } from "react";
import { TC } from "../data/constants";
import { loadGraph, saveGraph, mergeGraph, extractConcepts, extractRelationships, detectCommunities } from "../lib/conceptGraph";
import { callAI } from "../lib/ai";
import type { Entry, Brain } from "../types";

const ForceGraph2D = lazy(() => import("react-force-graph-2d"));

interface GraphNode {
  id: string;
  label: string;
  type: string;
  connections: number;
  community?: number;
  // d3 force positions (mutated by the engine)
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string;
  target: string;
  label: string;
  value: number;
}

interface GraphViewProps {
  entries: Entry[];
  activeBrain: Brain | null;
  onSelectEntry?: (entry: Entry) => void;
}

const COMMUNITY_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
  "#8b5cf6", "#ef4444", "#14b8a6", "#f97316", "#06b6d4",
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

export default function GraphView({ entries, activeBrain, onSelectEntry }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [filter, setFilter] = useState("");
  const [building, setBuilding] = useState(false);
  const [graphVersion, setGraphVersion] = useState(0);

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => {
      const { width, height } = es[0].contentRect;
      setDimensions({ width: Math.max(300, width), height: Math.max(300, height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
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
        const existing = loadGraph(activeBrain.id);
        const merged = mergeGraph(existing, { concepts: newConcepts, relationships: newRels });
        saveGraph(activeBrain.id, merged);
        setGraphVersion((v) => v + 1);
      }
    } catch (err) {
      console.error("[GraphView] build graph failed:", err);
    } finally {
      setBuilding(false);
    }
  }, [entries, activeBrain, building]);

  const { nodes, links } = useMemo(() => {
    if (!activeBrain?.id) return { nodes: [], links: [] };
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

    const entryIds = new Set(filteredEntries.map((e) => e.id));

    // Only include entries that have at least 1 concept connection
    const connectedEntryIds = new Set<string>();
    for (const concept of graph.concepts) {
      for (const eid of concept.source_entries) connectedEntryIds.add(eid);
    }

    const nodes: GraphNode[] = filteredEntries
      .filter((e) => !e.encrypted && connectedEntryIds.has(e.id))
      .map((e) => ({
        id: e.id,
        label: e.title.length > 24 ? e.title.slice(0, 22) + "..." : e.title,
        type: e.type,
        connections: connectionCount.get(e.id) || 0,
        community: entryCommunity.get(e.id),
      }));

    // Build links from relationships
    const links: GraphLink[] = [];
    const seen = new Set<string>();
    for (const rel of graph.relationships) {
      const srcEntries = graph.concepts.find((c) => c.id === rel.source_concept)?.source_entries || [];
      const tgtEntries = graph.concepts.find((c) => c.id === rel.target_concept)?.source_entries || [];
      for (const se of srcEntries) {
        for (const te of tgtEntries) {
          if (se === te || !entryIds.has(se) || !entryIds.has(te)) continue;
          if (!connectedEntryIds.has(se) || !connectedEntryIds.has(te)) continue;
          const key = [se, te].sort().join("|");
          if (seen.has(key)) continue;
          seen.add(key);
          links.push({ source: se, target: te, label: rel.relation, value: rel.confidence_score });
        }
      }
    }

    return { nodes, links };
  }, [entries, activeBrain, filter, graphVersion]);

  // Configure d3 forces once the engine is available
  const forcesConfigured = useRef(false);
  useEffect(() => {
    forcesConfigured.current = false;
  }, [graphVersion]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || forcesConfigured.current || nodes.length === 0) return;
    forcesConfigured.current = true;

    // Center force — keeps the cluster at origin
    fg.d3Force("center")?.strength(1);

    // Charge — nodes repel each other so they don't overlap
    fg.d3Force("charge")?.strength(-120).distanceMax(300);

    // Link — connected nodes pull toward each other
    fg.d3Force("link")?.distance(60).strength(0.7);

    // Remove any y-gravity that causes downward drift
    fg.d3Force("gravity", null);

    // Reheat so new forces take effect
    fg.d3ReheatSimulation();

    // Zoom to fit after layout settles
    setTimeout(() => {
      fg.zoomToFit(400, 60);
    }, 1500);
  }, [nodes, links, graphVersion]);

  // Also zoom to fit when engine fully stops
  const zoomedRef = useRef(false);
  useEffect(() => {
    zoomedRef.current = false;
  }, [graphVersion, filter]);

  const handleEngineStop = useCallback(() => {
    if (!zoomedRef.current && fgRef.current) {
      fgRef.current.zoomToFit(400, 60);
      zoomedRef.current = true;
    }
  }, []);

  const entryMap = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  const handleNodeClick = useCallback(
    (node: any) => {
      const entry = entryMap.get(node.id);
      if (entry) onSelectEntry?.(entry);
    },
    [entryMap, onSelectEntry],
  );

  // Custom node rendering — visible labels + properly sized dots
  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const baseSize = 5 + Math.min(node.connections * 2, 10);
      const color =
        node.community !== undefined
          ? COMMUNITY_COLORS[node.community % COMMUNITY_COLORS.length]
          : (TC as Record<string, any>)[node.type]?.c || "#6366f1";

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, baseSize, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label — scale-aware so it stays readable at any zoom
      const fontSize = Math.max(10 / globalScale, 3);
      ctx.font = `500 ${fontSize}px -apple-system, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText(node.label, node.x, node.y + baseSize + 2);
    },
    [],
  );

  // Transparent hit area slightly larger than drawn node
  const nodePointerAreaPaint = useCallback(
    (node: any, color: string, ctx: CanvasRenderingContext2D) => {
      const size = 8 + Math.min(node.connections * 2, 10);
      ctx.beginPath();
      ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    },
    [],
  );

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
        <div className="text-4xl">🕸️</div>
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
        <div className="text-4xl">🕸️</div>
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
      style={{ background: "var(--color-surface)", height: "100%", minHeight: "400px" }}
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
          {nodes.length} nodes · {links.length} edges
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
      <div className="flex-1">
        <Suspense
          fallback={
            <div className="flex items-center justify-center p-8" style={{ color: "var(--color-on-surface-variant)" }}>
              Loading graph...
            </div>
          }
        >
          <ForceGraph2D
            ref={fgRef}
            width={dimensions.width}
            height={dimensions.height - 52}
            graphData={{ nodes, links }}
            nodeCanvasObject={nodeCanvasObject}
            nodePointerAreaPaint={nodePointerAreaPaint}
            onNodeClick={handleNodeClick}
            linkColor={() => "rgba(150,150,255,0.25)"}
            linkWidth={(link: any) => Math.max(1, link.value * 3)}
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleSpeed={0.005}
            backgroundColor="transparent"
            cooldownTicks={200}
            onEngineStop={handleEngineStop}
            d3AlphaDecay={0.05}
            d3VelocityDecay={0.5}
            nodeRelSize={6}
            minZoom={0.5}
            maxZoom={8}
          />
        </Suspense>
      </div>
    </div>
  );
}
