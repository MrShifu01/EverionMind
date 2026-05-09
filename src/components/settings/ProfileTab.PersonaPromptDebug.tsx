// Extracted from ProfileTab.tsx (audit task 1319). Admin-only debug panel
// that fetches the live persona-extractor prompt + structured context. Kept
// in its own file because it's:
//   - admin-only (gated server-side at /api/entries?action=persona-prompt)
//   - self-contained — no import dependencies on ProfileTab internals
//   - ~470 lines that bloat the parent component for a feature 99% of users
//     never see.
//
// The wrapping ProfileTab still hosts the (admin-only) <PersonaPromptDebug />
// invocation; this file provides the implementation + DebugBlock/List helpers.

import { useEffect, useState, type JSX } from "react";
import { authFetch } from "../../lib/authFetch";
import { Button } from "../ui/button";

interface PersonaPromptPayload {
  context: {
    userName: string;
    fullName: string;
    pronouns: string;
    coreContext: string;
    confirmedFacts: string[];
    rejectedFacts: Array<{ title: string; reason: string | null }>;
    rejectedSummary: string | null;
  };
  prompt: string;
}

export function PersonaPromptDebug({
  brainId,
  refreshKey,
}: {
  brainId: string;
  refreshKey: string;
}): JSX.Element {
  const [data, setData] = useState<PersonaPromptPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  // Plain useState toggle. Replaced Radix accordion (which clipped async
  // content via `--radix-accordion-content-height` + outer `overflow-hidden`).
  // Symptom: panel rendered at the size measured on first open; close + reopen
  // would show slightly more each cycle as Radix re-measured. No animation,
  // no clipping, content always renders at natural height.
  const [expanded, setExpanded] = useState(false);
  const [distilling, setDistilling] = useState(false);
  const [distillMsg, setDistillMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await authFetch(
        `/api/entries?action=persona-prompt&brain_id=${encodeURIComponent(brainId)}`,
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as PersonaPromptPayload;
      setData(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Auto-load when expanded; auto-refresh whenever facts change so the
  // panel always shows current learnings.
  useEffect(() => {
    if (expanded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load() is recreated each render but reads brainId via closure; we only want to refire on the three explicit triggers below.
  }, [expanded, brainId, refreshKey]);

  async function distill() {
    setDistilling(true);
    setDistillMsg(null);
    try {
      const r = await authFetch("/api/entries?action=distill-rejected", { method: "POST" });
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.ok) {
        setDistillMsg(`Failed: ${json?.reason ?? `HTTP ${r.status}`}`);
        return;
      }
      setDistillMsg(
        json.summary
          ? `Distilled ${json.count} rejections into new rules.`
          : `${json.count} rejections — too few to distill yet.`,
      );
      await load();
    } catch (e) {
      setDistillMsg(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDistilling(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 32,
        paddingTop: 18,
        borderTop: "1px dashed var(--line)",
      }}
    >
      <button
        type="button"
        className="press"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "8px 4px",
          background: "transparent",
          border: 0,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            width: 14,
            height: 14,
            color: "var(--ember)",
            transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 200ms cubic-bezier(.16,1,.3,1)",
            flexShrink: 0,
          }}
        >
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path
              d="M1 1L5 5L9 1"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span
          className="f-mono"
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ember)",
          }}
        >
          Admin · live persona prompt
        </span>
        <span
          className="f-sans"
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "var(--ink-faint)",
            fontStyle: "italic",
          }}
        >
          watch the extractor learn
        </span>
      </button>
      {expanded && (
        <div>
          <div
            style={{
              marginTop: 12,
              padding: 16,
              background: "var(--surface-low)",
              border: "1px solid var(--line-soft)",
              borderRadius: 12,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {loading && !data && (
              <p className="f-mono" style={{ margin: 0, fontSize: 12, color: "var(--ink-faint)" }}>
                loading prompt…
              </p>
            )}
            {err && (
              <p className="f-mono" style={{ margin: 0, fontSize: 12, color: "var(--blood)" }}>
                error: {err}
              </p>
            )}

            {data && (
              <>
                <DebugBlock
                  label="Identity"
                  value={`${data.context.userName || "(no preferred name)"}${
                    data.context.fullName && data.context.fullName !== data.context.userName
                      ? `  ·  ${data.context.fullName}`
                      : ""
                  }${data.context.pronouns ? `  ·  ${data.context.pronouns}` : ""}`}
                />

                <DebugBlock
                  label="Core profile (About You)"
                  value={data.context.coreContext || "(empty)"}
                  multiline
                />

                <DebugList
                  label={`Confirmed facts the model already knows (${data.context.confirmedFacts.length})`}
                  items={data.context.confirmedFacts}
                  emptyText="None yet — facts confirmed via chat or pinned will appear here."
                />

                <div>
                  <div
                    className="f-sans"
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--ink-faint)",
                      marginBottom: 4,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>Distilled skip rules</span>
                    <Button
                      type="button"
                      onClick={distill}
                      disabled={distilling}
                      variant="outline"
                      size="xs"
                      className="rounded-full tracking-wider uppercase"
                      style={{
                        height: 22,
                        fontSize: 10,
                        background: "var(--ember-wash)",
                        color: "var(--ember)",
                        borderColor: "color-mix(in oklch, var(--ember) 30%, transparent)",
                      }}
                    >
                      {distilling ? "Distilling…" : "Distill now"}
                    </Button>
                    {distillMsg && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 500,
                          textTransform: "none",
                          letterSpacing: 0,
                          color: distillMsg.startsWith("Failed")
                            ? "var(--blood)"
                            : "var(--ink-faint)",
                          fontStyle: "italic",
                        }}
                      >
                        {distillMsg}
                      </span>
                    )}
                  </div>
                  {data.context.rejectedSummary ? (
                    <pre
                      className="f-mono"
                      style={{
                        margin: 0,
                        padding: 10,
                        background: "var(--surface)",
                        border: "1px solid var(--line-soft)",
                        borderRadius: 8,
                        fontSize: 12,
                        color: "var(--ink-soft)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        lineHeight: 1.55,
                      }}
                    >
                      {data.context.rejectedSummary}
                    </pre>
                  ) : (
                    <div
                      className="f-serif"
                      style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-faint)" }}
                    >
                      No distilled summary yet — happens automatically after ~20 rejections, or
                      click <em>Distill now</em>.
                    </div>
                  )}
                </div>

                <DebugRejectedList
                  label={`Recent specific rejections (${data.context.rejectedFacts.length})`}
                  items={data.context.rejectedFacts}
                  emptyText="No recent rejections. Mark facts as Not me and the most recent few appear here as concrete examples for the prompt."
                />

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Button
                    type="button"
                    onClick={() => setShowRaw((v) => !v)}
                    variant="outline"
                    size="sm"
                    style={{
                      color: showRaw ? "var(--ember)" : "var(--ink-soft)",
                      borderColor: showRaw ? "var(--ember)" : "var(--line-soft)",
                    }}
                  >
                    {showRaw ? "Hide raw prompt" : "Show raw prompt"}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => load()}
                    disabled={loading}
                    variant="outline"
                    size="sm"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {loading ? "Refreshing…" : "Refresh"}
                  </Button>
                  <span
                    className="f-sans"
                    style={{ fontSize: 11, color: "var(--ink-faint)", marginLeft: "auto" }}
                  >
                    {data.prompt.length.toLocaleString()} chars
                  </span>
                </div>

                {showRaw && (
                  <pre
                    className="f-mono"
                    style={{
                      margin: 0,
                      padding: 12,
                      background: "var(--surface)",
                      border: "1px solid var(--line-soft)",
                      borderRadius: 8,
                      fontSize: 11,
                      color: "var(--ink-soft)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      maxHeight: 480,
                      overflowY: "auto",
                      lineHeight: 1.55,
                    }}
                  >
                    {data.prompt}
                  </pre>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DebugBlock({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}): JSX.Element {
  return (
    <div>
      <div
        className="f-sans"
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink-faint)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        className="f-mono"
        style={{
          fontSize: 12,
          color: "var(--ink)",
          whiteSpace: multiline ? "pre-wrap" : "normal",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function DebugList({
  label,
  items,
  emptyText,
}: {
  label: string;
  items: string[];
  emptyText: string;
}): JSX.Element {
  return (
    <div>
      <div
        className="f-sans"
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink-faint)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {items.length === 0 ? (
        <div
          className="f-serif"
          style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-faint)" }}
        >
          {emptyText}
        </div>
      ) : (
        <ul
          style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2 }}
        >
          {items.map((it, i) => (
            <li
              key={i}
              className="f-mono"
              style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.5 }}
            >
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DebugRejectedList({
  label,
  items,
  emptyText,
}: {
  label: string;
  items: Array<{ title: string; reason: string | null }>;
  emptyText: string;
}): JSX.Element {
  return (
    <div>
      <div
        className="f-sans"
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink-faint)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {items.length === 0 ? (
        <div
          className="f-serif"
          style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-faint)" }}
        >
          {emptyText}
        </div>
      ) : (
        <ul
          style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}
        >
          {items.map((it, i) => (
            <li
              key={i}
              className="f-mono"
              style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.5 }}
            >
              {it.title}
              {it.reason && (
                <span style={{ color: "var(--ink-faint)", fontStyle: "italic" }}>
                  {"  —  "}
                  {it.reason}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
