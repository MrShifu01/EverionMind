import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { useTheme } from "../ThemeContext";
import { callAI } from "../lib/ai";
import { aiFetch, getUserModel } from "../lib/aiFetch";
import { authFetch } from "../lib/authFetch";
import { enqueue } from "../lib/offlineQueue";
import { findConnections, scoreTitle } from "../lib/connectionFinder";
import { TC } from "../data/constants";
import { PROMPTS } from "../config/prompts";

const BRAIN_META_QC = {
  personal: { emoji: "🧠" },
  family:   { emoji: "🏠" },
  business: { emoji: "🏪" },
};

function PreviewModal({ preview, entries, onSave, onUpdate, onCancel }) {
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
            <p style={{ margin: "0 0 8px", fontSize: 11, color: "#FFEAA7", fontWeight: 700 }}>⚠ Similar entries found — update one instead?</p>
            {dupes.map(d => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: "#bbb" }}>• {d.title}</span>
                <button
                  onClick={() => { onUpdate(d.id, { title: title.trim(), type, tags: tags.split(",").map(t => t.trim()).filter(Boolean), content: preview.content, metadata: preview.metadata }); onCancel(); }}
                  style={{ fontSize: 11, padding: "3px 8px", background: "#FFEAA720", border: "1px solid #FFEAA750", borderRadius: 6, color: "#FFEAA7", cursor: "pointer" }}
                >Update this</button>
              </div>
            ))}
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

export default function QuickCapture({ entries, setEntries, links, addLinks, onCreated, onUpdate, isOnline = true, refreshCount, brainId, brains = [], canWrite = true }) {
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
  const connectionsTimerRef = useRef(null);
  const lastConnectionsLengthRef = useRef(entries ? entries.length : 0);

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
    if (file.size > 4 * 1024 * 1024) { setStatus("img-too-large"); setTimeout(() => setStatus(null), 3000); return; }
    setLoading(true); setStatus("thinking");
    try {
      const base64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
      // CODE-8: intentional — direct call needed for vision/image processing (multipart content array not supported by callAI wrapper)
      const apiRes = await aiFetch("/api/anthropic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: getUserModel(), max_tokens: 600, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: file.type, data: base64 } }, { type: "text", text: "Extract all text from this image. Output just the extracted content, clean and readable. If it's a business card, document, label, or receipt — preserve structure. No commentary." }] }] }) });
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
      if (parsed.title) {
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
            // PERF-6: debounce findConnections by 5 s; skip during bulk import
            // (heuristic: if entries grew by more than 3 since last run, it's a bulk import)
            const currentLength = entries.length;
            const delta = currentLength - lastConnectionsLengthRef.current;
            lastConnectionsLengthRef.current = currentLength + 1; // +1 for the entry being saved
            if (delta <= 3) {
              clearTimeout(connectionsTimerRef.current);
              const entrySnapshot = newEntry;
              const entriesSnapshot = entries;
              const linksSnapshot = links || [];
              connectionsTimerRef.current = setTimeout(() => {
                findConnections(entrySnapshot, entriesSnapshot, linksSnapshot).then(newLinks => {
                  if (newLinks.length === 0) return;
                  addLinks?.(newLinks);
                  authFetch("/api/save-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ links: newLinks }) }).catch(err => console.error('[QuickCapture:findConnections] Failed to save links', err));
                });
              }, 5000);
            }
          } else {
            console.warn("[doSave] API returned non-ok, queuing for retry:", rpcRes.status);
            const tempId = Date.now().toString();
            const newEntry = { id: tempId, ...parsed, pinned: false, importance: 0, tags: parsed.tags || [], created_at: new Date().toISOString() };
            await enqueue({ id: crypto.randomUUID(), url: "/api/capture", method: "POST", body: JSON.stringify({ p_title: parsed.title, p_content: parsed.content || "", p_type: parsed.type || "note", p_metadata: parsed.metadata || {}, p_tags: parsed.tags || [] }), created_at: new Date().toISOString(), tempId });
            refreshCount?.();
            setEntries(prev => [newEntry, ...prev]);
            onCreated?.(newEntry);
            setStatus("error");
          }
        }
      }
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
    setLoading(false); setTimeout(() => setStatus(null), 3000);
  }, [entries, links, addLinks, onCreated, setEntries, isOnline, refreshCount, primaryBrainId, extraBrainIds]);

  const capture = async () => {
    if (!text.trim()) return;
    const input = text.trim(); setText(""); setLoading(true); setStatus("thinking");
    if (!isOnline) {
      const tempId = Date.now().toString();
      const newEntry = { id: tempId, title: input.slice(0, 60), content: input, type: "note", metadata: {}, pinned: false, importance: 0, tags: [], created_at: new Date().toISOString() };
      await enqueue({ id: crypto.randomUUID(), type: "raw-capture", anthropicRequest: { model: getUserModel(), max_tokens: 800, system: PROMPTS.CAPTURE, messages: [{ role: "user", content: input }] }, tempId, created_at: new Date().toISOString() });
      refreshCount?.();
      setEntries(prev => [newEntry, ...prev]);
      onCreated?.(newEntry);
      setStatus("saved-local");
      setLoading(false); setTimeout(() => setStatus(null), 3000);
      return;
    }
    try {
      const res = await callAI({ system: PROMPTS.CAPTURE, max_tokens: 800, messages: [{ role: "user", content: input }] });
      const data = await res.json();
      let parsed = {};
      try { parsed = JSON.parse((data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim()); } catch {}
      if (parsed.title) {
        setLoading(false); setStatus(null);
        setPreview({ ...parsed, _raw: input });
        return;
      }
      const newEntry = { id: Date.now().toString(), title: input.slice(0, 60), content: input, type: "note", metadata: {}, pinned: false, importance: 0, tags: [], created_at: new Date().toISOString() };
      setEntries(prev => [newEntry, ...prev]);
      onCreated?.(newEntry);
      setStatus("saved-raw");
    } catch (e) {
      console.error("[capture] API error, queuing for retry:", e);
      const tempId = Date.now().toString();
      const newEntry = { id: tempId, title: input.slice(0, 60), content: input, type: "note", metadata: {}, pinned: false, importance: 0, tags: [], created_at: new Date().toISOString() };
      await enqueue({ id: crypto.randomUUID(), type: "raw-capture", anthropicRequest: { model: getUserModel(), max_tokens: 800, system: PROMPTS.CAPTURE, messages: [{ role: "user", content: input }] }, tempId, created_at: new Date().toISOString() });
      refreshCount?.();
      setEntries(prev => [newEntry, ...prev]);
      onCreated?.(newEntry);
      setStatus("error");
    }
    setLoading(false); setTimeout(() => setStatus(null), 3000);
  };

  const statusMsg = { thinking: "🤖 Parsing...", saving: "💾 Saving...", "saved-db": "✅ Saved & synced!", "saved-local": "📡 Saved — will sync when online", "saved-raw": "📝 Saved", error: "⚠️ Sync failed — queued for retry", "offline-image": "📵 Image uploads need a connection", "img-too-large": "⚠️ Photo too large — try a smaller image" };

  if (!canWrite) {
    return (
      <div style={{ padding: "12px 16px 12px", margin: "0 12px 12px", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 18 }}>🔒</span>
        <span style={{ fontSize: 13, color: t.textDim }}>You have view-only access to this brain</span>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 12px 12px" }}>
      {brains.length > 1 ? (
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
      ) : brains.length === 1 ? (
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: t.textDim, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 20, padding: "4px 11px", fontWeight: 600 }}>
            {(BRAIN_META_QC[brains[0].type] || BRAIN_META_QC.personal).emoji} {brains[0].name}
          </span>
        </div>
      ) : null}
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
        <button onClick={capture} disabled={loading || !text.trim()} title={`Save to ${(BRAIN_META_QC[brains[0]?.type] || BRAIN_META_QC.personal).emoji} ${brains[0]?.name || "brain"}`} style={{ padding: "12px 18px", background: text.trim() && !loading ? "linear-gradient(135deg, #4ECDC4, #45B7D1)" : t.surface, border: "none", borderRadius: 12, color: text.trim() && !loading ? "#0f0f23" : t.textFaint, fontWeight: 700, cursor: text.trim() && !loading ? "pointer" : "default", fontSize: 16 }}>+</button>
      </div>
      {status && <p style={{ fontSize: 11, color: status.includes("error") ? "#FF6B35" : "#4ECDC4", margin: "6px 0 0 4px" }}>{statusMsg[status]}</p>}
      {preview && <PreviewModal preview={preview} entries={entries} onSave={doSave} onUpdate={onUpdate} onCancel={() => setPreview(null)} />}
    </div>
  );
}

QuickCapture.propTypes = {
  entries: PropTypes.array.isRequired,
  setEntries: PropTypes.func.isRequired,
  links: PropTypes.array,
  addLinks: PropTypes.func,
  onCreated: PropTypes.func,
  onUpdate: PropTypes.func,
  isOnline: PropTypes.bool,
  refreshCount: PropTypes.func,
  brainId: PropTypes.string,
  brains: PropTypes.array,
  canWrite: PropTypes.bool,
};
