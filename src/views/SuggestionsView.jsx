import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { authFetch } from "../lib/authFetch";
import { SUGGESTIONS } from "../data/suggestions";
import { TC, PC, MODEL } from "../data/constants";
import { useTheme } from "../ThemeContext";

export default function SuggestionsView({ apiKey, sbKey, entries, setEntries }) {
  const { t } = useTheme();
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
  const [aiQuestion, setAiQuestion] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [answeredQs, setAnsweredQs] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("openbrain_answered_qs") || "[]")); }
    catch { return new Set(); }
  });
  const imgRef = useRef(null);

  const position = answered + skipped;
  const cats = useMemo(() => { const c = {}; SUGGESTIONS.forEach(s => { c[s.cat] = (c[s.cat] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]); }, []);
  const view = useMemo(() => {
    const base = filterCat === "all" ? SUGGESTIONS : SUGGESTIONS.filter(s => s.cat === filterCat);
    return base.filter(s => !answeredQs.has(s.q));
  }, [filterCat, answeredQs]);
  const total = view.length;
  const poolEmpty = total === 0;
  const isAiSlot = !!apiKey && (poolEmpty || position % 5 === 4);
  const current = isAiSlot ? (aiLoading ? null : aiQuestion) : view[idx % total];

  useEffect(() => {
    if (!isAiSlot || aiQuestion || aiLoading || !apiKey) return;
    setAiLoading(true);
    const ctx = entries.slice(0, 30).map(e => `- ${e.title}: ${(e.content || "").slice(0, 100)}`).join("\n");
    authFetch("/api/anthropic", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 200,
        system: `You are helping someone build their personal knowledge base called OpenBrain. Your job is to identify important information they should capture but probably haven't yet.\n\nStudy what they have stored, then reason about the GAPS — important facts, records, contacts, plans, or details that a person in their situation almost certainly needs but hasn't captured. Think broadly: personal identity, health, finance, legal, business operations, insurance, contracts, relationships, assets, digital accounts, emergency info, goals, and daily routines.\n\nGenerate ONE specific, actionable question that would capture a high-value missing piece. Make it personal and relevant to their specific situation — not generic.\n\nReturn ONLY valid JSON: {"q":"...","cat":"...","p":"high"|"medium"|"low"}`,
        messages: [{ role: "user", content: `What they have captured so far:\n${ctx}\n\nWhat important gap should they fill next?` }]
      })
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
  }, [isAiSlot, aiQuestion, aiLoading, apiKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
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
    if (apiKey && sbKey) {
      try {
        const res = await authFetch("/api/anthropic", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL, max_tokens: 800,
            system: `Parse this Q&A into a structured entry. Return ONLY valid JSON:\n{"title":"...","content":"...","type":"note|person|place|idea|contact|document|reminder|color|decision","metadata":{},"tags":[]}`,
            messages: [{ role: "user", content: `Question: ${current.q}\nAnswer: ${a}` }]
          })
        });
        const data = await res.json();
        let parsed = {};
        try { parsed = JSON.parse((data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim()); } catch {}
        if (parsed.title) {
          const rpcRes = await authFetch("/api/capture", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ p_title: parsed.title, p_content: parsed.content || a, p_type: parsed.type || "note", p_metadata: parsed.metadata || {}, p_tags: parsed.tags || [] })
          });
          const savedToDB = rpcRes.ok;
          const newEntry = { id: Date.now().toString(), ...parsed, pinned: false, importance: 0, tags: parsed.tags || [], created_at: new Date().toISOString() };
          setEntries(prev => [newEntry, ...prev]);
          setSaved(prev => [{ q: current.q, a, cat: current.cat, db: savedToDB }, ...prev]);
        }
      } catch {
        setSaved(prev => [{ q: current.q, a, cat: current.cat, db: false }, ...prev]);
      }
    } else {
      setSaved(prev => [{ q: current.q, a, cat: current.cat, db: false }, ...prev]);
    }

    if (!isAiSlot && current?.q) {
      setAnsweredQs(prev => {
        const updated = new Set(prev);
        updated.add(current.q);
        try { localStorage.setItem("openbrain_answered_qs", JSON.stringify([...updated])); } catch {}
        return updated;
      });
    }

    setSaving(false);
    setAnswered(n => n + 1);
    next("save");
  };

  const copyAll = () => {
    const text = saved.map(s => `**${s.cat}**\nQ: ${s.q}\nA: ${s.a}`).join("\n\n---\n\n");
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const pc = current ? PC[current.p] : PC.medium;

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {[{ l: "Answered", v: answered, c: "#4ECDC4" }, { l: "Skipped", v: skipped, c: "#FF6B35" }, { l: "Remaining", v: Math.max(0, total - (idx % total)), c: "#A29BFE" }].map(s =>
          <div key={s.l} style={{ flex: 1, background: t.surface, borderRadius: 10, padding: 12, textAlign: "center", border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 9, color: t.textDim, textTransform: "uppercase", letterSpacing: 1.2, marginTop: 2 }}>{s.l}</div>
          </div>
        )}
      </div>

      <div style={{ height: 3, background: t.surface, borderRadius: 4, marginBottom: 20, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(((answered + skipped) / total) * 100, 100)}%`, background: "linear-gradient(90deg, #4ECDC4, #45B7D1)", transition: "width 0.4s", borderRadius: 4 }} />
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
      {current && !aiLoading && <div style={{ background: isAiSlot ? `linear-gradient(135deg, ${t.surface}, ${t.surface2})` : `linear-gradient(135deg, ${t.surface}, ${t.surface2})`, border: isAiSlot ? "1px solid #A29BFE40" : `1px solid ${t.border}`, borderRadius: 16, padding: "28px 24px", marginBottom: 16, position: "relative", overflow: "hidden", transform: anim === "skip" ? "translateX(-30px)" : anim === "save" ? "scale(0.95)" : "none", opacity: anim ? 0.4 : 1, transition: "all 0.2s" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${pc.c}, transparent)` }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 10, background: pc.bg, color: pc.c, padding: "3px 10px", borderRadius: 20, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{pc.l}</span>
          <span style={{ fontSize: 11, color: t.textDim }}>{current.cat}</span>
          {isAiSlot && <span style={{ fontSize: 9, background: "#A29BFE20", color: "#A29BFE", padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>✨ AI</span>}
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
          <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Type your answer..." autoFocus
            style={{ width: "100%", boxSizing: "border-box", minHeight: 100, padding: "14px 16px", background: t.surface, border: "1px solid #4ECDC440", borderRadius: 12, color: t.textSoft, fontSize: 14, lineHeight: 1.6, outline: "none", resize: "vertical", fontFamily: "inherit", opacity: imgLoading ? 0.5 : 1 }} />
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button onClick={() => { setShowInput(false); setAnswer(""); }} style={{ flex: 1, padding: 12, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, color: t.textMuted, fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button onClick={() => { setSkipped(s => s + 1); next("skip"); }} style={{ flex: 1, padding: 12, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, color: "#FF6B35", fontSize: 13, cursor: "pointer" }}>Skip</button>
            <button onClick={() => imgRef.current?.click()} disabled={imgLoading || saving} title="Upload photo" style={{ padding: 12, background: t.surface, border: "1px solid #4ECDC440", borderRadius: 10, color: imgLoading ? t.textDim : "#4ECDC4", cursor: imgLoading || saving ? "default" : "pointer", fontSize: 14 }}>📷</button>
            <button onClick={handleSave} disabled={!answer.trim() || saving || imgLoading} style={{ flex: 2, padding: 12, background: answer.trim() && !imgLoading ? "linear-gradient(135deg, #4ECDC4, #45B7D1)" : t.surface, border: "none", borderRadius: 10, color: answer.trim() && !imgLoading ? "#0f0f23" : t.textDim, fontSize: 13, fontWeight: 700, cursor: answer.trim() && !imgLoading ? "pointer" : "default" }}>
              {saving ? "Saving..." : imgLoading ? "Reading photo..." : apiKey && sbKey ? "Save to DB" : "Save Answer"}
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
