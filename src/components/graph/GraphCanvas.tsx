import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import type { GNode, GEdge } from "../../hooks/useGraph";

// ── Type → color ─────────────────────────────────────────────────────────────
const TYPE_COLOR: Record<string, string> = {
  person: "var(--moss)",
  contact: "var(--moss)",
  health: "var(--moss)",
  place: "var(--moss)",
  event: "oklch(65% 0.09 185)",
  finance: "oklch(68% 0.10 75)",
  transaction: "oklch(68% 0.10 75)",
  contract: "oklch(68% 0.10 75)",
  note: "var(--ember)",
  idea: "var(--ember)",
  insight: "var(--ember)",
  reminder: "var(--ember)",
  decision: "var(--ember)",
  task: "var(--ink-soft)",
  document: "var(--ink-soft)",
  recipe: "oklch(60% 0.06 50)",
  ingredient: "oklch(60% 0.06 50)",
  company: "oklch(62% 0.09 285)",
  other: "var(--ink-ghost)",
};

function typeColor(type: string): string {
  return TYPE_COLOR[type] ?? "var(--ink-ghost)";
}

function calcRadius(degree: number): number {
  return Math.max(4, Math.min(16, 4 + Math.sqrt(degree) * 3));
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Vp {
  panX: number;
  panY: number;
  zoom: number;
}

interface Props {
  nodes: GNode[];
  edges: GEdge[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onMoveNode: (id: string, x: number, y: number) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function GraphCanvas({ nodes, edges, selected, onSelect, onMoveNode }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const vpRef = useRef<Vp>({ panX: 0, panY: 0, zoom: 1 });
  const [vp, setVpState] = useState<Vp>({ panX: 0, panY: 0, zoom: 1 });
  const [hovered, setHovered] = useState<string | null>(null);
  const fittedRef = useRef(false);

  const setVp = useCallback((next: Vp | ((p: Vp) => Vp)) => {
    const v = typeof next === "function" ? next(vpRef.current) : next;
    vpRef.current = v;
    setVpState(v);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const e of edges) {
      d.set(e.source, (d.get(e.source) ?? 0) + 1);
      d.set(e.target, (d.get(e.target) ?? 0) + 1);
    }
    return d;
  }, [edges]);

  const connectedIds = useMemo(() => {
    if (!selected) return new Set<string>();
    const s = new Set([selected]);
    for (const e of edges) {
      if (e.source === selected) s.add(e.target);
      if (e.target === selected) s.add(e.source);
    }
    return s;
  }, [selected, edges]);

  const maxWeight = useMemo(() => Math.max(1, ...edges.map((e) => e.weight)), [edges]);

  // ── Auto-fit ──────────────────────────────────────────────────────────────
  const fitAll = useCallback(() => {
    const el = svgRef.current;
    if (!el || nodes.length === 0) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    const xs = nodes.map((n) => n.x),
      ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs);
    const minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const pad = 60;
    // Clamp zoom: never go so small that nodes become invisible dots
    const zoom = Math.max(
      0.3,
      Math.min(
        (rect.width - pad * 2) / Math.max(maxX - minX, 1),
        (rect.height - pad * 2) / Math.max(maxY - minY, 1),
        1.5,
      ),
    );
    setVp({
      panX: rect.width / 2 - ((minX + maxX) / 2) * zoom,
      panY: rect.height / 2 - ((minY + maxY) / 2) * zoom,
      zoom,
    });
  }, [nodes, setVp]);

  // Fit once after nodes first arrive
  useEffect(() => {
    if (nodes.length === 0 || fittedRef.current) return;
    const id = requestAnimationFrame(() => {
      fitAll();
      fittedRef.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [nodes, fitAll]);

  // Re-fit when node set changes substantially
  useEffect(() => {
    fittedRef.current = false;
  }, [nodes.length]);

  // ── Wheel zoom (desktop) ──────────────────────────────────────────────────
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setVp((prev) => {
        const f = e.deltaY < 0 ? 1.12 : 0.9;
        const z = Math.max(0.08, Math.min(6, prev.zoom * f));
        const r = z / prev.zoom;
        return { panX: cx + (prev.panX - cx) * r, panY: cy + (prev.panY - cy) * r, zoom: z };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setVp]);

  // ── Multi-pointer: pan + pinch-to-zoom ───────────────────────────────────
  // Track all active touches by pointerId
  const activePointers = useRef(new Map<number, { x: number; y: number }>());
  // Pan drag state (single pointer)
  const dragRef = useRef<{
    startX: number;
    startY: number;
    panOX: number;
    panOY: number;
    moved: boolean;
  } | null>(null);
  // Node drag state
  const nodeDragRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    nodeStartX: number;
    nodeStartY: number;
    moved: boolean;
  } | null>(null);
  // Pinch state (two pointers)
  const pinchRef = useRef<{ prevDist: number; cx: number; cy: number } | null>(null);

  function getPinchState() {
    const pts = [...activePointers.current.values()];
    if (pts.length < 2) return null;
    const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    const cx = (pts[0].x + pts[1].x) / 2;
    const cy = (pts[0].y + pts[1].y) / 2;
    return { dist, cx, cy };
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    svgRef.current?.setPointerCapture(e.pointerId);
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size >= 2) {
      // Two fingers → switch to pinch, cancel any pan
      dragRef.current = null;
      nodeDragRef.current = null;
      const p = getPinchState();
      if (p) pinchRef.current = { prevDist: p.dist, cx: p.cx, cy: p.cy };
      return;
    }

    // Single pointer
    const isNode = (e.target as Element).closest("[data-node]");
    if (isNode) {
      const nodeId = (isNode as HTMLElement).dataset.nodeId ?? "";
      const n = nodeMap.get(nodeId);
      if (n) {
        nodeDragRef.current = {
          nodeId,
          startX: e.clientX,
          startY: e.clientY,
          nodeStartX: n.x,
          nodeStartY: n.y,
          moved: false,
        };
      }
    } else {
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        panOX: e.clientX - vpRef.current.panX,
        panOY: e.clientY - vpRef.current.panY,
        moved: false,
      };
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size >= 2 && pinchRef.current) {
      // Pinch zoom
      const p = getPinchState();
      if (!p) return;
      const factor = p.dist / pinchRef.current.prevDist;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = p.cx - rect.left;
      const cy = p.cy - rect.top;
      setVp((prev) => {
        const z = Math.max(0.08, Math.min(6, prev.zoom * factor));
        const r = z / prev.zoom;
        return { panX: cx + (prev.panX - cx) * r, panY: cy + (prev.panY - cy) * r, zoom: z };
      });
      pinchRef.current = { prevDist: p.dist, cx: p.cx, cy: p.cy };
      return;
    }

    // Node drag
    const nd = nodeDragRef.current;
    if (nd) {
      if (!nd.moved && (Math.abs(e.clientX - nd.startX) > 3 || Math.abs(e.clientY - nd.startY) > 3))
        nd.moved = true;
      if (nd.moved) {
        const z = vpRef.current.zoom;
        onMoveNode(
          nd.nodeId,
          nd.nodeStartX + (e.clientX - nd.startX) / z,
          nd.nodeStartY + (e.clientY - nd.startY) / z,
        );
      }
      return;
    }

    // Pan drag
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && (Math.abs(e.clientX - d.startX) > 3 || Math.abs(e.clientY - d.startY) > 3))
      d.moved = true;
    setVp((prev) => ({ ...prev, panX: e.clientX - d.panOX, panY: e.clientY - d.panOY }));
  }

  function onPointerEnd(e: React.PointerEvent<SVGSVGElement>) {
    activePointers.current.delete(e.pointerId);

    if (activePointers.current.size === 0) {
      // All fingers lifted
      const d = dragRef.current;
      if (d && !d.moved) onSelect(null); // tap on background = deselect
      dragRef.current = null;
      nodeDragRef.current = null;
      pinchRef.current = null;
    } else if (activePointers.current.size === 1) {
      // One finger lifted from a pinch — don't auto-start pan (prevents jump)
      pinchRef.current = null;
      dragRef.current = null;
      nodeDragRef.current = null;
    }
  }

  // ── Zoom buttons ──────────────────────────────────────────────────────────
  const zoomBy = useCallback(
    (delta: number) => {
      const el = svgRef.current;
      if (!el) return;
      const { width, height } = el.getBoundingClientRect();
      const cx = width / 2,
        cy = height / 2;
      setVp((prev) => {
        const z = Math.max(0.08, Math.min(6, prev.zoom * delta));
        const r = z / prev.zoom;
        return { panX: cx + (prev.panX - cx) * r, panY: cy + (prev.panY - cy) * r, zoom: z };
      });
    },
    [setVp],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  const showLabels = vp.zoom > 0.25;

  const zoomButtons = useMemo<{ label: string; title: string; action: () => void }[]>(
    () => [
      { label: "+", title: "Zoom in", action: () => zoomBy(1.35) },
      { label: "−", title: "Zoom out", action: () => zoomBy(0.74) },
      { label: "⊙", title: "Fit all", action: fitAll },
    ],
    [zoomBy, fitAll],
  );

  return (
    <div style={{ flex: 1, position: "relative", overflow: "hidden", touchAction: "none" }}>
      <svg
        ref={svgRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          background: "var(--surface-dim)",
          cursor: "default",
          touchAction: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <defs>
          <filter id="glow-sel" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="rg-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--ember)" stopOpacity="0.06" />
            <stop offset="100%" stopColor="var(--ember)" stopOpacity="0" />
          </radialGradient>
          <pattern id="dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="0.5" cy="0.5" r="0.7" fill="var(--ink)" fillOpacity="0.06" />
          </pattern>
        </defs>

        {/* Background */}
        <rect width="100%" height="100%" fill="url(#dots)" />
        <ellipse cx="50%" cy="50%" rx="42%" ry="38%" fill="url(#rg-halo)" />

        {/* Graph world */}
        <g transform={`translate(${vp.panX} ${vp.panY}) scale(${vp.zoom})`}>
          {/* Edges */}
          <g>
            {edges.map((edge, i) => {
              const src = nodeMap.get(edge.source);
              const tgt = nodeMap.get(edge.target);
              if (!src || !tgt) return null;
              const active =
                selected !== null && (edge.source === selected || edge.target === selected);
              const w = edge.weight / maxWeight;
              return (
                <line
                  key={i}
                  x1={src.x}
                  y1={src.y}
                  x2={tgt.x}
                  y2={tgt.y}
                  stroke={active ? "var(--ember)" : "var(--ink)"}
                  strokeWidth={active ? 1.5 : 0.5 + w * 0.7}
                  strokeOpacity={active ? 0.65 : 0.08 + w * 0.16}
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {nodes.map((node) => {
              const deg = degree.get(node.id) ?? 0;
              const r = calcRadius(deg);
              const color = typeColor(node.entry.type);
              const isSel = selected === node.id;
              const isConn = connectedIds.has(node.id);
              const isFade = selected !== null && !isConn;
              const isHov = hovered === node.id;
              const title = node.entry.title;
              const label = title.length > 28 ? title.slice(0, 26) + "…" : title;
              const labelOpacity = isSel || isHov ? 0.95 : isConn ? 0.75 : 0.38;

              return (
                <g
                  key={node.id}
                  data-node
                  data-node-id={node.id}
                  transform={`translate(${node.x} ${node.y})`}
                  opacity={isFade ? 0.1 : 1}
                  style={{ cursor: "pointer" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    svgRef.current?.setPointerCapture(e.pointerId);
                    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                    if (activePointers.current.size === 1) {
                      nodeDragRef.current = {
                        nodeId: node.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        nodeStartX: node.x,
                        nodeStartY: node.y,
                        moved: false,
                      };
                    }
                  }}
                  onClick={() => onSelect(isSel ? null : node.id)}
                  onMouseEnter={() => setHovered(node.id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {isSel && <circle r={r + 12} fill={color} fillOpacity={0.12} />}
                  {isHov && !isSel && (
                    <circle
                      r={r + 5}
                      fill="none"
                      stroke={color}
                      strokeOpacity={0.45}
                      strokeWidth={1}
                    />
                  )}
                  <circle
                    r={isHov && !isSel ? r * 1.18 : r}
                    fill={color}
                    fillOpacity={isSel ? 1 : 0.85}
                    filter={isSel ? "url(#glow-sel)" : undefined}
                  />
                  {r >= 7 && (
                    <circle
                      r={r * 0.32}
                      cx={-r * 0.18}
                      cy={-r * 0.22}
                      fill="white"
                      fillOpacity={0.22}
                    />
                  )}
                  {showLabels && (
                    <text
                      y={r + 13}
                      textAnchor="middle"
                      fontFamily="var(--f-serif)"
                      fontSize={10.5}
                      fill="var(--ink)"
                      fillOpacity={labelOpacity}
                      style={{ userSelect: "none", pointerEvents: "none" }}
                    >
                      {label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* Zoom controls */}
      <div
        style={{
          position: "absolute",
          bottom: 20,
          right: 16,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {/* svgRef is only read inside the click handlers (zoomBy/fitAll) — the
            rule's static analysis can't see the event-handler boundary. */}
        {/* eslint-disable-next-line react-hooks/refs */}
        {zoomButtons.map(({ label, title, action }) => (
          <button
            key={label}
            title={title}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={action}
            className="press"
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "var(--surface)",
              border: "1px solid var(--line-soft)",
              color: "var(--ink-soft)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: label === "⊙" ? 14 : 20,
              fontFamily: "var(--f-sans)",
              boxShadow: "var(--lift-2)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div
        style={{
          position: "absolute",
          bottom: 22,
          left: 16,
          fontFamily: "var(--f-serif)",
          fontStyle: "italic",
          fontSize: 12,
          color: "var(--ink-ghost)",
          pointerEvents: "none",
        }}
      >
        {nodes.length} nodes · {edges.length} connections
      </div>

      {vp.zoom < 0.45 && nodes.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            fontFamily: "var(--f-sans)",
            fontSize: 11,
            color: "var(--ink-ghost)",
            letterSpacing: "0.04em",
            pointerEvents: "none",
          }}
        >
          pinch to zoom · drag to pan
        </div>
      )}
    </div>
  );
}
