import { useState, useMemo, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { useTheme } from "./ThemeContext";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { authFetch } from "./lib/authFetch";
import { supabase } from "./lib/supabase";
import { TC, fmtD, MODEL, INITIAL_ENTRIES, LINKS } from "./data/constants";
import { useBrain } from "./hooks/useBrain";
import { useOfflineSync } from "./hooks/useOfflineSync";
import { enqueue } from "./lib/offlineQueue";
import BrainSwitcher from "./components/BrainSwitcher";
import OnboardingModal from "./components/OnboardingModal";
import BrainTipCard from "./components/BrainTipCard";

const SuggestionsView = lazy(() => import("./views/SuggestionsView"));
const CalendarView    = lazy(() => import("./views/CalendarView"));
const TodoView        = lazy(() => import("./views/TodoView"));
const GraphView       = lazy(() => import("./views/GraphView"));
const DetailModal     = lazy(() => import("./views/DetailModal"));
const RefineView      = lazy(() => import("./views/RefineView"));

function Loader() {
  const { t } = useTheme();
  return <div style={{ padding: 40, textAlign: "center", color: t.textFaint, fontSize: 13 }}>Loading…</div>;
}

/* ─── AI Connection Discovery ─── */
async function findConnections(newEntry, existingEntries, existingLinks) {
  const candidates = existingEntries
    .filter(e => e.id !== newEntry.id)
    .slice(0, 50)
    .map(e => ({ id: e.id, title: e.title, type: e.type, tags: e.tags, content: (e.content || "").slice(0, 120) }));
  if (candidates.length === 0) return [];
  const existingKeys = new Set(existingLinks.map(l => `${l.from}-${l.to}`));
  try {
    const res = await authFetch("/api/anthropic", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 600,
        system: `You are a knowledge-graph builder. Given a NEW entry and EXISTING entries, find meaningful connections.\nRULES:\n- Only connect where a real, specific relationship exists (supplier→business, person→place, idea→business, etc.)\n- "rel" label: short phrase 2-4 words describing the relationship\n- Do NOT connect entries just because they share a type\n- Return 0–5 connections. Quality over quantity.\n- "from" = new entry ID. "to" = existing entry ID.\n- Return ONLY valid JSON array: [{\"from\":\"...\",\"to\":\"...\",\"rel\":\"...\"}]\n- If no connections: []`,
        messages: [{ role: "user", content: `NEW ENTRY:\n${JSON.stringify({ id: newEntry.id, title: newEntry.title, type: newEntry.type, content: newEntry.content, tags: newEntry.tags })}\n\nEXISTING ENTRIES:\n${JSON.stringify(candidates)}` }]
      })
    });
    const data = await res.json();
    const raw = (data.content?.[0]?.text || "[]").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(l =>
      l.from && l.to && l.rel &&
      candidates.some(c => c.id === l.to) &&
      !existingKeys.has(`${l.from}-${l.to}`) &&
      !existingKeys.has(`${l.to}-${l.from}`)
    );
  } catch { return []; }
}

/* ─── Phone Utilities ─── */
export function extractPhone(entry) {
  const s = JSON.stringify(entry.metadata || {}) + " " + (entry.content || "");
  const m = s.match(/(\+27|0)[6-8][0-9]{8}/);
  return m ? m[0] : null;
}
export function toWaUrl(phone) {
  const d = phone.replace(/\D/g, "");
  return `https://wa.me/${d.startsWith("0") ? "27" + d.slice(1) : d}`;
}

/* ─── Duplicate Score ─── */
function scoreTitle(a, b) {
  a = a.toLowerCase().trim(); b = b.toLowerCase().trim();
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 70;
  const aSet = new Set(a.split(/\W+/).filter(Boolean));
  const bArr = b.split(/\W+/).filter(Boolean);
  const hits = bArr.filter(w => aSet.has(w)).length;
  return Math.round((hits / Math.max(aSet.size, bArr.length, 1)) * 100);
}

/* ─── Workspace Inference ─── */
function inferWorkspace(entry) {
  if (entry.metadata?.workspace) return entry.metadata.workspace;
  const tags = (entry.tags || []).map(t => t.toLowerCase());
  const bizKeywords = ["smash burger bar", "supplier", "contractor", "business", "restaurant", "bidfoods", "makro", "econofoods"];
  if (bizKeywords.some(k => tags.some(t => t.includes(k)))) return "business";
  const personalKeywords = ["id", "identity", "medical aid", "health", "insurance", "driving licence", "home affairs", "family", "personal", "passport", "medical"];
  if (personalKeywords.some(k => tags.some(t => t.includes(k)))) return "personal";
  return "both";
}

/* ═══════════════════════════════════════════════════════════════
   UNDO TOAST
   ═══════════════════════════════════════════════════════════════ */
function UndoToast({ action, onUndo, onDismiss }) {
  const { t } = useTheme();
  const duration = action.type === "create" ? 3000 : 5000;
  const [pct, setPct] = useState(100);
  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => {
      const p = Math.max(0, 100 - ((Date.now() - start) / duration) * 100);
      setPct(p);
      if (p <= 0) { clearInterval(tick); onDismiss(); }
    }, 80);
    return () => clearInterval(tick);
  }, []);
  const label = { delete: "Entry deleted", update: "Entry updated", create: "Entry created" }[action.type];
  return (
    <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: t.surface, border: "1px solid #4ECDC4", borderRadius: 12, padding: "12px 20px", display: "flex", alignItems: "center", gap: 16, zIndex: 2000, boxShadow: "0 4px 20px #0008", minWidth: 280 }}>
      <span style={{ fontSize: 14, color: t.textMid }}>{label}</span>
      <button onClick={onUndo} style={{ padding: "4px 14px", borderRadius: 8, border: "1px solid #4ECDC4", background: "none", color: "#4ECDC4", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Undo</button>
      <div style={{ position: "absolute", bottom: 0, left: 0, height: 3, background: "#4ECDC4", borderRadius: "0 0 12px 12px", width: `${pct}%`, transition: "width 80ms linear" }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   NUDGE BANNER
   ═══════════════════════════════════════════════════════════════ */
function NudgeBanner({ nudge, onDismiss }) {
  const { t } = useTheme();
  if (!nudge) return null;
  return (
    <div style={{ margin: "0 24px 12px", padding: "12px 16px", background: t.surface, border: "1px solid #A29BFE40", borderRadius: 12, display: "flex", alignItems: "flex-start", gap: 10 }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
      <p style={{ margin: 0, flex: 1, fontSize: 13, color: t.textMid, lineHeight: 1.5 }}>{nudge}</p>
      <button onClick={onDismiss} style={{ background: "none", border: "none", color: t.textFaint, fontSize: 18, cursor: "pointer", lineHeight: 1, flexShrink: 0 }}>✕</button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PRE-SAVE PREVIEW MODAL
   ═══════════════════════════════════════════════════════════════ */
function PreviewModal({ preview, entries, onSave, onCancel }) {
  const { t } = useTheme();
  const [title, setTitle] = useState(preview.title || "");
  const [type, setType] = useState(preview.type || "note");
  const [tags, setTags] = useState((preview.tags || []).join(", "));
  const inp = { padding: "8px 12px", background: t.bg, border: "1px solid #4ECDC440", borderRadius: 8, color: t.textSoft, fontSize: 13, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
  const dupes = useMemo(() => {
    if (!title.trim()) return [];
    return entries.filter(e => scoreTitle(title, e.title) > 50).slice(0, 3);
  }, [title, entries]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000CC", zIndex: 900, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onCancel}>
      <div style={{ background: t.surface2, borderRadius: "20px 20px 0 0", maxWidth: 600, width: "100%", padding: "24px 24px 36px", border: "1px solid #4ECDC440" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: t.textSoft }}>Preview before saving</span>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: "#666", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>Type</label>
            <select value={type} onChange={e => setType(e.target.value)} style={{ ...inp, cursor: "pointer" }}>
              {Object.keys(TC).map(t => <option key={t} value={t}>{TC[t].i} {t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>Tags <span style={{ color: "#555", fontWeight: 400, textTransform: "none" }}>(comma separated)</span></label>
            <input value={tags} onChange={e => setTags(e.target.value)} style={inp} placeholder="tag1, tag2" />
          </div>
        </div>
        {dupes.length > 0 && (
          <div style={{ marginTop: 14, padding: "10px 14px", background: "#FFEAA710", border: "1px solid #FFEAA730", borderRadius: 10 }}>
            <p style={{ margin: "0 0 6px", fontSize: 11, color: "#FFEAA7", fontWeight: 700 }}>⚠ Similar entries found</p>
            {dupes.map(d => <div key={d.id} style={{ fontSize: 12, color: "#bbb", marginBottom: 2 }}>• {d.title}</div>)}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: 12, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, color: t.textMuted, fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button
            onClick={() => onSave({ ...preview, title: title.trim(), type, tags: tags.split(",").map(tag => tag.trim()).filter(Boolean) })}
            disabled={!title.trim()}
            style={{ flex: 2, padding: 12, background: title.trim() ? "linear-gradient(135deg, #4ECDC4, #45B7D1)" : t.surface, border: "none", borderRadius: 10, color: title.trim() ? "#0f0f23" : t.textDim, fontSize: 13, fontWeight: 700, cursor: title.trim() ? "pointer" : "default" }}
          >Save to OpenBrain</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUPPLIER PANEL
   ═══════════════════════════════════════════════════════════════ */
function SupplierPanel({ entries, onSelect, onReorder }) {
  const { t } = useTheme();
  const suppliers = useMemo(() =>
    entries.filter(e => e.tags?.includes("supplier") || e.metadata?.category === "supplier"),
    [entries]
  );
  const withPrice = suppliers.filter(s => s.metadata?.price);
  const abtn = (color) => ({ padding: "5px 12px", borderRadius: 20, border: `1px solid ${color}40`, background: `${color}15`, color, fontSize: 11, fontWeight: 600, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 });

  if (suppliers.length === 0) return (
    <p style={{ textAlign: "center", color: "#555", marginTop: 40, fontSize: 14 }}>No suppliers yet — add entries tagged "supplier".</p>
  );

  return (
    <div>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: "#666" }}>{suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {suppliers.map(s => {
          const phone = extractPhone(s);
          const cfg = TC[s.type] || TC.note;
          const price = s.metadata?.price ? `${s.metadata.price}${s.metadata.unit ? " " + s.metadata.unit : ""}` : null;
          return (
            <div key={s.id} style={{ background: t.surface, borderRadius: 12, padding: "16px 20px", border: `1px solid ${t.border}` }}>
              <div onClick={() => onSelect(s)} style={{ cursor: "pointer", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 18 }}>{cfg.i}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: t.text }}>{s.title}</span>
                  {price && <span style={{ fontSize: 11, color: "#4ECDC4", background: "#4ECDC415", padding: "2px 8px", borderRadius: 20 }}>{price}</span>}
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "#999", lineHeight: 1.4 }}>{s.content}</p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {phone && <a href={`tel:${phone}`} style={abtn("#4ECDC4")}>📞 Call</a>}
                {phone && <a href={toWaUrl(phone)} target="_blank" rel="noreferrer" style={abtn("#25D366")}>💬 WhatsApp</a>}
                <button onClick={() => onReorder(s)} style={abtn("#FF6B35")}>🔁 Reorder</button>
              </div>
            </div>
          );
        })}
      </div>
      {withPrice.length > 0 && (
        <div style={{ marginTop: 28, padding: "16px 20px", background: t.surface, borderRadius: 12, border: `1px solid ${t.border}` }}>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: t.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Cost Summary</p>
          {withPrice.map(s => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #2a2a4a20" }}>
              <span style={{ color: "#ccc" }}>{s.title}</span>
              <span style={{ color: "#4ECDC4", fontWeight: 600 }}>{s.metadata.price}{s.metadata.unit ? " " + s.metadata.unit : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   QUICK CAPTURE BAR
   ═══════════════════════════════════════════════════════════════ */
const CAPTURE_SYSTEM = `You classify and structure a raw text capture into an OpenBrain entry. Return ONLY valid JSON.
Format: {"title":"...","content":"...","type":"...","metadata":{},"tags":[],"workspace":"business"|"personal"|"both"}

TYPE RULES (pick the BEST match): person, contact, place, document, reminder, idea, decision, color, note

EXTRACTION RULES:
- Put phone numbers, dates, IDs into metadata
- If price/cost mentioned (e.g. "R85/kg", "R120 per case"), extract: metadata.price and metadata.unit
- Title: max 60 chars
- Content: 1-2 sentence description

WORKSPACE RULES:
- business: related to a business, restaurant, supplier, contractor
- personal: identity documents, health, medical, family, personal contacts
- both: general reminders, ideas

IMPORTANT: Do NOT suggest merging companies just because they have similar name prefixes. Each business is distinct.`;

const BRAIN_META_QC = {
  personal: { emoji: "🧠" },
  family:   { emoji: "🏠" },
  business: { emoji: "🏪" },
};

function QuickCapture({ apiKey, sbKey, entries, setEntries, links, addLinks, onCreated, isOnline = true, refreshCount, brainId, brains = [] }) {
  const { t } = useTheme();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [preview, setPreview] = useState(null);
  const [listening, setListening] = useState(false);
  // Multi-brain: which brains to capture into (primary = first element)
  const [selectedBrainIds, setSelectedBrainIds] = useState(() => brainId ? [brainId] : []);
  const imgRef = useRef(null);
  const recognitionRef = useRef(null);

  // Keep selection in sync when active brain changes
  useEffect(() => {
    if (brainId) setSelectedBrainIds(prev => prev.includes(brainId) ? prev : [brainId]);
  }, [brainId]);

  function toggleBrain(id) {
    setSelectedBrainIds(prev => {
      if (prev.includes(id)) return prev.length > 1 ? prev.filter(x => x !== id) : prev;
      return [...prev, id];
    });
  }

  const primaryBrainId = selectedBrainIds[0] || brainId;
  const extraBrainIds = selectedBrainIds.slice(1);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = "";
    if (!isOnline) { setStatus("offline-image"); setTimeout(() => setStatus(null), 3000); return; }
    setLoading(true); setStatus("thinking");
    try {
      const base64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
      const apiRes = await authFetch("/api/anthropic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 600, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: file.type, data: base64 } }, { type: "text", text: "Extract all text from this image. Output just the extracted content, clean and readable. If it's a business card, document, label, or receipt — preserve structure. No commentary." }] }] }) });
      const data = await apiRes.json();
      const extracted = data.content?.[0]?.text?.trim() || "";
      if (extracted) setText(extracted);
    } catch (err) { console.error(err); }
    setLoading(false); setStatus(null);
  };

  const startVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setText(t => t + " [Voice not supported in this browser]"); return; }
    if (listening) { recognitionRef.current?.stop(); return; }
    const recognition = new SR();
    recognition.lang = "en-ZA";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognitionRef.current = recognition;
    let silenceTimer = null;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map(r => r[0].transcript).join("");
      setText(transcript);
      clearTimeout(silenceTimer);
      if (event.results[event.results.length - 1].isFinal) {
        silenceTimer = setTimeout(() => recognition.stop(), 2000);
      }
    };
    recognition.onend = () => { setListening(false); recognitionRef.current = null; };
    recognition.onerror = () => { setListening(false); recognitionRef.current = null; };
    recognition.start();
    setListening(true);
  }, [listening]);

  const doSave = useCallback(async (parsed) => {
    setPreview(null);
    setLoading(true); setStatus("saving");
    try {
      if (sbKey && parsed.title) {
        if (!isOnline) {
          const tempId = Date.now().toString();
          const newEntry = { id: tempId, title: parsed.title, content: parsed.content || "", type: parsed.type || "note", metadata: parsed.metadata || {}, pinned: false, importance: 0, tags: parsed.tags || [], created_at: new Date().toISOString() };
          await enqueue({ id: crypto.randomUUID(), url: "/api/capture", method: "POST", body: JSON.stringify({ p_title: parsed.title, p_content: parsed.content || "", p_type: parsed.type || "note", p_metadata: parsed.metadata || {}, p_tags: parsed.tags || [] }), created_at: new Date().toISOString(), tempId });
          refreshCount?.();
          setEntries(prev => [newEntry, ...prev]);
          onCreated?.(newEntry);
          setStatus("saved-local");
        } else {
          const rpcRes = await authFetch("/api/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p_title: parsed.title, p_content: parsed.content || "", p_type: parsed.type || "note", p_metadata: parsed.metadata || {}, p_tags: parsed.tags || [], p_brain_id: primaryBrainId, p_extra_brain_ids: extraBrainIds }) });
          if (rpcRes.ok) {
            const result = await rpcRes.json();
            const newEntry = { id: result?.id || Date.now().toString(), title: parsed.title, content: parsed.content || "", type: parsed.type || "note", metadata: parsed.metadata || {}, pinned: false, importance: 0, tags: parsed.tags || [], created_at: new Date().toISOString() };
            setEntries(prev => [newEntry, ...prev]);
            onCreated?.(newEntry);
            setStatus("saved-db");
            findConnections(newEntry, entries, links || []).then(newLinks => {
              if (newLinks.length === 0) return;
              addLinks?.(newLinks);
              authFetch("/api/save-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ links: newLinks }) }).catch(() => {});
            });
          } else {
            const newEntry = { id: Date.now().toString(), ...parsed, pinned: false, importance: 0, tags: parsed.tags || [], created_at: new Date().toISOString() };
            setEntries(prev => [newEntry, ...prev]);
            onCreated?.(newEntry);
            setStatus("saved-local");
          }
        }
      } else {
        const newEntry = { id: Date.now().toString(), ...parsed, pinned: false, importance: 0, tags: parsed.tags || [], created_at: new Date().toISOString() };
        setEntries(prev => [newEntry, ...prev]);
        onCreated?.(newEntry);
        setStatus("saved-local");
      }
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
    setLoading(false); setTimeout(() => setStatus(null), 3000);
  }, [sbKey, entries, links, addLinks, onCreated, setEntries, isOnline, refreshCount]);

  const capture = async () => {
    if (!text.trim()) return;
    const input = text.trim(); setText(""); setLoading(true); setStatus("thinking");
    if (!isOnline) {
      const tempId = Date.now().toString();
      const newEntry = { id: tempId, title: input.slice(0, 60), content: input, type: "note", metadata: {}, pinned: false, importance: 0, tags: [], created_at: new Date().toISOString() };
      await enqueue({ id: crypto.randomUUID(), type: "raw-capture", anthropicRequest: { model: MODEL, max_tokens: 800, system: CAPTURE_SYSTEM, messages: [{ role: "user", content: input }] }, tempId, created_at: new Date().toISOString() });
      refreshCount?.();
      setEntries(prev => [newEntry, ...prev]);
      onCreated?.(newEntry);
      setStatus("saved-local");
      setLoading(false); setTimeout(() => setStatus(null), 3000);
      return;
    }
    try {
      if (apiKey) {
        const res = await authFetch("/api/anthropic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 800, system: CAPTURE_SYSTEM, messages: [{ role: "user", content: input }] }) });
        const data = await res.json();
        let parsed = {};
        try { parsed = JSON.parse((data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim()); } catch {}
        if (parsed.title) {
          setLoading(false); setStatus(null);
          setPreview({ ...parsed, _raw: input });
          return;
        }
      }
      const newEntry = { id: Date.now().toString(), title: input.slice(0, 60), content: input, type: "note", metadata: {}, pinned: false, importance: 0, tags: [], created_at: new Date().toISOString() };
      setEntries(prev => [newEntry, ...prev]);
      onCreated?.(newEntry);
      setStatus("saved-raw");
    } catch (e) {
      console.error(e);
      const newEntry = { id: Date.now().toString(), title: input.slice(0, 60), content: input, type: "note", metadata: {}, pinned: false, importance: 0, tags: [], created_at: new Date().toISOString() };
      setEntries(prev => [newEntry, ...prev]);
      onCreated?.(newEntry);
      setStatus("error");
    }
    setLoading(false); setTimeout(() => setStatus(null), 3000);
  };

  const statusMsg = { thinking: "🤖 Parsing...", saving: "💾 Saving...", "saved-db": "✅ Saved!", "saved-local": "✅ Saved locally", "saved-raw": "📝 Saved", error: "⚠️ Saved locally", "offline-image": "📵 Image uploads need a connection" };

  return (
    <div style={{ padding: "0 24px 16px" }}>
      {brains.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {brains.map(b => {
            const bm = BRAIN_META_QC[b.type] || BRAIN_META_QC.personal;
            const active = selectedBrainIds.includes(b.id);
            return (
              <button key={b.id} onClick={() => toggleBrain(b.id)} style={{ padding: "4px 11px", borderRadius: 20, border: active ? "1px solid #4ECDC4" : `1px solid ${t.border}`, background: active ? "#4ECDC420" : t.surface, color: active ? "#4ECDC4" : t.textDim, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                {bm.emoji} {b.name}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input type="file" accept="image/*" ref={imgRef} onChange={handleImageUpload} style={{ display: "none" }} />
        <input
          value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && capture()}
          disabled={loading}
          placeholder={listening ? "🎤 Listening..." : loading ? "Processing..." : "Quick capture — just type anything..."}
          style={{ flex: 1, padding: "12px 16px", background: listening ? "#1a2e1a" : t.surface, border: `1px solid ${listening ? "#25D36640" : "#4ECDC440"}`, borderRadius: 12, color: t.textSoft, fontSize: 14, outline: "none", fontFamily: "inherit", opacity: loading ? 0.5 : 1 }}
        />
        <button onClick={startVoice} disabled={loading} title="Voice capture" style={{ padding: "12px 14px", background: listening ? "#25D36620" : t.surface, border: `1px solid ${listening ? "#25D36640" : "#4ECDC440"}`, borderRadius: 12, color: listening ? "#25D366" : "#4ECDC4", cursor: loading ? "default" : "pointer", fontSize: 16 }}>🎤</button>
        <button onClick={() => imgRef.current?.click()} disabled={loading} style={{ padding: "12px 14px", background: t.surface, border: "1px solid #4ECDC440", borderRadius: 12, color: loading ? t.textDim : "#4ECDC4", cursor: loading ? "default" : "pointer", fontSize: 16 }}>📷</button>
        <button onClick={capture} disabled={loading || !text.trim()} style={{ padding: "12px 18px", background: text.trim() && !loading ? "linear-gradient(135deg, #4ECDC4, #45B7D1)" : t.surface, border: "none", borderRadius: 12, color: text.trim() && !loading ? "#0f0f23" : t.textFaint, fontWeight: 700, cursor: text.trim() && !loading ? "pointer" : "default", fontSize: 16 }}>+</button>
      </div>
      {status && <p style={{ fontSize: 11, color: status.includes("error") ? "#FF6B35" : "#4ECDC4", margin: "6px 0 0 4px" }}>{statusMsg[status]}</p>}
      {preview && <PreviewModal preview={preview} entries={entries} onSave={doSave} onCancel={() => setPreview(null)} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SETTINGS
   ═══════════════════════════════════════════════════════════════ */
function SettingsView() {
  const { t } = useTheme();
  const [testStatus, setTestStatus] = useState(null);
  const [email, setEmail] = useState("");
  const [notifEnabled, setNotifEnabled] = useState(() => localStorage.getItem("openbrain_notif") === "true");
  const [notifTime, setNotifTime] = useState(() => localStorage.getItem("openbrain_notif_time") || "07:00");
  useEffect(() => { supabase.auth.getUser().then(({ data: { user } }) => setEmail(user?.email || "")); }, []);

  const requestNotification = async () => {
    if (!("Notification" in window)) { alert("Notifications not supported in this browser."); return; }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      const enabled = !notifEnabled;
      setNotifEnabled(enabled);
      localStorage.setItem("openbrain_notif", String(enabled));
      if (enabled) new Notification("OpenBrain Morning Briefing", { body: "You'll get a daily nudge at " + notifTime, icon: "/favicon.svg" });
    } else {
      alert("Notification permission denied. Enable in browser settings.");
    }
  };

  const testAI = async () => {
    setTestStatus("testing-ai");
    try { const res = await authFetch("/api/anthropic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 10, messages: [{ role: "user", content: "Say ok" }] }) }); setTestStatus(res.ok ? "ai-success" : "ai-fail"); }
    catch { setTestStatus("ai-fail"); }
    setTimeout(() => setTestStatus(null), 3000);
  };
  const testDB = async () => {
    setTestStatus("testing");
    try { const res = await authFetch("/api/health"); setTestStatus(res.ok ? "success" : "fail"); }
    catch { setTestStatus("fail"); }
    setTimeout(() => setTestStatus(null), 3000);
  };
  const btn = { padding: "10px 20px", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" };
  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px", color: t.text }}>Settings</h2>
      <p style={{ fontSize: 12, color: t.textDim, margin: "0 0 24px" }}>All API keys are managed server-side.</p>
      <div style={{ background: t.surface, borderRadius: 14, padding: "20px 24px", marginBottom: 16, border: `1px solid ${t.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div><p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: t.textSoft }}>Signed in as</p><p style={{ margin: "4px 0 0", fontSize: 12, color: t.textMuted }}>{email}</p></div>
          <button onClick={() => supabase.auth.signOut()} style={{ ...btn, background: "#FF6B3520", color: "#FF6B35" }}>Sign out</button>
        </div>
      </div>
      <div style={{ background: t.surface, borderRadius: 14, padding: "20px 24px", marginBottom: 16, border: `1px solid ${t.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div><p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: t.textSoft }}>Claude AI (Haiku)</p><p style={{ margin: "4px 0 0", fontSize: 11, color: t.textDim }}>AI parsing and chat</p></div>
          <button onClick={testAI} style={{ ...btn, background: "#4ECDC420", color: "#4ECDC4" }}>{testStatus === "testing-ai" ? "Testing…" : testStatus === "ai-success" ? "✓ Connected" : testStatus === "ai-fail" ? "✗ Failed" : "Test"}</button>
        </div>
      </div>
      <div style={{ background: t.surface, borderRadius: 14, padding: "20px 24px", marginBottom: 16, border: `1px solid ${t.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div><p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: t.textSoft }}>Supabase Database</p><p style={{ margin: "4px 0 0", fontSize: 11, color: t.textDim }}>Memory storage</p></div>
          <button onClick={testDB} style={{ ...btn, background: "#4ECDC420", color: "#4ECDC4" }}>{testStatus === "testing" ? "Testing…" : testStatus === "success" ? "✓ Connected" : testStatus === "fail" ? "✗ Failed" : "Test"}</button>
        </div>
      </div>
      <div style={{ background: t.surface, borderRadius: 14, padding: "20px 24px", border: `1px solid ${t.border}` }}>
        <p style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: t.textSoft }}>Morning Briefing</p>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: t.textDim }}>Get a daily nudge with your reminders and key info.</p>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <input type="time" value={notifTime} onChange={e => { setNotifTime(e.target.value); localStorage.setItem("openbrain_notif_time", e.target.value); }} style={{ padding: "8px 12px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textSoft, fontSize: 13, outline: "none" }} />
          <button onClick={requestNotification} style={{ ...btn, background: notifEnabled ? "#FF6B3520" : "#4ECDC420", color: notifEnabled ? "#FF6B35" : "#4ECDC4" }}>{notifEnabled ? "Disable" : "Enable"}</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ENTRY CARD
   ═══════════════════════════════════════════════════════════════ */
function EntryCard({ entry: e, onSelect }) {
  const { t, isDark } = useTheme();
  const cfg = TC[e.type] || TC.note;
  const imp = { 1: "Important", 2: "Critical" }[e.importance];
  return (
    <div onClick={() => onSelect(e)} style={{ background: t.surface, border: `1px solid ${e.pinned ? cfg.c + "80" : t.border}`, borderRadius: 12, padding: "16px 20px", cursor: "pointer", position: "relative", overflow: "hidden" }}
      onMouseEnter={ev => { ev.currentTarget.style.borderColor = cfg.c; ev.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={ev => { ev.currentTarget.style.borderColor = e.pinned ? cfg.c + "80" : t.border; ev.currentTarget.style.transform = "none"; }}>
      {e.pinned && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${cfg.c},transparent)` }} />}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>{cfg.i}</span>
        <span style={{ fontSize: 10, color: cfg.c, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5 }}>{e.type}</span>
        {e.pinned && <span style={{ fontSize: 10 }}>📌</span>}
        {imp && <span style={{ fontSize: 9, background: e.importance === 2 ? "#FF6B3530" : "#FFEAA720", color: e.importance === 2 ? "#FF6B35" : "#FFEAA7", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>{imp}</span>}
      </div>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: t.text, lineHeight: 1.3 }}>{e.title}</h3>
      <p style={{ margin: "8px 0 0", fontSize: 13, color: t.textMuted, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.content}</p>
      {e.tags?.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 10 }}>
        {e.tags.slice(0, 4).map(tag => <span key={tag} style={{ fontSize: 10, color: t.textDim, background: isDark ? "#ffffff08" : "#00000008", padding: "2px 8px", borderRadius: 20 }}>{tag}</span>)}
        {e.tags.length > 4 && <span style={{ fontSize: 10, color: t.textFaint }}>+{e.tags.length - 4}</span>}
      </div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   VIRTUALISED GRID
   ═══════════════════════════════════════════════════════════════ */
function VirtualGrid({ filtered, setSelected }) {
  const COLS = typeof window !== "undefined" && window.innerWidth >= 640 ? 2 : 1;
  const rows = useMemo(() => { const r = []; for (let i = 0; i < filtered.length; i += COLS) r.push(filtered.slice(i, i + COLS)); return r; }, [filtered, COLS]);
  const listRef = useRef(null);
  const virtualizer = useWindowVirtualizer({ count: rows.length, estimateSize: () => 172, overscan: 4, scrollMargin: listRef.current?.offsetTop ?? 0 });
  return (
    <div ref={listRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map(vRow => (
          <div key={vRow.index} style={{ position: "absolute", top: vRow.start - virtualizer.options.scrollMargin, left: 0, right: 0, display: "grid", gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: 12, paddingBottom: 12 }}>
            {rows[vRow.index].map(e => <EntryCard key={e.id} entry={e} onSelect={setSelected} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   VIRTUALISED TIMELINE
   ═══════════════════════════════════════════════════════════════ */
function VirtualTimeline({ sorted, setSelected }) {
  const { t } = useTheme();
  const listRef = useRef(null);
  const virtualizer = useWindowVirtualizer({ count: sorted.length, estimateSize: () => 64, overscan: 5, scrollMargin: listRef.current?.offsetTop ?? 0 });
  return (
    <div ref={listRef} style={{ position: "relative", paddingLeft: 24 }}>
      <div style={{ position: "absolute", left: 10, top: 0, bottom: 0, width: 2, background: "linear-gradient(180deg,#4ECDC4,#FF6B35,#A29BFE)" }} />
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map(vItem => {
          const e = sorted[vItem.index]; const cfg = TC[e.type] || TC.note;
          return (
            <div key={e.id} style={{ position: "absolute", top: vItem.start - virtualizer.options.scrollMargin, left: 0, right: 0, paddingLeft: 20, paddingBottom: 16, cursor: "pointer" }} onClick={() => setSelected(e)}>
              <div style={{ position: "absolute", left: -3, top: 6, width: 12, height: 12, borderRadius: "50%", background: cfg.c, border: `2px solid ${t.bg}` }} />
              <p style={{ fontSize: 10, color: t.textDim, margin: "0 0 2px" }}>{fmtD(e.created_at)}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 14 }}>{cfg.i}</span><span style={{ fontSize: 14, color: t.textSoft, fontWeight: 500 }}>{e.title}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════════ */
const CHAT_CHIPS = [
  { label: "Who supplies...", text: "Who supplies " },
  { label: "Who do I call for...", text: "Who do I call for " },
  { label: "When does... expire?", text: "When does " },
  { label: "What's the number for...", text: "What's the number for " },
];

export default function OpenBrain() {
  const [entries, setEntries] = useState(() => {
    try {
      const cached = localStorage.getItem("openbrain_entries");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.every(e => e && typeof e.id === "string" && typeof e.title === "string")) return parsed;
      }
    } catch {}
    return INITIAL_ENTRIES;
  });
  const [entriesLoaded, setEntriesLoaded] = useState(false);

  // ─── Brain context ───
  const { brains, activeBrain, setActiveBrain, createBrain, deleteBrain, refresh } = useBrain(
    useCallback(() => {
      // Reset local state when brain switches
      setEntries(INITIAL_ENTRIES);
      setLinks(LINKS);
      setEntriesLoaded(false);
    }, [])
  );

  const { isOnline, pendingCount, refreshCount } = useOfflineSync({
    onEntryIdUpdate: useCallback((tempId, realId) => {
      setEntries(prev => prev.map(e => e.id === tempId ? { ...e, id: realId } : e));
    }, []),
  });

  // Keep a ref so timer callbacks can read current isOnline without stale closure
  const isOnlineRef = useRef(isOnline);
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [workspace, setWorkspace] = useState(() => localStorage.getItem("openbrain_workspace") || "all");
  const [view, setView] = useState("grid");
  const [selected, setSelected] = useState(null);
  const [links, setLinks] = useState(LINKS);
  const addLinks = (newLinks) => setLinks(prev => [...prev, ...newLinks]);
  const [apiKey] = useState("configured");
  const [sbKey] = useState("configured");
  const { t, isDark, toggleTheme } = useTheme();
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem("openbrain_onboarded"));
  const [showBrainTip, setShowBrainTip] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState([{ role: "assistant", content: "Hey Chris. Ask me about your memories — \"What's my ID number?\", \"Who are my suppliers?\", etc." }]);
  const [chatLoading, setChatLoading] = useState(false);
  const [nudge, setNudge] = useState(() => sessionStorage.getItem("openbrain_nudge") || null);
  const [lastAction, setLastAction] = useState(null);
  const pendingDeleteRef = useRef(null);
  const chatEndRef = useRef(null);
  const searchDebounceRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMsgs]);

  useEffect(() => {
    if (!activeBrain?.id) return;
    setEntriesLoaded(false);
    const url = `/api/entries?brain_id=${encodeURIComponent(activeBrain.id)}`;
    authFetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setEntries(data);
          try { localStorage.setItem("openbrain_entries", JSON.stringify(data)); } catch {}
        }
        setEntriesLoaded(true);
      })
      .catch(() => setEntriesLoaded(true));
  }, [activeBrain?.id]);

  // Proactive intelligence nudge — runs once per session after entries load
  useEffect(() => {
    if (!entriesLoaded || !apiKey || sessionStorage.getItem("openbrain_nudge") !== null) return;
    const recent = entries.slice(0, 30).map(e => ({ id: e.id, title: e.title, type: e.type, tags: e.tags, metadata: e.metadata, created_at: e.created_at }));
    authFetch("/api/anthropic", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 200,
        system: `You are OpenBrain, a proactive memory assistant for Chris. Given his recent entries, generate 1-2 short, specific, actionable nudges he should know right now. Examples: expiring documents, stale ideas, gaps in his business records, upcoming deadlines. Be concrete — mention entry names. Do NOT suggest merging companies just because they share a word in their name. Return plain text, 1-2 sentences max.`,
        messages: [{ role: "user", content: `My recent memories:\n${JSON.stringify(recent)}\n\nWhat should I know right now?` }]
      })
    })
      .then(r => r.json())
      .then(data => {
        const text = data.content?.[0]?.text?.trim();
        if (text) { setNudge(text); sessionStorage.setItem("openbrain_nudge", text); }
        else sessionStorage.setItem("openbrain_nudge", "");
      })
      .catch(() => sessionStorage.setItem("openbrain_nudge", ""));
  }, [entriesLoaded]);

  useEffect(() => {
    if (entriesLoaded) { try { localStorage.setItem("openbrain_entries", JSON.stringify(entries)); } catch {} }
  }, [entries, entriesLoaded]);

  const types = useMemo(() => { const t = {}; entries.forEach(e => { t[e.type] = (t[e.type] || 0) + 1; }); return t; }, [entries]);

  const filtered = useMemo(() => {
    let r = entries;
    if (workspace !== "all") r = r.filter(e => { const ws = inferWorkspace(e); return ws === workspace || ws === "both"; });
    if (typeFilter !== "all") r = r.filter(e => e.type === typeFilter);
    if (search) { const q = search.toLowerCase(); r = r.filter(e => e.title.toLowerCase().includes(q) || (e.content || "").toLowerCase().includes(q) || e.tags?.some(t => t.includes(q)) || JSON.stringify(e.metadata).toLowerCase().includes(q)); }
    return r;
  }, [search, typeFilter, workspace, entries]);

  const sortedTimeline = useMemo(() => [...filtered].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)), [filtered]);

  // ─── Undo system ───
  const commitPendingDelete = useCallback(() => {
    if (!pendingDeleteRef.current) return;
    const { id } = pendingDeleteRef.current;
    if (isOnlineRef.current) {
      authFetch("/api/delete-entry", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
    } else {
      enqueue({ id: crypto.randomUUID(), url: "/api/delete-entry", method: "DELETE", body: JSON.stringify({ id }), created_at: new Date().toISOString() }).then(refreshCount);
    }
    pendingDeleteRef.current = null;
  }, [refreshCount]);

  const handleDelete = useCallback((id) => {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    commitPendingDelete();
    setEntries(prev => prev.filter(e => e.id !== id));
    setSelected(null);
    const timer = setTimeout(() => {
      if (isOnlineRef.current) {
        authFetch("/api/delete-entry", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
      } else {
        enqueue({ id: crypto.randomUUID(), url: "/api/delete-entry", method: "DELETE", body: JSON.stringify({ id }), created_at: new Date().toISOString() }).then(refreshCount);
      }
      pendingDeleteRef.current = null;
      setLastAction(null);
    }, 5000);
    pendingDeleteRef.current = { id, entry, timer };
    setLastAction({ type: "delete", entry });
  }, [entries, commitPendingDelete]);

  const handleUpdate = useCallback(async (id, changes) => {
    const previous = entries.find(e => e.id === id);
    if (!isOnline) {
      await enqueue({ id: crypto.randomUUID(), url: "/api/update-entry", method: "PATCH", body: JSON.stringify({ id, ...changes }), created_at: new Date().toISOString() });
      refreshCount();
      setEntries(prev => prev.map(e => e.id === id ? { ...e, ...changes } : e));
      setSelected(prev => prev?.id === id ? { ...prev, ...changes } : prev);
      if (previous) setLastAction({ type: "update", id, previous: { title: previous.title, content: previous.content, type: previous.type, tags: previous.tags, metadata: previous.metadata } });
      return;
    }
    try {
      const res = await authFetch("/api/update-entry", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...changes }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data?.message || data?.error) ?? `HTTP ${res.status}`);
      if (Array.isArray(data) && data.length === 0) throw new Error(`No row matched id=${id}`);
    } catch (e) { alert(`Save failed: ${e.message}`); return; }
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...changes } : e));
    setSelected(prev => prev?.id === id ? { ...prev, ...changes } : prev);
    if (previous) setLastAction({ type: "update", id, previous: { title: previous.title, content: previous.content, type: previous.type, tags: previous.tags, metadata: previous.metadata } });
  }, [entries, isOnline, refreshCount]);

  const handleUndo = useCallback(() => {
    if (!lastAction) return;
    if (lastAction.type === "delete" && pendingDeleteRef.current) {
      clearTimeout(pendingDeleteRef.current.timer);
      setEntries(prev => [pendingDeleteRef.current.entry, ...prev]);
      pendingDeleteRef.current = null;
    }
    if (lastAction.type === "update") {
      const { id, previous } = lastAction;
      authFetch("/api/update-entry", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...previous }) }).catch(() => {});
      setEntries(prev => prev.map(e => e.id === id ? { ...e, ...previous } : e));
      setSelected(prev => prev?.id === id ? { ...prev, ...previous } : prev);
    }
    if (lastAction.type === "create") {
      const { id } = lastAction;
      authFetch("/api/delete-entry", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
      setEntries(prev => prev.filter(e => e.id !== id));
    }
    setLastAction(null);
  }, [lastAction]);

  const handleCreated = useCallback((newEntry) => {
    setLastAction({ type: "create", id: newEntry.id });
  }, []);

  // ─── Reorder / Renewal Reminder ───
  const handleReorder = useCallback(async (supplier) => {
    const due = new Date();
    const isRenewal = supplier._renewalMode;
    if (isRenewal) due.setMonth(due.getMonth() + 1); else due.setDate(due.getDate() + 7);
    const parsed = isRenewal ? {
      title: `Renew ${supplier.title}`,
      content: `Set a renewal reminder for ${supplier.title}.`,
      type: "reminder",
      metadata: { status: "pending", due_date: due.toISOString().split("T")[0] },
      tags: ["renewal", "admin"]
    } : {
      title: `Reorder from ${supplier.title.split(" - ")[0]}`,
      content: `Remember to place a reorder with ${supplier.title}.`,
      type: "reminder",
      metadata: { status: "pending", due_date: due.toISOString().split("T")[0] },
      tags: ["reorder", "smash burger bar"]
    };
    try {
      const res = await authFetch("/api/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p_title: parsed.title, p_content: parsed.content, p_type: parsed.type, p_metadata: parsed.metadata, p_tags: parsed.tags }) });
      const result = res.ok ? await res.json() : null;
      const newEntry = { id: result?.id || Date.now().toString(), ...parsed, pinned: false, importance: 1, created_at: new Date().toISOString() };
      setEntries(prev => [newEntry, ...prev]);
      setLastAction({ type: "create", id: newEntry.id });
    } catch { /* silently fail */ }
  }, []);

  const handleChat = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim(); setChatInput(""); setChatMsgs(p => [...p, { role: "user", content: msg }]); setChatLoading(true);
    try {
      const res = await authFetch("/api/anthropic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 1000, system: `You are OpenBrain, Chris's memory assistant. Be concise. When you mention a phone number, format it clearly. If the answer contains a phone number, put it on its own line.\n\nMEMORIES:\n${JSON.stringify(entries.slice(0, 100))}\n\nLINKS:\n${JSON.stringify(links)}`, messages: [{ role: "user", content: msg }] }) });
      const data = await res.json();
      setChatMsgs(p => [...p, { role: "assistant", content: data.content?.map(c => c.text || "").join("") || "Couldn't process." }]);
    } catch { setChatMsgs(p => [...p, { role: "assistant", content: "Connection error." }]); }
    setChatLoading(false);
  };

  const navViews = [
    { id: "grid", l: "Grid", ic: "▦" },
    { id: "suggest", l: "Fill Brain", ic: "✦" },
    { id: "refine", l: "Refine", ic: "◇" },
    { id: "calendar", l: "Calendar", ic: "📅" },
    { id: "todos", l: "Todos", ic: "✓" },
    { id: "timeline", l: "Timeline", ic: "◔" },
    { id: "graph", l: "Graph", ic: "◉" },
    { id: "chat", l: "Ask", ic: "◈" },
    { id: "settings", l: "Settings", ic: "⚙" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: "'Söhne', system-ui, -apple-system, sans-serif", transition: "background 0.25s, color 0.25s" }}>
      <div style={{ padding: "20px 24px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #4ECDC4, #45B7D1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🧠</div>
          <div><h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>OpenBrain</h1><p style={{ margin: 0, fontSize: 11, color: t.textDim }}>Your eternal memory</p></div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            {brains.length > 0 && (
              <BrainSwitcher
                brains={brains}
                activeBrain={activeBrain}
                onSwitch={setActiveBrain}
                onBrainCreated={async (brain) => {
                  await refresh();
                  setActiveBrain(brain);
                }}
                onBrainDeleted={deleteBrain}
                onBrainTip={(brain) => setShowBrainTip(brain)}
              />
            )}
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              style={{ width: 46, height: 26, borderRadius: 13, border: `1px solid ${t.border}`, background: isDark ? "#2a2a4a" : "#e8e8f8", cursor: "pointer", position: "relative", padding: 0, flexShrink: 0, transition: "background 0.25s" }}
            >
              <div style={{ position: "absolute", top: 3, left: isDark ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: isDark ? "#A29BFE" : "#FFD700", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, transition: "left 0.25s, background 0.25s" }}>
                {isDark ? "🌙" : "☀️"}
              </div>
            </button>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 11, color: t.textFaint }}>{entries.length} memories</span>
              {apiKey && <span style={{ display: "block", fontSize: 9, color: "#4ECDC4" }}>AI active</span>}
              {pendingCount > 0 && (
                <span style={{ display: "block", fontSize: 9, color: "#FFD700", marginTop: 2 }}>
                  {pendingCount} pending sync
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <QuickCapture apiKey={apiKey} sbKey={sbKey} entries={entries} setEntries={setEntries} links={links} addLinks={addLinks} onCreated={handleCreated} brainId={activeBrain?.id} isOnline={isOnline} refreshCount={refreshCount} />

      {showBrainTip && (
        <BrainTipCard
          brain={showBrainTip}
          onDismiss={() => setShowBrainTip(null)}
          onFill={() => { setShowBrainTip(null); setView("suggest"); }}
        />
      )}

      {view === "grid" && nudge && <NudgeBanner nudge={nudge} onDismiss={() => { setNudge(null); sessionStorage.removeItem("openbrain_nudge"); }} />}

      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${t.border}`, overflowX: "auto", scrollbarWidth: "none" }}>
        {navViews.map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{ flexShrink: 0, minWidth: 72, padding: "10px 8px", border: "none", borderBottom: view === v.id ? "2px solid #4ECDC4" : "2px solid transparent", background: "none", color: view === v.id ? "#4ECDC4" : t.textFaint, fontSize: 10, fontWeight: 600, cursor: "pointer", position: "relative" }}>
            {v.ic} {v.l}
            {v.id === "suggest" && <span style={{ position: "absolute", top: 2, right: "calc(50% - 24px)", width: 5, height: 5, borderRadius: "50%", background: "#FF6B35" }} />}
          </button>
        ))}
      </div>

      <div style={{ padding: 20 }}>
        {view === "grid" && <>
          {/* Workspace toggle */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {["all", "business", "personal"].map(ws => (
              <button key={ws} onClick={() => { setWorkspace(ws); localStorage.setItem("openbrain_workspace", ws); }} style={{ padding: "5px 14px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", background: workspace === ws ? "#A29BFE" : t.surface, color: workspace === ws ? "#0f0f23" : t.textMuted, textTransform: "capitalize" }}>{ws === "all" ? "All" : ws === "business" ? "🏪 Business" : "👤 Personal"}</button>
            ))}
          </div>
          <div style={{ position: "relative", marginBottom: 16 }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: t.textFaint }}>⌕</span>
            <input value={searchInput} onChange={e => { setSearchInput(e.target.value); clearTimeout(searchDebounceRef.current); searchDebounceRef.current = setTimeout(() => setSearch(e.target.value), 200); }} placeholder="Search..." style={{ width: "100%", boxSizing: "border-box", padding: "12px 16px 12px 38px", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, color: t.textSoft, fontSize: 14, outline: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 16, scrollbarWidth: "none" }}>
            <button onClick={() => setTypeFilter("all")} style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", background: typeFilter === "all" ? "#4ECDC4" : t.surface, color: typeFilter === "all" ? "#0f0f23" : t.textMuted }}>All ({entries.length})</button>
            {Object.entries(types).map(([typ, n]) => { const c = TC[typ] || TC.note; return <button key={typ} onClick={() => setTypeFilter(typ)} style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", background: typeFilter === typ ? c.c : t.surface, color: typeFilter === typ ? "#0f0f23" : t.textMuted }}>{c.i} {typ} ({n})</button>; })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            {[{ l: "Memories", v: entries.length, c: "#4ECDC4" }, { l: "Pinned", v: entries.filter(e => e.pinned).length, c: "#FFD700" }, { l: "Types", v: Object.keys(types).length, c: "#A29BFE" }, { l: "Links", v: links.length, c: "#FF6B35" }].map(s =>
              <div key={s.l} style={{ background: t.surface, borderRadius: 12, padding: "14px 12px", textAlign: "center", border: `1px solid ${t.border}` }}><div style={{ fontSize: 26, fontWeight: 800, color: s.c }}>{s.v}</div><div style={{ fontSize: 9, color: t.textDim, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{s.l}</div></div>
            )}
          </div>
          {filtered.length > 0 ? <VirtualGrid filtered={filtered} setSelected={setSelected} /> : <p style={{ textAlign: "center", color: "#555", marginTop: 40 }}>No memories match.</p>}
        </>}

        {view === "suppliers" && <SupplierPanel entries={entries} onSelect={setSelected} onReorder={handleReorder} />}
        {view === "suggest" && <Suspense fallback={<Loader />}><SuggestionsView apiKey={apiKey} sbKey={sbKey} entries={entries} setEntries={setEntries} activeBrain={activeBrain} brains={brains} /></Suspense>}
        {view === "refine" && <Suspense fallback={<Loader />}><RefineView apiKey={apiKey} entries={entries} setEntries={setEntries} links={links} addLinks={addLinks} activeBrain={activeBrain} /></Suspense>}
        {view === "calendar" && <Suspense fallback={<Loader />}><CalendarView entries={entries} /></Suspense>}
        {view === "todos" && <Suspense fallback={<Loader />}><TodoView /></Suspense>}
        {view === "timeline" && <VirtualTimeline sorted={sortedTimeline} setSelected={setSelected} />}
        {view === "graph" && <Suspense fallback={<Loader />}><p style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>Knowledge graph — click nodes to view</p><GraphView onSelect={setSelected} /></Suspense>}

        {view === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 260px)" }}>
            <div style={{ flex: 1, overflow: "auto", marginBottom: 12 }}>
              {chatMsgs.map((m, i) => (
                <div key={i} style={{ marginBottom: 12, display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "85%", padding: "12px 16px", borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: m.role === "user" ? "#4ECDC4" : t.surface, color: m.role === "user" ? "#0f0f23" : t.textMid, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                    {m.role === "assistant" ? m.content.split(/(\+27[0-9]{9}|0[6-8][0-9]{8})/).map((part, pi) =>
                      /(\+27[0-9]{9}|0[6-8][0-9]{8})/.test(part)
                        ? <a key={pi} href={`tel:${part}`} style={{ color: "#4ECDC4", fontWeight: 700, textDecoration: "none" }}>{part}</a>
                        : part
                    ) : m.content}
                  </div>
                </div>
              ))}
              {chatLoading && <div style={{ display: "flex" }}><div style={{ padding: "12px 16px", borderRadius: "16px 16px 16px 4px", background: t.surface, color: t.textDim }}>Thinking...</div></div>}
              <div ref={chatEndRef} />
            </div>
            {/* Quick-ask chips */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {CHAT_CHIPS.map(chip => (
                <button key={chip.label} onClick={() => setChatInput(chip.text)} style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${t.border}`, background: t.surface, color: t.textMuted, fontSize: 11, cursor: "pointer" }}>{chip.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleChat()} placeholder="Ask about your memories..." style={{ flex: 1, padding: "12px 16px", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, color: t.textSoft, fontSize: 14, outline: "none" }} />
              <button onClick={handleChat} disabled={chatLoading || !apiKey} style={{ padding: "12px 20px", background: apiKey ? "#4ECDC4" : t.surface, border: "none", borderRadius: 12, color: apiKey ? "#0f0f23" : t.textFaint, fontWeight: 700, cursor: apiKey ? "pointer" : "default", opacity: chatLoading ? 0.5 : 1 }}>→</button>
            </div>
          </div>
        )}

        {view === "settings" && <SettingsView />}
      </div>

      <Suspense fallback={null}>
        <DetailModal
          entry={selected}
          onClose={() => setSelected(null)}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
          onReorder={handleReorder}
        />
      </Suspense>

      {lastAction && (
        <UndoToast
          action={lastAction}
          onUndo={handleUndo}
          onDismiss={() => {
            if (lastAction.type === "delete") commitPendingDelete();
            setLastAction(null);
          }}
        />
      )}

      {showOnboarding && (
        <OnboardingModal
          apiKey={apiKey}
          onComplete={(selected, answeredItems, skippedQs) => {
            // Mark answered onboarding questions so they don't re-appear in Fill Brain
            if (answeredItems?.length) {
              try {
                const key = "openbrain_answered_qs_personal";
                const existing = new Set(JSON.parse(localStorage.getItem(key) || "[]"));
                answeredItems.forEach(item => existing.add(item.q));
                localStorage.setItem(key, JSON.stringify([...existing]));
              } catch {}

              // Batch-save answered items to the brain via Quick Capture API
              answeredItems.forEach(item => {
                authFetch("/api/anthropic", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    model: "claude-haiku-4-5-20251001", max_tokens: 800,
                    system: `Parse this Q&A into a structured entry. Return ONLY valid JSON:\n{"title":"...","content":"...","type":"note|person|place|idea|contact|document|reminder|color|decision","metadata":{},"tags":[]}`,
                    messages: [{ role: "user", content: `Question: ${item.q}\nAnswer: ${item.a}` }]
                  })
                })
                  .then(r => r.json())
                  .then(data => {
                    let parsed = {};
                    try { parsed = JSON.parse((data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim()); } catch {}
                    if (parsed.title && activeBrain?.id) {
                      authFetch("/api/capture", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          p_title: parsed.title,
                          p_content: parsed.content || item.a,
                          p_type: parsed.type || "note",
                          p_metadata: parsed.metadata || {},
                          p_tags: parsed.tags || [],
                          p_brain_id: activeBrain.id,
                        })
                      }).catch(() => {});
                    }
                  })
                  .catch(() => {});
              });
            }

            // Store skipped onboarding questions — Fill Brain will surface them
            if (skippedQs?.length) {
              try {
                const existing = JSON.parse(localStorage.getItem("openbrain_onboarding_skipped") || "[]");
                const merged = [...existing];
                skippedQs.forEach(q => {
                  if (!merged.find(e => e.q === q.q)) merged.push(q);
                });
                localStorage.setItem("openbrain_onboarding_skipped", JSON.stringify(merged));
              } catch {}
            }

            setShowOnboarding(false);
            setView("suggest");
          }}
        />
      )}
    </div>
  );
}
