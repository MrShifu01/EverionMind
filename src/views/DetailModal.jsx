import { useState, useEffect, useRef } from "react";
import { TC } from "../data/constants";
import { extractPhone, toWaUrl } from "../OpenBrain";
import { useTheme } from "../ThemeContext";

export default function DetailModal({ entry, onClose, onDelete, onUpdate, onReorder, entries = [], links = [], canWrite = true }) {
  const { t } = useTheme();
  if (!entry) return null;
  const confirmTimerRef = useRef(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editTitle, setEditTitle] = useState(entry.title);
  const [editContent, setEditContent] = useState(entry.content);
  const [editType, setEditType] = useState(entry.type);
  const [editTags, setEditTags] = useState((entry.tags || []).join(', '));
  const [shareMsg, setShareMsg] = useState(null);
  const cfg = TC[editType] || TC.note;
  const related = links.filter(l => l.from === entry.id || l.to === entry.id).map(l => ({
    ...l,
    other: entries.find(e => e.id === (l.from === entry.id ? l.to : l.from)),
    dir: l.from === entry.id ? '→' : '←',
  }));
  const skip = new Set(['category', 'status']);
  const meta = Object.entries(entry.metadata || {}).filter(([k]) => !skip.has(k));
  const inp = { padding: '10px 14px', background: t.bg, border: '1px solid #4ECDC440', borderRadius: 10, color: t.textSoft, fontSize: 14, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  // UX-5: Escape key closes modal
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') { if (editing) setEditing(false); else onClose(); } };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [editing, onClose]);

  const handleSave = async () => {
    setSaving(true);
    const tags = editTags.split(',').map(t => t.trim()).filter(Boolean);
    await onUpdate(entry.id, { title: editTitle, content: editContent, type: editType, tags });
    setSaving(false);
    setEditing(false);
  };

  const handleShare = async () => {
    const phone = extractPhone(entry);
    const text = [
      entry.title,
      entry.content,
      phone ? `📞 ${phone}` : null,
      Object.entries(entry.metadata || {}).filter(([k]) => !['category', 'workspace'].includes(k)).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join('\n') || null,
      '— from OpenBrain',
    ].filter(Boolean).join('\n');

    if (navigator.share) {
      try { await navigator.share({ title: entry.title, text }); } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      setShareMsg('Copied to clipboard');
      setTimeout(() => setShareMsg(null), 2500);
    }
  };

  const phone = extractPhone(entry);
  const isSupplier = entry.tags?.includes('supplier') || entry.metadata?.category === 'supplier';
  const abtn = (color) => ({ padding: '6px 14px', borderRadius: 20, border: `1px solid ${color}40`, background: `${color}15`, color, fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' });

  // Build quick actions for this entry type
  const quickActions = [];

  if (isSupplier || entry.type === 'contact' || entry.type === 'person') {
    if (phone) {
      quickActions.push(<a key="call" href={`tel:${phone}`} style={abtn('#4ECDC4')}>📞 Call</a>);
      quickActions.push(<a key="wa" href={toWaUrl(phone)} target="_blank" rel="noreferrer" style={abtn('#25D366')}>💬 WhatsApp</a>);
    }
    if (isSupplier && onReorder) {
      quickActions.push(<button key="reorder" onClick={() => onReorder(entry)} style={abtn('#FF6B35')}>🔁 Reorder</button>);
    }
  }

  if (entry.type === 'reminder') {
    if (entry.metadata?.status !== 'done') {
      quickActions.push(
        <button key="done" onClick={() => onUpdate(entry.id, { metadata: { ...entry.metadata, status: 'done' }, importance: 0 })} style={abtn('#4ECDC4')}>✅ Mark Done</button>
      );
    }
    quickActions.push(
      <button key="snooze1w" onClick={() => {
        const d = new Date(entry.metadata?.due_date || Date.now());
        d.setDate(d.getDate() + 7);
        onUpdate(entry.id, { metadata: { ...entry.metadata, due_date: d.toISOString().split('T')[0] } });
      }} style={abtn('#A29BFE')}>⏰ +1 week</button>
    );
    quickActions.push(
      <button key="snooze1m" onClick={() => {
        const d = new Date(entry.metadata?.due_date || Date.now());
        d.setMonth(d.getMonth() + 1);
        onUpdate(entry.id, { metadata: { ...entry.metadata, due_date: d.toISOString().split('T')[0] } });
      }} style={abtn('#A29BFE')}>⏰ +1 month</button>
    );
  }

  if (entry.type === 'idea') {
    if (entry.metadata?.status !== 'in_progress') {
      quickActions.push(
        <button key="start" onClick={() => onUpdate(entry.id, { metadata: { ...entry.metadata, status: 'in_progress' } })} style={abtn('#FFEAA7')}>🚀 Start this</button>
      );
    }
    if (entry.metadata?.status !== 'archived') {
      quickActions.push(
        <button key="archive" onClick={() => onUpdate(entry.id, { metadata: { ...entry.metadata, status: 'archived' } })} style={abtn('#666')}>📦 Archive</button>
      );
    }
  }

  if (entry.type === 'document' && onReorder) {
    quickActions.push(
      <button key="renewal" onClick={() => onReorder({ ...entry, _renewalMode: true })} style={abtn('#FF6B35')}>🔔 Set renewal reminder</button>
    );
  }

  // Share always available
  quickActions.push(<button key="share" onClick={handleShare} style={abtn('#45B7D1')}>📤 Share</button>);

  return (
    <div role="dialog" aria-labelledby="detail-modal-title" style={{ position: 'fixed', inset: 0, background: '#000000CC', zIndex: 1000 /* z-index scale: PinGate=9999, Onboarding=3000, DetailModal=1000 */, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }} onClick={editing ? undefined : onClose}>
      <div style={{ background: t.surface2, borderRadius: 16, maxWidth: 600, width: '100%', maxHeight: '90vh', overflow: 'auto', border: `1px solid ${cfg.c}40` }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 24 }}>{cfg.i}</span>
              <span style={{ fontSize: 11, color: cfg.c, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5 }}>{editType}</span>
            </div>
            {!editing && <h2 id="detail-modal-title" style={{ margin: 0, fontSize: 22, color: t.text, fontWeight: 700 }}>{editTitle}</h2>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            {!editing && canWrite && onDelete && <button onClick={async () => { if (!confirmingDelete) { setConfirmingDelete(true); confirmTimerRef.current = setTimeout(() => setConfirmingDelete(false), 3000); } else { setDeleting(true); await onDelete(entry.id); setDeleting(false); } }} disabled={deleting} style={{ padding: '6px 14px', background: deleting ? t.surface : confirmingDelete ? '#FF6B3540' : '#FF6B3520', border: '1px solid #FF6B3540', borderRadius: 8, color: deleting ? t.textFaint : '#FF6B35', fontSize: 12, fontWeight: 600, cursor: deleting ? 'default' : 'pointer' }}>{deleting ? 'Deleting...' : confirmingDelete ? 'Confirm delete?' : 'Delete'}</button>}
            {!editing && canWrite && onUpdate && <button onClick={() => setEditing(true)} style={{ padding: '6px 14px', background: '#4ECDC420', border: '1px solid #4ECDC440', borderRadius: 8, color: '#4ECDC4', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Edit</button>}
            {!canWrite && <span style={{ fontSize: 11, color: '#888', padding: '6px 8px' }}>🔒 View only</span>}
            <button onClick={editing ? () => setEditing(false) : onClose} style={{ background: 'none', border: 'none', color: t.textDim, fontSize: 24, cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {/* Edit form */}
        {editing ? (
          <div style={{ padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><label style={{ fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Title</label><input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)} style={inp} /></div>
            <div><label style={{ fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Type</label>
              <select value={editType} onChange={e => setEditType(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                {['note','person','place','idea','contact','document','reminder','color','decision'].map(typ => <option key={typ} value={typ}>{typ}</option>)}
              </select>
            </div>
            <div><label style={{ fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Content</label><textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={4} style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }} /></div>
            <div><label style={{ fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Tags <span style={{ color: t.textFaint, fontWeight: 400, textTransform: 'none' }}>(comma separated)</span></label><input value={editTags} onChange={e => setEditTags(e.target.value)} style={inp} placeholder="tag1, tag2, tag3" /></div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button onClick={() => setEditing(false)} style={{ flex: 1, padding: 12, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, color: t.textMuted, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !editTitle.trim()} style={{ flex: 2, padding: 12, background: editTitle.trim() ? 'linear-gradient(135deg, #4ECDC4, #45B7D1)' : t.surface, border: 'none', borderRadius: 10, color: editTitle.trim() ? '#0f0f23' : t.textDim, fontSize: 13, fontWeight: 700, cursor: editTitle.trim() ? 'pointer' : 'default' }}>{saving ? 'Saving...' : 'Save changes'}</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '16px 16px' }}>
            <p style={{ color: t.textMid, fontSize: 14, lineHeight: 1.7, margin: 0 }}>{editContent}</p>
            {meta.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', marginTop: 12 }}>
              {meta.map(([k, v]) => <div key={k} style={{ fontSize: 12 }}><span style={{ color: t.textMuted, textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}: </span><span style={{ color: t.textMid }}>{Array.isArray(v) ? v.join(', ') : String(v)}</span></div>)}
            </div>}
            {editTags.split(',').map(tag => tag.trim()).filter(Boolean).length > 0 && <div style={{ marginTop: 16 }}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{editTags.split(',').map(tag => tag.trim()).filter(Boolean).map(tag => <span key={tag} style={{ fontSize: 11, color: cfg.c, background: cfg.c + '15', padding: '4px 12px', borderRadius: 20 }}>{tag}</span>)}</div></div>}
            {related.length > 0 && <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${t.border}` }}>
              <p style={{ fontSize: 11, color: t.textDim, fontWeight: 600, marginBottom: 10, textTransform: 'uppercase' }}>Connections</p>
              {related.map((r, i) => r.other && <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#ffffff05', borderRadius: 8, marginBottom: 4, fontSize: 13 }}>
                <span>{TC[r.other.type]?.i}</span><span style={{ color: t.textMuted }}>{r.dir}</span><span style={{ color: t.textMid, flex: 1 }}>{r.other.title}</span><span style={{ color: t.textDim, fontSize: 11, fontStyle: 'italic' }}>{r.rel}</span>
              </div>)}
            </div>}
          </div>
        )}

        {/* Quick Actions */}
        {!editing && quickActions.length > 0 && (
          <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${t.border}40` }}>
            <div style={{ paddingTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {quickActions}
            </div>
            {shareMsg && <p style={{ margin: '8px 0 0', fontSize: 11, color: '#4ECDC4' }}>{shareMsg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
