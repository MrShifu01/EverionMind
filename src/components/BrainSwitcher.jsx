import { useState, useRef, useEffect } from "react";
import CreateBrainModal from "./CreateBrainModal";

/**
 * BrainSwitcher — header dropdown to switch between brains,
 * create a new shared brain, or manage the current one.
 */
export default function BrainSwitcher({ brains, activeBrain, onSwitch, onBrainCreated, onBrainDeleted, onBrainTip }) {
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const ref = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const personalBrains = brains.filter(b => b.type === "personal");
  const sharedBrains = brains.filter(b => b.type !== "personal");

  function select(brain) {
    onSwitch(brain);
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Switch brain"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 10px",
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 8,
          color: "#e8e8e8",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          maxWidth: 200,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        <span style={{ fontSize: 15 }}>{activeBrain?.type === "personal" ? "🧠" : activeBrain?.type === "business" ? "🏪" : "🏠"}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {activeBrain?.name || "Select Brain"}
        </span>
        <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 2 }}>{open ? "▲" : "▼"}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          left: 0,
          minWidth: 220,
          background: "#1e1e2e",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          zIndex: 999,
          overflow: "hidden",
        }}>
          {/* Personal brains */}
          {personalBrains.length > 0 && (
            <div style={{ padding: "6px 0 2px 12px", fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>
              Personal
            </div>
          )}
          {personalBrains.map(b => (
            <BrainItem
              key={b.id}
              brain={b}
              active={activeBrain?.id === b.id}
              onSelect={select}
              emoji="🧠"
            />
          ))}

          {/* Shared brains */}
          {sharedBrains.length > 0 && (
            <div style={{ padding: "8px 0 2px 12px", fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>
              Shared
            </div>
          )}
          {sharedBrains.map(b => (
            <BrainItem
              key={b.id}
              brain={b}
              active={activeBrain?.id === b.id}
              onSelect={select}
              emoji={b.type === "business" ? "🏪" : "🏠"}
              role={b.myRole}
              canDelete={b.myRole === "owner"}
              onDelete={() => { onBrainDeleted(b.id); setOpen(false); }}
            />
          ))}

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "4px 0" }} />

          {/* Create new shared brain */}
          <button
            onClick={() => { setOpen(false); setShowCreate(true); }}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "9px 14px",
              background: "none",
              border: "none",
              color: "#7c8ff0",
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>+</span> New shared brain
          </button>
        </div>
      )}

      {showCreate && (
        <CreateBrainModal
          onClose={() => setShowCreate(false)}
          onCreate={async (brain, brainType) => {
            await onBrainCreated(brain);
            onBrainTip?.(brain);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function BrainItem({ brain, active, onSelect, emoji, role, canDelete, onDelete }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 14px",
        background: active ? "rgba(124,143,240,0.15)" : hovered ? "rgba(255,255,255,0.04)" : "transparent",
        cursor: "pointer",
        gap: 8,
      }}
    >
      <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}
        onClick={() => onSelect(brain)}>
        <span>{emoji}</span>
        <span style={{ fontSize: 13, color: active ? "#a5b4fc" : "#d4d4d8", fontWeight: active ? 600 : 400 }}>
          {brain.name}
        </span>
        {role && role !== "owner" && (
          <span style={{ fontSize: 10, color: "#666", background: "rgba(255,255,255,0.06)", borderRadius: 4, padding: "1px 5px" }}>
            {role}
          </span>
        )}
        {active && <span style={{ marginLeft: "auto", fontSize: 12, color: "#7c8ff0" }}>✓</span>}
      </span>
      {canDelete && hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete brain"
          style={{
            background: "none", border: "none", color: "#f87171",
            cursor: "pointer", fontSize: 13, padding: "0 2px", lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
