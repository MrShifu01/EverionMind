import { useState, useCallback } from "react";
import PropTypes from "prop-types";
import { authFetch } from "../lib/authFetch";
import { callAI } from "../lib/ai";
import { TC, MODEL } from "../data/constants";
import { useTheme } from "../ThemeContext";
import { PROMPTS } from "../config/prompts";

/* ─── Suggestion type metadata ─── */
const LABELS = {
  TYPE_MISMATCH:  { label: "Wrong type",      icon: "🔄", color: "#A29BFE" },
  PHONE_FOUND:    { label: "Phone number",    icon: "📞", color: "#45B7D1" },
  EMAIL_FOUND:    { label: "Email address",   icon: "✉️",  color: "#4ECDC4" },
  URL_FOUND:      { label: "URL / link",      icon: "🔗", color: "#FFEAA7" },
  DATE_FOUND:     { label: "Date / deadline", icon: "📅", color: "#FF6B35" },
  TITLE_POOR:     { label: "Better title",    icon: "✏️",  color: "#DDA0DD" },
  STALE_ENTRY:    { label: "Stale / outdated",icon: "🕰️", color: "#FF8C42" },
  CONTENT_SPARSE: { label: "Needs detail",    icon: "📝", color: "#74B9FF" },
  DATE_MISPLACED: { label: "Date fix",        icon: "📅", color: "#FDCB6E" },
  LIFE_CHANGE:    { label: "Life change",     icon: "🔀", color: "#E17055" },
  AI_QUESTION:    { label: "Question",        icon: "❓", color: "#FDA7DF" },
  LINK_SUGGESTED: { label: "Relationship",    icon: "⟷",  color: "#96CEB4" },
};


export default function RefineView({ entries, setEntries, links, addLinks, activeBrain, brains, onSwitchBrain }) {
  const { t } = useTheme();
  const [loading, setLoading]         = useState(false);
  const [suggestions, setSuggestions] = useState(null); // null = never run
  const [dismissed, setDismissed]     = useState(new Set());
  const [applying, setApplying]       = useState(new Set());
  const [editingKey, setEditingKey]   = useState(null);
  const [editValue, setEditValue]     = useState("");

  /* ── Analyze: entry quality + link discovery in parallel ── */
  const analyze = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setSuggestions(null);
    setDismissed(new Set());
    setEditingKey(null);

    const existingLinkKeys = new Set((links || []).map(l => `${l.from}-${l.to}`));
    const BATCH = 25;
    const entrySuggestions = [];

    /* Entry quality — batched */
    const batches = [];
    for (let i = 0; i < entries.length; i += BATCH) batches.push(entries.slice(i, i + BATCH));

    await Promise.all(batches.map(async (batch) => {
      const slim = batch.map(e => ({
        id:       e.id,
        title:    e.title,
        content:  (e.content || "").slice(0, 500),
        type:     e.type,
        metadata: e.metadata || {},
        tags:     e.tags || [],
        created_at: e.created_at || null,
      }));
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const res  = await callAI({
          max_tokens: 2000,
          system:     PROMPTS.ENTRY_AUDIT.replace("{{TODAY}}", todayStr),
          messages:   [{ role: "user", content: `Review these ${slim.length} entries:\n\n${JSON.stringify(slim)}` }],
        });
        const data = await res.json();
        const raw  = (data.content?.[0]?.text || "[]").replace(/```json|```/g, "").trim();
        try { const p = JSON.parse(raw); if (Array.isArray(p)) entrySuggestions.push(...p); } catch {}
      } catch {}
    }));

    /* Link discovery — embedding-powered pair selection */
    let linkSuggestions = [];
    // Named links have a `rel` property; similarity-only links have `similarity`
    const namedLinkKeys = new Set(
      (links || []).filter(l => l.rel).flatMap(l => [`${l.from}-${l.to}`, `${l.to}-${l.from}`])
    );
    // Find similarity pairs that don't already have a named relationship
    const similarityPairs = (links || [])
      .filter(l => typeof l.similarity === "number" && !namedLinkKeys.has(`${l.from}-${l.to}`) && !namedLinkKeys.has(`${l.to}-${l.from}`))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 30);

    const entryMap = Object.fromEntries(entries.map(e => [e.id, e]));

    if (similarityPairs.length > 0) {
      // Embedding-powered: send pre-selected candidate pairs to AI for naming
      const PAIR_BATCH = 15;
      const pairBatches = [];
      for (let i = 0; i < similarityPairs.length; i += PAIR_BATCH) pairBatches.push(similarityPairs.slice(i, i + PAIR_BATCH));

      await Promise.all(pairBatches.map(async (batch) => {
        const candidates = batch.map(l => {
          const a = entryMap[l.from], b = entryMap[l.to];
          if (!a || !b) return null;
          return {
            fromId: a.id, fromTitle: a.title, fromType: a.type, fromContent: (a.content || "").slice(0, 200), fromTags: (a.tags || []).slice(0, 6),
            toId: b.id, toTitle: b.title, toType: b.type, toContent: (b.content || "").slice(0, 200), toTags: (b.tags || []).slice(0, 6),
          };
        }).filter(Boolean);
        if (candidates.length === 0) return;
        try {
          const res = await callAI({
            max_tokens: 1200,
            system: PROMPTS.LINK_DISCOVERY_PAIRS,
            messages: [{ role: "user", content: `CANDIDATE PAIRS:\n${JSON.stringify(candidates)}` }],
          });
          const data = await res.json();
          const raw = (data.content?.[0]?.text || "[]").replace(/```json|```/g, "").trim();
          try {
            const p = JSON.parse(raw);
            if (Array.isArray(p)) {
              linkSuggestions.push(...p.filter(l =>
                l.fromId && l.toId &&
                !existingLinkKeys.has(`${l.fromId}-${l.toId}`) &&
                !existingLinkKeys.has(`${l.toId}-${l.fromId}`)
              ).map(l => ({ ...l, type: "LINK_SUGGESTED" })));
            }
          } catch {}
        } catch {}
      }));
    } else {
      // Fallback: no embeddings — use old approach with first 60 entries
      try {
        const slim = entries.slice(0, 60).map(e => ({
          id: e.id, title: e.title, type: e.type,
          content: (e.content || "").slice(0, 200),
          tags: (e.tags || []).slice(0, 6),
        }));
        const res  = await callAI({
          max_tokens: 1200,
          system:     PROMPTS.LINK_DISCOVERY,
          messages:   [{
            role:    "user",
            content: `Entries:\n${JSON.stringify(slim)}\n\nExisting links (do NOT re-suggest these):\n${JSON.stringify([...existingLinkKeys])}`,
          }],
        });
        const data = await res.json();
        const raw  = (data.content?.[0]?.text || "[]").replace(/```json|```/g, "").trim();
        try {
          const p = JSON.parse(raw);
          if (Array.isArray(p)) {
            linkSuggestions = p.filter(l =>
              l.fromId && l.toId &&
              !existingLinkKeys.has(`${l.fromId}-${l.toId}`) &&
              !existingLinkKeys.has(`${l.toId}-${l.fromId}`)
            ).map(l => ({ ...l, type: "LINK_SUGGESTED" }));
          }
        } catch {}
      } catch {}
    }

    setSuggestions([...entrySuggestions, ...linkSuggestions]);
    setLoading(false);
  }, [loading, entries, links]);

  /* ── Accept an entry-quality suggestion ── */
  const applyEntry = useCallback(async (s, override) => {
    const value = override ?? s.suggestedValue;
    const key   = `entry:${s.entryId}:${s.field}`;
    setApplying(p => new Set(p).add(key));

    const entry = entries.find(e => e.id === s.entryId);
    if (!entry) { setApplying(p => { const n = new Set(p); n.delete(key); return n; }); return; }

    const body = { id: entry.id };
    if (s.field === "type")  body.type  = value;
    else if (s.field === "title") body.title = value;
    else if (s.field === "content") body.content = value;
    else if (s.field === "tags") body.tags = [...new Set([...(entry.tags || []), ...value.split(",").map(t => t.trim()).filter(Boolean)])];
    else if (s.field.startsWith("metadata.")) {
      const k = s.field.slice("metadata.".length);
      body.metadata = { ...(entry.metadata || {}), [k]: value };
    }

    try {
      await authFetch("/api/update-entry", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      setEntries(prev => prev.map(e => {
        if (e.id !== entry.id) return e;
        if (s.field === "type")  return { ...e, type: value };
        if (s.field === "title") return { ...e, title: value };
        if (s.field === "content") return { ...e, content: value };
        if (s.field === "tags") return { ...e, tags: [...new Set([...(e.tags || []), ...value.split(",").map(t => t.trim()).filter(Boolean)])] };
        if (s.field.startsWith("metadata.")) {
          const k = s.field.slice("metadata.".length);
          return { ...e, metadata: { ...(e.metadata || {}), [k]: value } };
        }
        return e;
      }));
    } catch {}

    setDismissed(p => new Set(p).add(key));
    setApplying(p => { const n = new Set(p); n.delete(key); return n; });
    setEditingKey(null);
  }, [entries, setEntries]);

  /* ── Accept a link suggestion ── */
  const applyLink = useCallback(async (s, relOverride) => {
    const rel = relOverride ?? s.rel;
    const key = `link:${s.fromId}:${s.toId}`;
    setApplying(p => new Set(p).add(key));

    const newLink = { from: s.fromId, to: s.toId, rel };
    try {
      await authFetch("/api/save-links", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ links: [newLink] }),
      });
      addLinks?.([newLink]);
    } catch {}

    setDismissed(p => new Set(p).add(key));
    setApplying(p => { const n = new Set(p); n.delete(key); return n; });
    setEditingKey(null);
  }, [addLinks]);

  const reject = useCallback((key) => {
    setDismissed(p => new Set(p).add(key));
    setEditingKey(null);
  }, []);

  /* ── Key helpers ── */
  const keyOf = (s) => s.type === "LINK_SUGGESTED"
    ? `link:${s.fromId}:${s.toId}`
    : `entry:${s.entryId}:${s.field}`;

  /* ── Derived state ── */
  const visible   = (suggestions ?? []).filter(s => !dismissed.has(keyOf(s)));
  const linkCount = visible.filter(s => s.type === "LINK_SUGGESTED").length;
  const entryCount = visible.filter(s => s.type !== "LINK_SUGGESTED").length;
  const allDone   = suggestions !== null && suggestions.length > 0 && visible.length === 0;
  const noneFound = suggestions !== null && suggestions.length === 0;

  // Gate: non-owners of family/business brains cannot run Refine
  const isSharedBrain = activeBrain && activeBrain.type !== "personal";
  const isOwner = !activeBrain || activeBrain.myRole === "owner";
  const brainEmoji = activeBrain?.type === "business" ? "🏪" : activeBrain?.type === "family" ? "🏠" : "🧠";

  if (isSharedBrain && !isOwner) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>{brainEmoji}</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800, color: "#EAEAEA" }}>
          Refine — Owner Only
        </h2>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#666", lineHeight: 1.6 }}>
          Only the owner of <strong style={{ color: "#aaa" }}>{activeBrain.name}</strong> can run the Refine analysis.<br />
          Members can view and add entries, but AI auditing is reserved for the brain owner.
        </p>
        <div style={{ background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 12, padding: "14px 18px", display: "inline-block", fontSize: 12, color: "#888" }}>
          Ask the brain owner to run Refine and review the suggestions.
        </div>
      </div>
    );
  }

  const BRAIN_EMOJI = { personal: "🧠", business: "🏪", family: "🏠" };
  const isOwnerMultiBrain = isOwner && brains.length > 1;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#EAEAEA" }}>Refine{isSharedBrain ? ` — ${activeBrain.name}` : ""}</h2>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#555" }}>
          AI audits every entry — fixes data, spots stale info, detects life changes, and discovers relationships.
        </p>
        {/* Brain selector — owners only, when multiple brains exist */}
        {isOwnerMultiBrain && onSwitchBrain && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
            {brains.map(b => {
              const active = b.id === activeBrain?.id;
              return (
                <button key={b.id} onClick={() => onSwitchBrain(b)}
                  style={{ padding: "5px 12px", borderRadius: 20, border: active ? `1px solid ${t.accent}` : "1px solid #2a2a4a", background: active ? `${t.accent}20` : "#1a1a2e", color: active ? t.accent : "#888", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, minHeight: 44, minWidth: 44 }}>
                  <span>{BRAIN_EMOJI[b.type] || "🧠"}</span>
                  <span>{b.name}</span>
                </button>
              );
            })}
          </div>
        )}
        {!isOwnerMultiBrain && activeBrain && (
          <span style={{ display: "inline-block", marginTop: 8, fontSize: 11, color: "#666", background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 20, padding: "4px 12px" }}>
            {BRAIN_EMOJI[activeBrain.type] || "🧠"} {activeBrain.name}
          </span>
        )}
      </div>

      {/* Analyze button */}
      <button
        onClick={analyze}
        disabled={loading}
        style={{
          width: "100%", padding: "14px 20px", marginBottom: 20, minHeight: 44,
          background: !loading ? "linear-gradient(135deg, #A29BFE, #6C63FF)" : "#1a1a2e",
          border: "none", borderRadius: 14,
          color: !loading ? "#fff" : "#444",
          fontSize: 14, fontWeight: 700,
          cursor: !loading ? "pointer" : "default",
        }}
      >
        {loading ? "Analyzing…" : suggestions === null ? "✦ Analyze my brain" : "✦ Re-analyze"}
      </button>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "40px 20px", background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 14, marginBottom: 20 }}>
          <div style={{ fontSize: 22, marginBottom: 10 }}>✦</div>
          <p style={{ color: "#A29BFE", fontSize: 14, margin: 0, fontWeight: 600 }}>
            Deep-analyzing {entries.length} entries…
          </p>
          <p style={{ color: "#555", fontSize: 11, margin: "6px 0 0" }}>Quality fixes, stale detection, life changes, and relationship mapping</p>
        </div>
      )}

      {/* Stats */}
      {suggestions !== null && !loading && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[
            { l: "Entries",      v: entries.length,                              c: "#A29BFE" },
            { l: "Fixes",        v: visible.filter(s => s.type !== "LINK_SUGGESTED").length + dismissed.size - linkCount, c: t.accent },
            { l: "Links",        v: linkCount,                                   c: "#96CEB4" },
            { l: "Remaining",    v: visible.length,                              c: "#FF6B35" },
          ].map(s => (
            <div key={s.l} style={{ flex: 1, background: "#1a1a2e", borderRadius: 10, padding: "10px 6px", textAlign: "center", border: "1px solid #2a2a4a" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Nothing found */}
      {noneFound && !loading && (
        <div style={{ textAlign: "center", padding: "40px 20px", background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 14 }}>
          <div style={{ fontSize: 26, marginBottom: 10 }}>✓</div>
          <p style={{ color: t.accent, fontSize: 15, fontWeight: 700, margin: 0 }}>Everything looks clean</p>
          <p style={{ color: "#555", fontSize: 12, margin: "6px 0 0" }}>No high-confidence improvements or missing links found</p>
        </div>
      )}

      {/* All done */}
      {allDone && !loading && (
        <div style={{ textAlign: "center", padding: "40px 20px", background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 14 }}>
          <div style={{ fontSize: 26, marginBottom: 10 }}>✦</div>
          <p style={{ color: t.accent, fontSize: 15, fontWeight: 700, margin: 0 }}>All suggestions resolved</p>
          <p style={{ color: "#555", fontSize: 12, margin: "6px 0 0" }}>Re-analyze to check again</p>
        </div>
      )}

      {/* Section labels */}
      {!loading && entryCount > 0 && (
        <p style={{ fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, margin: "0 0 10px" }}>
          Entry fixes ({entryCount})
        </p>
      )}

      {/* Suggestion cards */}
      {visible.map((s) => {
        const key     = keyOf(s);
        const meta    = LABELS[s.type] || { label: s.type, icon: "•", color: "#888" };
        const busy    = applying.has(key);
        const isEdit  = editingKey === key;
        const isLink  = s.type === "LINK_SUGGESTED";

        // Section divider before first link card
        const sIdx    = visible.indexOf(s);
        const prevIsEntry = sIdx > 0 && visible[sIdx - 1].type !== "LINK_SUGGESTED";
        const showDivider = isLink && (sIdx === 0 || prevIsEntry);

        return (
          <div key={key}>
            {showDivider && (
              <p style={{ fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, margin: "16px 0 10px" }}>
                Missing relationships ({linkCount})
              </p>
            )}

            <div style={{ background: "#1a1a2e", border: `1px solid ${meta.color}28`, borderRadius: 14, padding: "16px", marginBottom: 12 }}>

              {isLink ? (
                /* ── Link card ── */
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 10, background: `${meta.color}18`, color: meta.color, padding: "2px 9px", borderRadius: 20, fontWeight: 700 }}>
                      {meta.icon} {meta.label}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    {/* From entry */}
                    <div style={{ flex: 1, background: "#0f0f23", border: "1px solid #2a2a4a", borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ fontSize: 9, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>From</div>
                      <div style={{ fontSize: 11, color: "#ccc", fontWeight: 600 }}>
                        {TC[entries.find(e => e.id === s.fromId)?.type]?.i || "📝"} {s.fromTitle}
                      </div>
                    </div>

                    {/* Rel label / edit input */}
                    <div style={{ textAlign: "center", flexShrink: 0 }}>
                      {isEdit ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" && editValue.trim()) applyLink(s, editValue.trim()); if (e.key === "Escape") setEditingKey(null); }}
                          placeholder="relationship…"
                          maxLength={50}
                          style={{ width: 90, padding: "5px 8px", background: "#0f0f23", border: `1px solid ${meta.color}50`, borderRadius: 6, color: "#ddd", fontSize: 11, outline: "none", fontFamily: "inherit", textAlign: "center" }}
                        />
                      ) : (
                        <span style={{ fontSize: 11, color: meta.color, fontWeight: 700, whiteSpace: "nowrap" }}>
                          ⟶ {s.rel} ⟶
                        </span>
                      )}
                    </div>

                    {/* To entry */}
                    <div style={{ flex: 1, background: "#0f0f23", border: "1px solid #2a2a4a", borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ fontSize: 9, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>To</div>
                      <div style={{ fontSize: 11, color: "#ccc", fontWeight: 600 }}>
                        {TC[entries.find(e => e.id === s.toId)?.type]?.i || "📝"} {s.toTitle}
                      </div>
                    </div>
                  </div>

                  <p style={{ margin: "0 0 12px", fontSize: 11, color: "#666", lineHeight: 1.5, fontStyle: "italic" }}>{s.reason}</p>

                  <div style={{ display: "flex", gap: 8 }}>
                    {isEdit ? (
                      <>
                        <button onClick={() => setEditingKey(null)} style={{ flex: 1, minHeight: 44, padding: "9px 0", background: "#252540", border: "none", borderRadius: 8, color: "#777", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                        <button onClick={() => editValue.trim() && applyLink(s, editValue.trim())} disabled={!editValue.trim() || busy} style={{ flex: 2, minHeight: 44, padding: "9px 0", background: editValue.trim() && !busy ? `linear-gradient(135deg, #96CEB4, ${t.accent})` : "#252540", border: "none", borderRadius: 8, color: editValue.trim() && !busy ? "#0f0f23" : "#444", fontSize: 12, fontWeight: 700, cursor: editValue.trim() && !busy ? "pointer" : "default" }}>Apply</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => reject(key)} disabled={busy} style={{ flex: 1, minHeight: 44, padding: "9px 0", background: "#252540", border: "none", borderRadius: 8, color: "#FF6B35", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✗ Reject</button>
                        <button onClick={() => { setEditingKey(key); setEditValue(s.rel); }} disabled={busy} style={{ flex: 1, minHeight: 44, padding: "9px 0", background: "#252540", border: "none", borderRadius: 8, color: "#FFEAA7", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✎ Edit</button>
                        <button onClick={() => applyLink(s)} disabled={busy} style={{ flex: 2, minHeight: 44, padding: "9px 0", background: busy ? "#252540" : `linear-gradient(135deg, #96CEB4, ${t.accent})`, border: "none", borderRadius: 8, color: busy ? "#444" : "#0f0f23", fontSize: 12, fontWeight: 700, cursor: busy ? "default" : "pointer" }}>
                          {busy ? "Saving…" : "✓ Accept"}
                        </button>
                      </>
                    )}
                  </div>
                </>
              ) : (
                /* ── Entry-quality card ── */
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 14 }}>{TC[entries.find(e => e.id === s.entryId)?.type]?.i || "📝"}</span>
                    <span style={{ fontSize: 12, color: "#bbb", fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.entryTitle || entries.find(e => e.id === s.entryId)?.title || s.entryId}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 10, background: `${meta.color}18`, color: meta.color, padding: "2px 9px", borderRadius: 20, fontWeight: 700 }}>
                      {meta.icon} {meta.label}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <div style={{ flex: 1, background: "#FF6B3510", border: "1px solid #FF6B3525", borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ fontSize: 9, color: "#FF6B35", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Current</div>
                      <div style={{ fontSize: 12, color: "#aaa", wordBreak: "break-all", lineHeight: 1.4 }}>
                        {s.currentValue || <em style={{ color: "#555" }}>empty</em>}
                      </div>
                    </div>
                    <span style={{ color: "#444", fontSize: 14, alignSelf: "center", flexShrink: 0 }}>→</span>
                    <div style={{ flex: 1, background: t.accentLight, border: `1px solid ${t.accentBorder}`, borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ fontSize: 9, color: t.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Suggested</div>
                      <div style={{ fontSize: 12, color: "#ddd", wordBreak: "break-all", lineHeight: 1.4 }}>{s.suggestedValue}</div>
                    </div>
                  </div>

                  <p style={{ margin: "0 0 12px", fontSize: 11, color: "#666", lineHeight: 1.5, fontStyle: "italic" }}>{s.reason}</p>

                  {isEdit && (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && editValue.trim()) applyEntry(s, editValue.trim()); if (e.key === "Escape") setEditingKey(null); }}
                      maxLength={50}
                      style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", marginBottom: 10, background: "#0f0f23", border: `1px solid ${meta.color}50`, borderRadius: 8, color: "#ddd", fontSize: 13, outline: "none", fontFamily: "inherit" }}
                    />
                  )}

                  <div style={{ display: "flex", gap: 8 }}>
                    {isEdit ? (
                      <>
                        <button onClick={() => setEditingKey(null)} style={{ flex: 1, minHeight: 44, padding: "9px 0", background: "#252540", border: "none", borderRadius: 8, color: "#777", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                        <button onClick={() => editValue.trim() && applyEntry(s, editValue.trim())} disabled={!editValue.trim() || busy} style={{ flex: 2, minHeight: 44, padding: "9px 0", background: editValue.trim() && !busy ? `linear-gradient(135deg, ${t.accent}, #45B7D1)` : "#252540", border: "none", borderRadius: 8, color: editValue.trim() && !busy ? "#0f0f23" : "#444", fontSize: 12, fontWeight: 700, cursor: editValue.trim() && !busy ? "pointer" : "default" }}>Apply</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => reject(key)} disabled={busy} style={{ flex: 1, minHeight: 44, padding: "9px 0", background: "#252540", border: "none", borderRadius: 8, color: "#FF6B35", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✗ Reject</button>
                        <button onClick={() => { setEditingKey(key); setEditValue(s.suggestedValue); }} disabled={busy} style={{ flex: 1, minHeight: 44, padding: "9px 0", background: "#252540", border: "none", borderRadius: 8, color: "#FFEAA7", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✎ Edit</button>
                        <button onClick={() => applyEntry(s)} disabled={busy} style={{ flex: 2, minHeight: 44, padding: "9px 0", background: busy ? "#252540" : `linear-gradient(135deg, ${t.accent}, #45B7D1)`, border: "none", borderRadius: 8, color: busy ? "#444" : "#0f0f23", fontSize: 12, fontWeight: 700, cursor: busy ? "default" : "pointer" }}>
                          {busy ? "Saving…" : "✓ Accept"}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

RefineView.propTypes = {
  entries: PropTypes.array.isRequired,
  setEntries: PropTypes.func.isRequired,
  links: PropTypes.array,
  addLinks: PropTypes.func,
  activeBrain: PropTypes.object,
  brains: PropTypes.array,
  onSwitchBrain: PropTypes.func,
};

RefineView.defaultProps = {
  brains: [],
};
