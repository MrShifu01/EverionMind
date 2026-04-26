import { useState } from "react";
import type { ChatMessage, DebugInfo } from "../hooks/useChat";

function ToolCallDebug({ tc }: { tc: NonNullable<ChatMessage["tool_calls"]>[number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        border: "1px solid var(--line-soft)",
        borderRadius: 6,
        overflow: "hidden",
        fontFamily: "monospace",
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "5px 10px",
          background: "var(--surface-low)",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "var(--ink-soft)",
          fontSize: 11,
        }}
      >
        <span style={{ color: "var(--ember)", fontWeight: 600, flexShrink: 0 }}>fn</span>
        <span style={{ fontWeight: 600 }}>{tc.tool}</span>
        <span style={{ marginLeft: "auto", opacity: 0.5, fontSize: 10 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ borderTop: "1px solid var(--line-soft)", fontSize: 11 }}>
          {tc.args != null && (
            <div style={{ padding: "6px 10px", borderBottom: "1px solid var(--line-soft)" }}>
              <div
                style={{
                  color: "var(--ink-ghost)",
                  marginBottom: 3,
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                args
              </div>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  color: "var(--ink-soft)",
                  maxHeight: 180,
                  overflow: "auto",
                }}
              >
                {JSON.stringify(tc.args, null, 2)}
              </pre>
            </div>
          )}
          <div style={{ padding: "6px 10px" }}>
            <div
              style={{
                color: "var(--ink-ghost)",
                marginBottom: 3,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              result
            </div>
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                color: "var(--ink-soft)",
                maxHeight: 180,
                overflow: "auto",
              }}
            >
              {JSON.stringify(tc.result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

interface AdminDebugPanelProps {
  debug: DebugInfo;
  toolCalls?: ChatMessage["tool_calls"];
}

export default function AdminDebugPanel({ debug, toolCalls }: AdminDebugPanelProps) {
  const [open, setOpen] = useState(false);
  const hasTools = toolCalls && toolCalls.length > 0;
  return (
    <div style={{ marginTop: 10, borderTop: "1px dashed var(--line-soft)", paddingTop: 8 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          color: "var(--ink-ghost)",
          fontFamily: "monospace",
          fontSize: 11,
          flexWrap: "wrap",
        }}
      >
        <span style={{ color: "var(--ember)", opacity: 0.7, fontSize: 10 }}>⬡</span>
        <span>{debug.provider}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>{debug.model}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>{debug.latency_ms}ms</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>
          {debug.rounds} {debug.rounds === 1 ? "round" : "rounds"}
        </span>
        {hasTools && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>
              {toolCalls.length} tool{toolCalls.length !== 1 ? "s" : ""}
            </span>
          </>
        )}
        {debug.error && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <span style={{ color: "var(--blood)" }}>error</span>
          </>
        )}
        <span style={{ opacity: 0.4, fontSize: 10, marginLeft: 2 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {debug.error && (
            <div
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                background: "var(--blood-wash)",
                border: "1px solid var(--blood)",
                fontFamily: "monospace",
                fontSize: 11,
                color: "var(--blood)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {debug.error}
            </div>
          )}
          {toolCalls?.map((tc, i) => (
            <ToolCallDebug key={i} tc={tc} />
          ))}
        </div>
      )}
    </div>
  );
}
