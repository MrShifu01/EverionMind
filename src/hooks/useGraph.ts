import { useState, useCallback, useEffect } from "react";
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

// Simulation is centered at (0, 0) — world container is positioned at
// viewport center via CSS, so no panX/panY computation needed on init.
export const SIM_CX = 0;
export const SIM_CY = 0;

const REPULSION = 5000;
const SPRING_K = 0.02;
const REST_LEN = 90;
const CENTER_K = 0.010;
const DAMPING = 0.82;
const ALPHA_DECAY = 0.97;
const MIN_ALPHA = 0.005;

interface SimNode extends GNode {
  vx: number;
  vy: number;
}

function runSim(nodes: SimNode[], edges: GEdge[]): SimNode[] {
  if (nodes.length === 0) return nodes;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  let alpha = 1;

  while (alpha > MIN_ALPHA) {
    alpha *= ALPHA_DECAY;
    const n = nodes.length;

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

    for (const node of nodes) {
      // Centering force pulls toward (0,0)
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

  // Edges from concept co-occurrence
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
  const topEdges = rawEdges.slice(0, MAX_EDGES);

  // Concentric circle starting positions centered on (0, 0)
  const simNodes: SimNode[] = displayEntries.map((entry, i) => {
    const ring = Math.floor(i / 12);
    const posInRing = i % 12;
    const ringSize = Math.min(12, displayEntries.length - ring * 12);
    const angle = (posInRing / ringSize) * 2 * Math.PI;
    const radius = 55 + ring * 65;
    return {
      id: entry.id,
      entry,
      x: SIM_CX + Math.cos(angle) * radius,
      y: SIM_CY + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
    };
  });

  const settled = runSim(simNodes, topEdges);
  const nodes: GNode[] = settled.map(({ id, entry, x, y }) => ({ id, entry, x, y }));
  return { nodes, edges: topEdges };
}

export function useGraph() {
  const { entries, entriesLoaded } = useEntries();
  const { conceptGraph } = useConceptGraph();

  const [nodes, setNodes] = useState<GNode[]>([]);
  const [edges, setEdges] = useState<GEdge[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const displayEntries = [...entries]
      .filter((e) => e.type !== "secret")
      .sort((a, b) => {
        const ai = a.importance ?? -1;
        const bi = b.importance ?? -1;
        if (ai !== bi) return bi - ai;
        return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      })
      .slice(0, MAX_NODES);

    const concepts = conceptGraph?.concepts ?? [];
    const result = buildGraph(displayEntries, concepts);
    setNodes(result.nodes);
    setEdges(result.edges);
  }, [entries, conceptGraph]);

  const moveNode = useCallback((id: string, x: number, y: number) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
  }, []);

  return { nodes, edges, selected, setSelected, moveNode, entriesLoaded };
}
