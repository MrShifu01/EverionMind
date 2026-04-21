import { useState, useRef, useEffect, useMemo, useLayoutEffect } from "react";
import GraphNode, { NODE_W, NODE_H } from "./GraphNode";
import type { GNode, GEdge } from "../../hooks/useGraph";
import { SIM_CX, SIM_CY } from "../../hooks/useGraph";

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

const WORLD_W = 1800;
const WORLD_H = 1400;

export default function GraphCanvas({ nodes, edges, selected, onSelect, onMoveNode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vpRef = useRef<Viewport>({ panX: 0, panY: 0, zoom: 0.9 });
  const [vp, setVpState] = useState<Viewport>({ panX: 0, panY: 0, zoom: 0.9 });
  const motes = useMotes(30);

  const setVp = (next: Viewport | ((prev: Viewport) => Viewport)) => {
    const value = typeof next === "function" ? next(vpRef.current) : next;
    vpRef.current = value;
    setVpState(value);
  };

  // Center the simulation on mount
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    const zoom = 0.9;
    setVp({ panX: width / 2 - SIM_CX * zoom, panY: height / 2 - SIM_CY * zoom, zoom });
  }, []);

  // Drag state ref — no re-renders during drag tracking
  const dragRef = useRef<{
    type: "pan" | "node";
    startX: number; startY: number;
    nodeId?: string;
    nodeStartX?: number; nodeStartY?: number;
    moved?: boolean;
  } | null>(null);

  // Edge map for fast connected-node lookup
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

  // Wheel zoom centered on cursor
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setVp((prev) => {
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        const newZoom = Math.max(0.25, Math.min(2.5, prev.zoom * factor));
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
    // If the target is a node, let the node handler take over
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

  function onPointerUp(e: React.PointerEvent) {
    const d = dragRef.current;
    // Click on canvas (no movement) deselects
    if (d?.type === "pan" && !d.moved) {
      onSelect(null);
    }
    dragRef.current = null;
  }

  const worldStyle: React.CSSProperties = {
    position: "absolute",
    transformOrigin: "0 0",
    transform: `translate(${vp.panX}px, ${vp.panY}px) scale(${vp.zoom})`,
    width: WORLD_W,
    height: WORLD_H,
  };

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
      }}
      onPointerDown={onPointerDownCanvas}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {/* Ambient motes — fixed to viewport */}
      <div className="motes" aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
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

      {/* Soft ember halo — fixed to viewport center */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 700, height: 700,
          borderRadius: "50%",
          background: "radial-gradient(circle, var(--ember-wash) 0%, transparent 70%)",
          opacity: 0.3,
          pointerEvents: "none",
        }}
      />

      {/* World container — all graph elements live here */}
      <div style={worldStyle}>
        {/* SVG edge layer */}
        <svg
          style={{
            position: "absolute", inset: 0,
            width: WORLD_W, height: WORLD_H,
            pointerEvents: "none", overflow: "visible",
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

        {/* Node cards */}
        {nodes.map((node) => {
          const isFaded = selected !== null && !connectedIds.has(node.id);
          return (
            <GraphNode
              key={node.id}
              node={node}
              selected={selected === node.id}
              faded={isFaded}
              onClick={() => onSelect(selected === node.id ? null : node.id)}
              onPointerDown={(e) => onPointerDownNode(e, node.id)}
            />
          );
        })}
      </div>

      {/* Legend — fixed to viewport */}
      <div
        style={{ position: "absolute", bottom: 20, left: 20, pointerEvents: "none" }}
        className="f-serif"
      >
        <div style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-faint)" }}>
          {nodes.length} entries · {edges.length} connections
        </div>
      </div>

      {/* Zoom hint — top right */}
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
