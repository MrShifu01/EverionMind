import { useMemo, useState, useCallback, useEffect } from "react";
import { useEntries } from "../context/EntriesContext";
import { useConceptGraph } from "../context/ConceptGraphContext";
import type { Entry, Concept } from "../types";

export interface GNode {
  id: string;
  entry: Entry;
  x: number;
  y: number;
}

export interface GEdge {
  source: string;
  target: string;
  weight: number;
}

const MAX_NODES = 80;
const MAX_EDGES = 120;
const REPULSION = 18000;
const SPRING_K = 0.02;
const REST_LEN = 270;
const CENTER_K = 0.006;
const DAMPING = 0.82;
const ALPHA_DECAY = 0.97;
const MIN_ALPHA = 0.005;
// Simulation center in world coordinates
export const SIM_CX = 900;
export const SIM_CY = 700;

interface SimNode extends GNode {
  vx: number;
  vy: number;
}

function runSim(nodes: SimNode[], edges: GEdge[]): SimNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  let alpha = 1;

  while (alpha > MIN_ALPHA) {
    alpha *= ALPHA_DECAY;
    const n = nodes.length;

    // Repulsion between all pairs
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = Math.max(dx * dx + dy * dy, 1);
        const d = Math.sqrt(d2);
        const f = (REPULSION * alpha) / d2;
        const fx = (f * dx) / d;
        const fy = (f * dy) / d;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }

    // Spring forces on edges
    for (const edge of edges) {
      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      if (!src || !tgt) continue;
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const f = SPRING_K * (d - REST_LEN) * alpha;
      const fx = (f * dx) / d;
      const fy = (f * dy) / d;
      src.vx += fx; src.vy += fy;
      tgt.vx -= fx; tgt.vy -= fy;
    }

    // Centering + integrate
    for (const node of nodes) {
      node.vx += (SIM_CX - node.x) * CENTER_K * alpha;
      node.vy += (SIM_CY - node.y) * CENTER_K * alpha;
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      node.x += node.vx;
      node.y += node.vy;
    }
  }

  return nodes;
}

function buildGraph(
  displayEntries: Entry[],
  concepts: Concept[],
): { nodes: GNode[]; edges: GEdge[] } {
  if (displayEntries.length === 0) return { nodes: [], edges: [] };

  const displayIds = new Set(displayEntries.map((e) => e.id));

  // Derive edges from concept co-occurrence
  const pairWeight = new Map<string, number>();
  for (const concept of concepts) {
    const relevant = concept.source_entries.filter((id) => displayIds.has(id));
    for (let i = 0; i < relevant.length; i++) {
      for (let j = i + 1; j < relevant.length; j++) {
        const a = relevant[i], b = relevant[j];
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        pairWeight.set(key, (pairWeight.get(key) ?? 0) + 1);
      }
    }
  }

  const rawEdges: GEdge[] = [];
  pairWeight.forEach((weight, key) => {
    const [source, target] = key.split("|");
    rawEdges.push({ source, target, weight });
  });
  rawEdges.sort((a, b) => b.weight - a.weight);
  const edges = rawEdges.slice(0, MAX_EDGES);

  // Initial positions: concentric circles so sim converges quickly
  const simNodes: SimNode[] = displayEntries.map((entry, i) => {
    const ring = Math.floor(i / 12);
    const posInRing = i % 12;
    const ringSize = Math.min(12, displayEntries.length - ring * 12);
    const angle = (posInRing / ringSize) * 2 * Math.PI;
    const radius = 280 + ring * 220;
    return {
      id: entry.id,
      entry,
      x: SIM_CX + Math.cos(angle) * radius,
      y: SIM_CY + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
    };
  });

  const settled = runSim(simNodes, edges);
  const nodes: GNode[] = settled.map(({ id, entry, x, y }) => ({ id, entry, x, y }));
  return { nodes, edges };
}

export function useGraph() {
  const { entries } = useEntries();
  const { conceptGraph } = useConceptGraph();

  const displayEntries = useMemo(
    () =>
      [...entries]
        .filter((e) => e.type !== "secret")
        .sort((a, b) => {
          if (a.importance !== undefined && b.importance !== undefined)
            return b.importance - a.importance;
          if (a.importance !== undefined) return -1;
          if (b.importance !== undefined) return 1;
          return (b.created_at ?? "").localeCompare(a.created_at ?? "");
        })
        .slice(0, MAX_NODES),
    [entries],
  );

  const concepts = useMemo(() => conceptGraph?.concepts ?? [], [conceptGraph]);

  const [nodes, setNodes] = useState<GNode[]>([]);
  const [edges, setEdges] = useState<GEdge[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  // Recompute layout only when entry count or concept count changes
  const entryKey = displayEntries.map((e) => e.id).join(",");
  const conceptKey = concepts.length;
  useEffect(() => {
    const { nodes, edges } = buildGraph(displayEntries, concepts);
    setNodes(nodes);
    setEdges(edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryKey, conceptKey]);

  const moveNode = useCallback((id: string, x: number, y: number) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
  }, []);

  return { nodes, edges, selected, setSelected, moveNode };
}
