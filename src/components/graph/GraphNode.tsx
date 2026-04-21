import type { GNode } from "../../hooks/useGraph";

export const NODE_W = 180;
export const NODE_H = 96;

const TYPE_COLOR: Record<string, string> = {
  person: "var(--moss)",
  contact: "var(--moss)",
  event: "var(--moss)",
  health: "var(--moss)",
  finance: "var(--moss)",
  place: "var(--moss)",
  note: "var(--ember)",
  idea: "var(--ember)",
  reminder: "var(--ember)",
  decision: "var(--ember)",
  task: "var(--ink-soft)",
  document: "var(--ink-soft)",
  recipe: "var(--ink-soft)",
  other: "var(--ink-faint)",
};

interface GraphNodeProps {
  node: GNode;
  selected: boolean;
  faded: boolean;
  onClick: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
}

export default function GraphNode({
  node,
  selected,
  faded,
  onClick,
  onPointerDown,
}: GraphNodeProps) {
  const { entry } = node;
  const color = TYPE_COLOR[entry.type] ?? "var(--ink-faint)";
  const snippet = typeof entry.content === "string" ? entry.content : "";

  return (
    <div
      data-graph-node
      onPointerDown={onPointerDown}
      onClick={onClick}
      style={{
        position: "absolute",
        left: node.x - NODE_W / 2,
        top: node.y - NODE_H / 2,
        width: NODE_W,
        height: NODE_H,
        background: selected
          ? "color-mix(in oklch, var(--ember-wash) 50%, var(--surface))"
          : "var(--surface)",
        border: `1px solid ${selected ? "var(--ember)" : "var(--line-soft)"}`,
        borderRadius: 10,
        padding: "10px 12px",
        cursor: "grab",
        userSelect: "none",
        boxSizing: "border-box",
        overflow: "hidden",
        opacity: faded ? 0.2 : 1,
        transition: "border-color 180ms, background 180ms, opacity 200ms",
        boxShadow: selected ? "0 0 0 2px var(--ember), var(--lift-1)" : "var(--lift-1)",
      }}
    >
      {/* Type indicator row */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
          }}
        />
        <span
          className="f-sans"
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "var(--ink-faint)",
          }}
        >
          {entry.type}
        </span>
      </div>

      {/* Title */}
      <div
        className="f-serif"
        style={{
          fontSize: 13,
          fontWeight: 450,
          color: "var(--ink)",
          lineHeight: 1.3,
          letterSpacing: "-0.01em",
          display: "-webkit-box",
          WebkitLineClamp: snippet ? 2 : 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {entry.title}
      </div>

      {/* Snippet */}
      {snippet && (
        <div
          className="f-serif"
          style={{
            fontSize: 11,
            fontStyle: "italic",
            color: "var(--ink-faint)",
            marginTop: 3,
            lineHeight: 1.3,
            display: "-webkit-box",
            WebkitLineClamp: 1,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {snippet}
        </div>
      )}
    </div>
  );
}
