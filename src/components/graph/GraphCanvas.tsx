import { useState, useRef, useEffect, useMemo } from "react";
import GraphNode from "./GraphNode";
import type { GNode, GEdge } from "../../hooks/useGraph";

interface Viewport {
  panX: number;
  panY: number;
  zoom: number;
}

interface Mote {
  x: number; y: number; size: number;
  dx: string; dy: string; dur: number; delay: number; op: number;
}

function useMotes(count: number): Mote[] {
  return useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 1 + Math.random() * 2,
        dx: (Math.random() - 0.5) * 60 + "px",
        dy: (Math.random() - 0.5) * 80 + "px",
        dur: 14 + Math.random() * 18,
        delay: Math.random() * -20,
        op: 0.04 + Math.random() * 0.08,
      })),
    [count],
  );
}

function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) + 0.01;
  const nx = -dy / len, ny = dx / len;
  const bulge = Math.min(len * 0.12, 35);
  return `M ${x1} ${y1} Q ${mx + nx * bulge} ${my + ny * bulge} ${x2} ${y2}`;
}

interface Props {
  nodes: GNode[];
  edges: GEdge[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onMoveNode: (id: string, x: number, y: number) => void;
}

// Large enough that the sim (centered at 0,0, radius ~800px) never clips
const WORLD_W = 2400;
const WORLD_H = 2000;

export default function GraphCanvas({ nodes, edges, selected, onSelect, onMoveNode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // pan = 0,0 means sim center (0,0) is at viewport center (via CSS left:50%/top:50%)
  const vpRef = useRef<Viewport>({ panX: 0, panY: 0, zoom: 0.8 });
  const [vp, setVpState] = useState<Viewport>({ panX: 0, panY: 0, zoom: 0.8 });
  const motes = useMotes(30);

  const setVp = (next: Viewport | ((prev: Viewport) => Viewport)) => {
    const value = typeof next === "function" ? next(vpRef.current) : next;
    vpRef.current = value;
    setVpState(value);
  };

  const dragRef = useRef<{
    type: "pan" | "node";
    startX: number; startY: number;
    nodeId?: string;
    nodeStartX?: number; nodeStartY?: number;
    moved?: boolean;
  } | null>(null);

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const connectedIds = useMemo(() => {
    if (!selected) return new Set<string>();
    const ids = new Set<string>([selected]);
    for (const e of edges) {
      if (e.source === selected) ids.add(e.target);
      if (e.target === selected) ids.add(e.source);
    }
    return ids;
  }, [selected, edges]);

  // Wheel to zoom — centered on cursor, adjusted for world being at CSS 50%/50%
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      // Cursor relative to the world origin (center of container)
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      setVp((prev) => {
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        const newZoom = Math.max(0.2, Math.min(3, prev.zoom * factor));
        const zf = newZoom / prev.zoom;
        return {
          panX: cx * (1 - zf) + prev.panX * zf,
          panY: cy * (1 - zf) + prev.panY * zf,
          zoom: newZoom,
        };
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  function onPointerDownCanvas(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("[data-graph-node]")) return;
    dragRef.current = {
      type: "pan",
      startX: e.clientX - vpRef.current.panX,
      startY: e.clientY - vpRef.current.panY,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerDownNode(e: React.PointerEvent, nodeId: string) {
    e.stopPropagation();
    const node = nodeMap.get(nodeId);
    if (!node) return;
    dragRef.current = {
      type: "node",
      startX: e.clientX,
      startY: e.clientY,
      nodeId,
      nodeStartX: node.x,
      nodeStartY: node.y,
      moved: false,
    };
    (e.currentTarget.closest("[data-graph-canvas]") as HTMLElement)?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    d.moved = true;
    if (d.type === "pan") {
      setVp((prev) => ({
        ...prev,
        panX: e.clientX - d.startX,
        panY: e.clientY - d.startY,
      }));
    } else if (d.type === "node" && d.nodeId !== undefined) {
      const zoom = vpRef.current.zoom;
      const dx = (e.clientX - d.startX) / zoom;
      const dy = (e.clientY - d.startY) / zoom;
      onMoveNode(d.nodeId, d.nodeStartX! + dx, d.nodeStartY! + dy);
    }
  }

  function onPointerUp() {
    const d = dragRef.current;
    if (d?.type === "pan" && !d.moved) onSelect(null);
    dragRef.current = null;
  }

  // The world div is anchored at the viewport center (left:50%, top:50%).
  // The sim places nodes around (0,0), so they naturally appear centered.
  // User pan/zoom shifts from that center position.
  const worldTransform = `translate(${vp.panX}px, ${vp.panY}px) scale(${vp.zoom})`;

  return (
    <div
      ref={containerRef}
      data-graph-canvas
      style={{
        flex: 1,
        position: "relative",
        overflow: "hidden",
        background: "var(--surface-dim)",
        cursor: "default",
        minWidth: 0,
      }}
      onPointerDown={onPointerDownCanvas}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {/* Ambient motes */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        {motes.map((m, i) => (
          <div
            key={i}
            className="mote"
            data-ambient
            style={{
              width: m.size, height: m.size,
              top: m.y + "%", left: m.x + "%",
              opacity: m.op,
              ["--dx" as string]: m.dx,
              ["--dy" as string]: m.dy,
              ["--b-high" as string]: "0.10",
              ["--b-low" as string]: "0.03",
              animation: `design-drift ${m.dur}s ease-in-out infinite ${m.delay}s, design-breathe ${8 + (i % 5)}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>

      {/* Ember halo at viewport center */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 600, height: 600, borderRadius: "50%",
          background: "radial-gradient(circle, var(--ember-wash) 0%, transparent 70%)",
          opacity: 0.3, pointerEvents: "none",
        }}
      />

      {/* World — anchored at viewport center, sim nodes are at (0,0) relative coords */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transformOrigin: "0 0",
          transform: worldTransform,
          width: WORLD_W,
          height: WORLD_H,
          // Shift so (0,0) in world == top-left of this div's pre-transform position (center of viewport)
          marginLeft: -WORLD_W / 2,
          marginTop: -WORLD_H / 2,
        }}
      >
        {/* SVG edges */}
        <svg
          style={{
            position: "absolute",
            left: WORLD_W / 2, top: WORLD_H / 2,
            overflow: "visible", pointerEvents: "none",
            width: 0, height: 0,
          }}
        >
          {edges.map((edge, i) => {
            const src = nodeMap.get(edge.source);
            const tgt = nodeMap.get(edge.target);
            if (!src || !tgt) return null;
            const active = selected !== null && (edge.source === selected || edge.target === selected);
            return (
              <path
                key={i}
                d={edgePath(src.x, src.y, tgt.x, tgt.y)}
                stroke={active ? "var(--ember)" : "#d4d4d4"}
                strokeWidth={active ? 1.5 : 1}
                opacity={active ? 0.65 : 0.45}
                fill="none"
                style={{ transition: "stroke 200ms, opacity 200ms, stroke-width 200ms" }}
              />
            );
          })}
        </svg>

        {/* Node cards — positioned relative to (WORLD_W/2, WORLD_H/2) which maps to (0,0) */}
        {nodes.map((node) => {
          const isFaded = selected !== null && !connectedIds.has(node.id);
          return (
            <GraphNode
              key={node.id}
              node={{ ...node, x: node.x + WORLD_W / 2, y: node.y + WORLD_H / 2 }}
              selected={selected === node.id}
              faded={isFaded}
              onClick={() => onSelect(selected === node.id ? null : node.id)}
              onPointerDown={(e) => onPointerDownNode(e, node.id)}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div
        style={{ position: "absolute", bottom: 20, left: 20, pointerEvents: "none" }}
        className="f-serif"
      >
        <div style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-faint)" }}>
          {nodes.length} entries · {edges.length} connections
        </div>
      </div>

      <div
        style={{
          position: "absolute", top: 16, right: 16,
          fontSize: 11, fontFamily: "var(--f-sans)",
          color: "var(--ink-ghost)", pointerEvents: "none",
          letterSpacing: "0.04em",
        }}
      >
        scroll to zoom · drag to pan
      </div>
    </div>
  );
}
