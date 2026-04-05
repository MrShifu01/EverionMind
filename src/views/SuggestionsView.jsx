import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { authFetch } from "../lib/authFetch";
import { callAI } from "../lib/ai";
import { SUGGESTIONS } from "../data/personalSuggestions";
import { FAMILY_SUGGESTIONS } from "../data/familySuggestions";
import { BUSINESS_SUGGESTIONS } from "../data/businessSuggestions";
import { TC, PC, MODEL } from "../data/constants";
import { useTheme } from "../ThemeContext";
import { PROMPTS } from "../config/prompts";
import { getEmbedHeaders } from "../lib/aiFetch";
import { bufferFeedback, createFeedbackEvent, FEEDBACK_TYPES, getBufferedFeedback, shouldDistill, distillAndUpdate } from "../lib/feedbackLearning";
import { useMemory } from "../MemoryContext";

/* ─── Brain-type → question set ─── */
function getSuggestionsForType(type) {
  if (type === "family") return FAMILY_SUGGESTIONS;
  if (type === "business") return BUSINESS_SUGGESTIONS;
  return SUGGESTIONS;
}

/* ─── Brain type label/icon ─── */
const BRAIN_META = {
  personal: { emoji: "🧠", label: "Personal" },
  family:   { emoji: "🏠", label: "Family" },
  business: { emoji: "🏪", label: "Business" },
};

export default function SuggestionsView({ entries, setEntries, activeBrain, brains }) {
  const { t } = useTheme();
  const { memoryGuide, refreshMemory } = useMemory();

  // Multi-select: which brains to pull questions from (default = [activeBrain])
  const [selectedBrainIds, setSelectedBrainIds] = useState(() => activeBrain?.id ? [activeBrain.id] : []);

  const toggleBrain = (id) => {
    setSelectedBrainIds(prev => {
      if (prev.includes(id)) {
        // Don't allow deselecting the last brain
        if (prev.length === 1) return prev;
        return prev.filter(x => x !== id);
      }
      return [...prev, id];
    });
  };

  // First selected brain = save target
  const targetBrain = useMemo(() => {
    if (!brains?.length) return activeBrain;
    return brains.find(b => b.id === selectedBrainIds[0]) || activeBrain;
  }, [selectedBrainIds, brains, activeBrain]);

  // Merged & deduplicated question set from all selected brain types
  const questionSet = useMemo(() => {
    const selectedBrains = brains?.length
      ? brains.filter(b => selectedBrainIds.includes(b.id))
      : [activeBrain];
    const seen = new Set();
    const merged = [];
    for (const b of selectedBrains) {
      for (const s of getSuggestionsForType(b?.type || "personal")) {
        if (!seen.has(s.q)) { seen.add(s.q); merged.push(s); }
      }
    }
    return merged;
  }, [selectedBrainIds, brains, activeBrain]);

  // brainType used only for AI context — use first selected brain's type
  const brainType = targetBrain?.type || "personal";

  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answered, setAnswered] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [showInput, setShowInput] = useState(false);
  const [saved, setSaved] = useState([]);
  const [filterCat, setFilterCat] = useState("all");
  const [anim, setAnim] = useState("");
  const [saving, setSaving] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState(null);
  const [aiQuestion, setAiQuestion] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Answered tracking — shared key merges all brain types
  const answeredKey = "openbrain_answered_qs";
  const [answeredQs, setAnsweredQs] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(answeredKey) || "[]")); }
    catch { return new Set(); }
  });

  // Reset position when selected brains change
  useEffect(() => {
    setIdx(0);
    setFilterCat("all");
    setAiQuestion(null);
    setAnswered(0);
    setSkipped(0);
  }, [selectedBrainIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const imgRef = useRef(null);

  // Skipped onboarding questions — load once, stay at top of queue
  const [onboardingSkipped] = useState(() => {
    try { return JSON.parse(localStorage.getItem("openbrain_onboarding_skipped") || "[]"); }
    catch { return []; }
  });

  const position = answered + skipped;
  const cats = useMemo(() => {
    const c = {};
    questionSet.forEach(s => { c[s.cat] = (c[s.cat] || 0) + 1; });
    onboardingSkipped.forEach(s => { c[s.cat] = (c[s.cat] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [questionSet, onboardingSkipped]);

  const view = useMemo(() => {
    // Skipped onboarding questions come first (if not yet answered and matching category filter)
    const skippedPriority = onboardingSkipped.filter(s =>
      !answeredQs.has(s.q) &&
      (filterCat === "all" || s.cat === filterCat)
    );
    const base = filterCat === "all" ? questionSet : questionSet.filter(s => s.cat === filterCat);
    const rest = base.filter(s =>
      !answeredQs.has(s.q) &&
      !skippedPriority.find(sp => sp.q === s.q) // avoid duplicates if already in set
    );
    return [...skippedPriority, ...rest];
  }, [filterCat, answeredQs, questionSet, onboardingSkipped]);

  const total = view.length;
  const poolEmpty = total === 0;
  const isAiSlot = poolEmpty || position % 5 === 4;
  const current = isAiSlot ? (aiLoading ? null : aiQuestion) : view[idx % total];

  useEffect(() => {
    if (!isAiSlot || aiQuestion || aiLoading) return;
    setAiLoading(true);
    const ctx = entries.slice(0, 30).map(e => `- ${e.title}: ${(e.content || "").slice(0, 100)}`).join("\n");
    const brainContext = brainType === "family"
      ? "family shared knowledge base (household, family members, emergencies, finances)"
      : brainType === "business"
      ? "business knowledge base (suppliers, staff, SOPs, costs, licences, equipment)"
      : "personal knowledge base";
    callAI({
      max_tokens: 200,
      system: PROMPTS.FILL_BRAIN.replace("{{BRAIN_CONTEXT}}", brainContext),
      messages: [{ role: "user", content: `What they have captured so far:\n${ctx}\n\nWhat important gap should they fill next?` }]
    })
      .then(r => r.json())
      .then(data => {
        const raw = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
        let parsed = {};
        try { parsed = JSON.parse(raw); } catch {}
        setAiQuestion(parsed.q ? { ...parsed, ai: true } : { q: "What's one important thing you haven't captured yet?", cat: "✨ AI", p: "medium", ai: true });
      })
      .catch(() => setAiQuestion({ q: "What's one important thing you haven't captured yet?", cat: "✨ AI", p: "medium", ai: true }))
      .finally(() => setAiLoading(false));
  }, [isAiSlot, aiQuestion, aiLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > 4 * 1024 * 1024) { setImgError("Photo too large — try a smaller image"); setTimeout(() => setImgError(null), 3000); return; }
    setImgLoading(true);
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result.split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const apiRes = await authFetch("/api/anthropic", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL, max_tokens: 600,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: file.type, data: base64 } },
            { type: "text", text: "Extract all text from this image relevant to the question. Output just the extracted content, clean and readable. If it's a document, card, or label — preserve structure. No commentary." }
          ]}]
        })
      });
      const data = await apiRes.json();
      const extracted = data.content?.[0]?.text?.trim() || "";
      if (extracted) setAnswer(extracted);
    } catch (err) {
      console.error(err);
    }
    setImgLoading(false);
  };

  const next = useCallback((dir) => {
    setAnim(dir);
    setTimeout(() => {
      setAnswer("");
      setShowInput(false);
      setAnim("");
      if (isAiSlot) {
        setAiQuestion(null);
      } else if (total > 0) {
        setIdx(p => (p + 1) % total);
      }
    }, 200);
  }, [isAiSlot, total]);

  const handleSave = async () => {
    if (!answer.trim()) return;
    const a = answer.trim();
    setSaving(true);
    try {
      const res = await callAI({
        max_tokens: 800,
        system: PROMPTS.QA_PARSE,
        messages: [{ role: "user", content: `Question: ${current.q}\nAnswer: ${a}` }]
      });
      const data = await res.json();
      let parsed = {};
      try { parsed = JSON.parse((data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim()); } catch {}
      if (parsed.title) {
        const rpcRes = await authFetch("/api/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(getEmbedHeaders() || {}) },
          body: JSON.stringify({
            p_title: parsed.title,
            p_content: parsed.content || a,
            p_type: parsed.type || "note",
            p_metadata: parsed.metadata || {},
            p_tags: parsed.tags || [],
            p_brain_id: targetBrain?.id,
          })
        });
        const savedToDB = rpcRes.ok;
        const newEntry = { id: Date.now().toString(), ...parsed, pinned: false, importance: 0, tags: parsed.tags || [], created_at: new Date().toISOString() };
        setEntries(prev => [newEntry, ...prev]);
        setSaved(prev => [{ q: current.q, a, cat: current.cat, db: savedToDB, brain: targetBrain }, ...prev]);
      }
    } catch {
      setSaved(prev => [{ q: current.q, a, cat: current.cat, db: false, brain: targetBrain }, ...prev]);
    }

    if (!isAiSlot && current?.q) {
      setAnsweredQs(prev => {
        const updated = new Set(prev);
        updated.add(current.q);
        try { localStorage.setItem(answeredKey, JSON.stringify([...updated])); } catch {}
        return updated;
      });
      // Remove from skipped onboarding list if it was there
      try {
        const skipped = JSON.parse(localStorage.getItem("openbrain_onboarding_skipped") || "[]");
        const updated = skipped.filter(s => s.q !== current.q);
        localStorage.setItem("openbrain_onboarding_skipped", JSON.stringify(updated));
      } catch {}
    }

    // Trigger distillation if buffer from other components (QuickCapture, Refine) is full
    if (shouldDistill(getBufferedFeedback())) {
      const getMem = async () => memoryGuide || "";
      const saveMem = async (content) => {
        try {
          await authFetch("/api/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
          refreshMemory?.();
        } catch {}
      };
      distillAndUpdate(callAI, getMem, saveMem).catch(() => {});
    }

    setSaving(false);
    setAnswered(n => n + 1);
    next("save");
  };

  const copyAll = () => {
    const text = saved.map(s => `**${s.cat}**\nQ: ${s.q}\nA: ${s.a}`).join("\n\n---\n\n");
    navigator.clipboard.writeText(text).catch(err => console.error('[SuggestionsView:copyAll] Failed to copy text', err));
  };

  const pc = current ? PC[current.p] : PC.medium;
  const bm = BRAIN_META[brainType] || BRAIN_META.personal;

  return (
    <div>
      {/* Brain selector chips — multi-select */}
      {brains?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 10, color: t.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, margin: "0 0 8px" }}>
            Fill which brain{brains.length > 1 ? "s" : ""}?
          </p>
          {brains.length > 1 ? (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {brains.map(b => {
                const bmt = BRAIN_META[b.type] || BRAIN_META.personal;
                const active = selectedBrainIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    onClick={() => toggleBrain(b.id)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 20,
                      border: active ? "1px solid #4ECDC4" : `1px solid ${t.border}`,
                      background: active ? "#4ECDC420" : t.surface,
                      color: active ? "#4ECDC4" : t.textMuted,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <span>{bmt.emoji}</span>
                    <span>{b.name}</span>
                    {active && selectedBrainIds.length > 1 && selectedBrainIds[0] === b.id && (
                      <span style={{ fontSize: 9, opacity: 0.7 }}>✓ saves here</span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <span style={{ fontSize: 12, color: t.textMid, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 20, padding: "6px 14px", fontWeight: 600 }}>
              {bm.emoji} {targetBrain?.name || bm.label}
            </span>
          )}
          <p style={{ fontSize: 10, color: t.textDim, margin: "6px 0 0" }}>
            {selectedBrainIds.length > 1
              ? <>Showing merged questions · saves go to <strong style={{ color: t.textMuted }}>{bm.emoji} {targetBrain?.name || bm.label}</strong></>
              : <>Showing questions for <strong style={{ color: t.textMuted }}>{bm.emoji} {targetBrain?.name || bm.label}</strong></>
            }
          </p>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {[{ l: "Answered", v: answered, c: "#4ECDC4" }, { l: "Skipped", v: skipped, c: "#FF6B35" }, { l: "Remaining", v: Math.max(0, total - (idx % Math.max(total, 1))), c: "#A29BFE" }].map(s =>
          <div key={s.l} style={{ flex: 1, background: t.surface, borderRadius: 10, padding: 12, textAlign: "center", border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 9, color: t.textDim, textTransform: "uppercase", letterSpacing: 1.2, marginTop: 2 }}>{s.l}</div>
          </div>
        )}
      </div>

      <div style={{ height: 3, background: t.surface, borderRadius: 4, marginBottom: 20, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(total > 0 ? ((answered + skipped) / total) * 100 : 0, 100)}%`, background: "linear-gradient(90deg, #4ECDC4, #45B7D1)", transition: "width 0.4s", borderRadius: 4 }} />
      </div>

      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 20, paddingBottom: 4, scrollbarWidth: "none" }}>
        <button onClick={() => { setFilterCat("all"); setIdx(0); }} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 20, border: "none", fontSize: 10, fontWeight: 600, cursor: "pointer", background: filterCat === "all" ? "#4ECDC4" : t.surface, color: filterCat === "all" ? "#0f0f23" : t.textDim }}>All</button>
        {cats.map(([c, n]) => <button key={c} onClick={() => { setFilterCat(c); setIdx(0); }} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 20, border: "none", fontSize: 10, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", background: filterCat === c ? "#4ECDC4" : t.surface, color: filterCat === c ? "#0f0f23" : t.textDim }}>{c} ({n})</button>)}
      </div>

      {poolEmpty && (
        <div style={{ background: "#A29BFE15", border: "1px solid #A29BFE40", borderRadius: 12, padding: "12px 16px", marginBottom: 16, textAlign: "center" }}>
          <span style={{ fontSize: 11, color: "#A29BFE", fontWeight: 600 }}>✨ All {answeredQs.size} static questions answered — AI is now driving</span>
        </div>
      )}
      {isAiSlot && aiLoading && (
        <div style={{ background: `linear-gradient(135deg, ${t.surface}, ${t.surface2})`, border: "1px solid #A29BFE40", borderRadius: 16, padding: "28px 24px", marginBottom: 16, textAlign: "center" }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>✨</div>
          <p style={{ color: "#A29BFE", fontSize: 14, margin: 0 }}>AI is generating a personalised question…</p>
        </div>
      )}
      {current && !aiLoading && <div style={{ background: `linear-gradient(135deg, ${t.surface}, ${t.surface2})`, border: isAiSlot ? "1px solid #A29BFE40" : `1px solid ${t.border}`, borderRadius: 16, padding: "28px 24px", marginBottom: 16, position: "relative", overflow: "hidden", transform: anim === "skip" ? "translateX(-30px)" : anim === "save" ? "scale(0.95)" : "none", opacity: anim ? 0.4 : 1, transition: "all 0.2s" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${pc.c}, transparent)` }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 10, background: pc.bg, color: pc.c, padding: "3px 10px", borderRadius: 20, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{pc.l}</span>
          <span style={{ fontSize: 11, color: t.textDim }}>{current.cat}</span>
          {isAiSlot && <span style={{ fontSize: 9, background: "#A29BFE20", color: "#A29BFE", padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>✨ AI</span>}
          {!isAiSlot && current && onboardingSkipped.find(s => s.q === current.q) && (
            <span style={{ fontSize: 9, background: "#FF6B3520", color: "#FF6B35", padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>↩ From onboarding</span>
          )}
          <span style={{ fontSize: 10, color: t.textDim, marginLeft: "auto" }}>#{idx + 1}/{total}</span>
        </div>
        <p style={{ fontSize: 18, color: t.text, lineHeight: 1.6, margin: 0, fontWeight: 500 }}>{current.q}</p>
      </div>}

      {!showInput ? (
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => { setSkipped(s => s + 1); next("skip"); }} disabled={aiLoading} style={{ flex: 1, padding: 14, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, color: aiLoading ? t.textDim : t.textMuted, fontSize: 14, fontWeight: 600, cursor: aiLoading ? "default" : "pointer" }}>Skip →</button>
          <button onClick={() => setShowInput(true)} disabled={!current || aiLoading} style={{ flex: 2, padding: 14, background: current && !aiLoading ? "linear-gradient(135deg, #4ECDC4, #45B7D1)" : t.surface, border: "none", borderRadius: 12, color: current && !aiLoading ? "#0f0f23" : t.textDim, fontSize: 14, fontWeight: 700, cursor: current && !aiLoading ? "pointer" : "default" }}>Answer this</button>
        </div>
      ) : (
        <div>
          <input type="file" accept="image/*" ref={imgRef} onChange={handleImageUpload} style={{ display: "none" }} />
          {imgError && <p style={{ fontSize: 12, color: "#FF6B35", margin: "0 0 6px" }}>{imgError}</p>}
          <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Type your answer..." autoFocus
            style={{ width: "100%", boxSizing: "border-box", minHeight: 100, padding: "14px 16px", background: t.surface, border: "1px solid #4ECDC440", borderRadius: 12, color: t.textSoft, fontSize: 14, lineHeight: 1.6, outline: "none", resize: "vertical", fontFamily: "inherit", opacity: imgLoading ? 0.5 : 1 }} />
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button onClick={() => { setShowInput(false); setAnswer(""); }} style={{ flex: 1, padding: 12, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, color: t.textMuted, fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button onClick={() => { setSkipped(s => s + 1); next("skip"); }} style={{ flex: 1, padding: 12, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, color: "#FF6B35", fontSize: 13, cursor: "pointer" }}>Skip</button>
            <button onClick={() => imgRef.current?.click()} disabled={imgLoading || saving} title="Upload photo" style={{ padding: 12, background: t.surface, border: "1px solid #4ECDC440", borderRadius: 10, color: imgLoading ? t.textDim : "#4ECDC4", cursor: imgLoading || saving ? "default" : "pointer", fontSize: 14 }}>📷</button>
            <button onClick={handleSave} disabled={!answer.trim() || saving || imgLoading} style={{ flex: 2, padding: 12, background: answer.trim() && !imgLoading ? "linear-gradient(135deg, #4ECDC4, #45B7D1)" : t.surface, border: "none", borderRadius: 10, color: answer.trim() && !imgLoading ? "#0f0f23" : t.textDim, fontSize: 13, fontWeight: 700, cursor: answer.trim() && !imgLoading ? "pointer" : "default" }}>
              {saving ? "Saving..." : imgLoading ? "Reading photo..." : `Save to ${bm.emoji} ${targetBrain?.name || bm.label}`}
            </button>
          </div>
        </div>
      )}

      {saved.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ fontSize: 11, color: t.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, margin: 0 }}>This session ({saved.length})</p>
            <button onClick={copyAll} style={{ padding: "6px 14px", background: "#4ECDC420", border: "none", borderRadius: 20, color: "#4ECDC4", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>📋 Copy All for Claude</button>
          </div>
          {saved.map((s, i) => (
            <div key={i} style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: t.textDim }}>{s.cat}</span>
                {s.brain && <span style={{ fontSize: 9, color: t.textDim }}>{BRAIN_META[s.brain.type]?.emoji} {s.brain.name}</span>}
                {s.db && <span style={{ fontSize: 9, background: "#4ECDC420", color: "#4ECDC4", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>Saved to DB</span>}
              </div>
              <p style={{ margin: 0, fontSize: 13, color: t.textMid }}>{s.a.slice(0, 120)}{s.a.length > 120 ? "…" : ""}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

SuggestionsView.propTypes = {
  entries: PropTypes.array.isRequired,
  setEntries: PropTypes.func.isRequired,
  activeBrain: PropTypes.object,
  brains: PropTypes.array,
};
