import { useState, useEffect, useRef } from "react";
import { authFetch } from "../../lib/authFetch";
import type { Brain } from "../../types";

// ── Telegram Panel ──────────────────────────────────────────────
function TelegramPanel({ activeBrain }: { activeBrain: Brain }) {
  const [code, setCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const generateCode = async () => {
    setGenerating(true);
    setCodeError(null);
    try {
      const res = await authFetch("/api/brains?action=telegram-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brain_id: activeBrain.id }),
      });
      if (res.ok) {
        const d = await res.json();
        setCode(d.code);
      } else {
        setCodeError("Failed to generate code. Please try again.");
      }
    } catch {
      setCodeError("Network error. Check your connection and try again.");
    }
    setGenerating(false);
  };

  return (
    <div className="rounded-2xl border p-4 space-y-3" style={{ background: "var(--color-surface-container-high)", borderColor: "var(--color-outline-variant)" }}>
      <p className="text-sm font-semibold text-on-surface">Telegram</p>
      <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>Connect Telegram to save entries by messaging the bot.</p>
      {code ? (
        <div className="space-y-2">
          <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
            Send this code to <strong className="text-on-surface">@TheOneAndOnlyOpenBrainBot</strong> on Telegram:
          </p>
          <p className="text-lg font-mono font-bold tracking-widest text-center py-2" style={{ color: "var(--color-primary)" }}>{code}</p>
          <p className="text-[10px] text-center" style={{ color: "var(--color-outline)" }}>Expires in 10 minutes</p>
        </div>
      ) : (
        <>
          <button
            onClick={generateCode}
            disabled={generating}
            className="rounded-xl px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
          >
            {generating ? "Generating…" : "Connect Telegram"}
          </button>
          {codeError && <p className="text-xs mt-1" style={{ color: "var(--color-error)" }}>{codeError}</p>}
        </>
      )}
    </div>
  );
}

// ── Memory Editor ──────────────────────────────────────────────
function MemoryEditor() {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const MAX = 8000;

  useEffect(() => {
    authFetch("/api/memory")
      .then(r => r.ok ? r.json() : {})
      .then((d: any) => setContent(d.content || ""))
      .catch(err => console.error("[BrainTab:MemoryEditor] Failed to load memory content", err));
  }, []);

  const save = async () => {
    setSaving(true);
    const res = await authFetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setStatus(res.ok ? "saved" : "error");
    setSaving(false);
    setTimeout(() => setStatus(null), 3000);
  };

  return (
    <div className="rounded-2xl border p-4 space-y-3" style={{ background: "var(--color-surface-container-high)", borderColor: "var(--color-outline-variant)" }}>
      <p className="text-sm font-semibold text-on-surface">AI Memory Guide</p>
      <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>Markdown guide injected into every AI call for context. Do not include IDs or bank details.</p>
      <textarea
        value={content}
        onChange={e => setContent(e.target.value.slice(0, MAX))}
        rows={8}
        placeholder={"# Everion Classification Guide\n\n## Business Context\n- ...\n\n## Personal Context\n- ..."}
        className="w-full rounded-xl px-3 py-2.5 text-xs bg-transparent border outline-none text-on-surface placeholder:text-on-surface-variant/40 resize-y"
        style={{ borderColor: "var(--color-outline-variant)" }}
        onFocus={e => (e.target.style.borderColor = "var(--color-primary)")}
        onBlur={e => (e.target.style.borderColor = "var(--color-outline-variant)")}
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px]" style={{ color: "var(--color-outline)" }}>{content.length}/{MAX}</span>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
        >
          {saving ? "Saving…" : status === "saved" ? "✓ Saved" : status === "error" ? "✗ Failed" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ── Export / Import Panel ──────────────────────────────────────
function ExportImportPanel({ activeBrain }: { activeBrain: Brain }) {
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const a = document.createElement("a");
    a.href = `/api/export?brain_id=${activeBrain.id}`;
    a.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.entries || !Array.isArray(data.entries)) {
        setImportStatus("invalid"); setTimeout(() => setImportStatus(null), 3000); return;
      }
      if (data.entries.length > 500) {
        setImportStatus("toobig"); setTimeout(() => setImportStatus(null), 3000); return;
      }
      setImporting(true);
      const res = await authFetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brain_id: activeBrain.id, entries: data.entries, options: { skip_duplicates: true } }),
      });
      const result = res.ok ? await res.json() : null;
      setImportStatus(result ? `imported:${result.imported}:${result.skipped}` : "error");
    } catch {
      setImportStatus("error");
    }
    setImporting(false);
    setTimeout(() => setImportStatus(null), 5000);
  };

  const statusMsg = importStatus?.startsWith("imported:")
    ? (() => { const [, i, s] = importStatus.split(":"); return `✓ Imported ${i}, skipped ${s} duplicates`; })()
    : importStatus === "invalid" ? "✗ Invalid file format"
    : importStatus === "toobig" ? "✗ Max 500 entries per import"
    : importStatus === "error" ? "✗ Import failed"
    : null;

  return (
    <div className="rounded-2xl border p-4 space-y-3" style={{ background: "var(--color-surface-container-high)", borderColor: "var(--color-outline-variant)" }}>
      <p className="text-sm font-semibold text-on-surface">Export / Import</p>
      <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
        Export all entries from <strong className="text-on-surface">{activeBrain.name}</strong> as JSON, or import from a previous export.
      </p>
      <div className="flex items-center gap-2">
        <button onClick={handleExport} className="rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors hover:bg-white/5" style={{ color: "var(--color-on-surface-variant)", borderColor: "var(--color-outline-variant)" }}>
          ⬇ Export Brain
        </button>
        <input type="file" accept=".json" ref={fileRef} onChange={handleImportFile} className="hidden" />
        <button onClick={() => fileRef.current?.click()} disabled={importing} className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40" style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}>
          {importing ? "Importing…" : "⬆ Import"}
        </button>
      </div>
      {statusMsg && <p className="text-xs" style={{ color: statusMsg.startsWith("✓") ? "var(--color-primary)" : "var(--color-error)" }}>{statusMsg}</p>}
    </div>
  );
}

// ── Brain Tab ──────────────────────────────────────────────────
interface BrainMember { user_id: string; role: string; }

interface Props {
  activeBrain: Brain;
  canInvite: boolean;
  canManageMembers: boolean;
  onRefreshBrains?: () => void;
}

export default function BrainTab({ activeBrain, canInvite, canManageMembers, onRefreshBrains }: Props) {
  const [members, setMembers] = useState<BrainMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Array<{ id: string; email: string; role: string; created_at: string }>>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [platformInviteEmail, setPlatformInviteEmail] = useState("");
  const [platformInviteStatus, setPlatformInviteStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!activeBrain?.id) return;
    authFetch(`/api/brains?action=members&brain_id=${activeBrain.id}`)
      .then(r => r.ok ? r.json() : []).then(setMembers)
      .catch(err => console.error("[BrainTab] Failed to fetch members", err));
    authFetch(`/api/brains?action=pending-invites&brain_id=${activeBrain.id}`)
      .then(r => r.ok ? r.json() : []).then(setPendingInvites)
      .catch(() => {});
  }, [activeBrain?.id]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteStatus("sending");
    try {
      const res = await authFetch("/api/brains?action=invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brain_id: activeBrain.id, email: inviteEmail.trim(), role: inviteRole }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.invite?.token) {
          setInviteLink(`${window.location.origin}/?invite=${data.invite.token}`);
        }
        setInviteStatus(data.emailSent ? "sent" : "link_ready");
        setInviteEmail("");
        setTimeout(() => { setInviteStatus(null); setInviteLink(null); }, 30000);
      } else {
        setInviteStatus("error");
        setTimeout(() => setInviteStatus(null), 4000);
      }
    } catch {
      setInviteStatus("error");
      setTimeout(() => setInviteStatus(null), 4000);
    }
  };

  const handlePlatformInvite = async () => {
    if (!platformInviteEmail.trim()) return;
    setPlatformInviteStatus("sending");
    try {
      const res = await authFetch("/api/brains?action=invite-platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: platformInviteEmail.trim() }),
      });
      setPlatformInviteStatus(res.ok ? "sent" : "error");
      if (res.ok) setPlatformInviteEmail("");
      setTimeout(() => setPlatformInviteStatus(null), 3000);
    } catch {
      setPlatformInviteStatus("error");
      setTimeout(() => setPlatformInviteStatus(null), 3000);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    const res = await authFetch("/api/brains?action=member-role", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brain_id: activeBrain.id, user_id: userId, role: newRole }),
    });
    if (res.ok) setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role: newRole } : m));
  };

  const handleRemoveMember = async (userId: string) => {
    const res = await authFetch("/api/brains?action=member", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brain_id: activeBrain.id, user_id: userId }),
    });
    if (res.ok) {
      setMembers(prev => prev.filter(m => m.user_id !== userId));
      if (onRefreshBrains) onRefreshBrains();
    }
  };

  const copyInviteLink = (text: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setInviteLinkCopied(true);
    setTimeout(() => setInviteLinkCopied(false), 2000);
  };

  return (
    <>
      <ExportImportPanel activeBrain={activeBrain} />

      {activeBrain.type !== "personal" && (
        <div className="rounded-2xl border p-4 space-y-3" style={{ background: "var(--color-surface-container-high)", borderColor: "var(--color-outline-variant)" }}>
          <p className="text-sm font-semibold text-on-surface">{activeBrain.name} — Members</p>
          {members.length > 0 && (
            <div className="space-y-2">
              {members.map(m => (
                <div key={m.user_id} className="flex items-center gap-2 text-xs">
                  <span className="font-mono" style={{ color: "var(--color-on-surface-variant)" }}>{m.user_id.slice(0, 8)}…</span>
                  <span className="rounded-full px-2 py-0.5" style={{ color: "var(--color-primary)", background: "var(--color-primary-container)" }}>{m.role}</span>
                  {canManageMembers && (
                    <>
                      <select value={m.role} onChange={e => handleRoleChange(m.user_id, e.target.value)} className="rounded-xl px-2 py-1 text-xs bg-transparent border outline-none text-on-surface" style={{ borderColor: "var(--color-outline-variant)" }}>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button onClick={() => handleRemoveMember(m.user_id)} className="text-xs transition-colors hover:underline" style={{ color: "var(--color-error)" }}>Remove</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {canInvite && pendingInvites.length > 0 && (
            <div className="space-y-1 pt-2 border-t" style={{ borderColor: "rgba(72,72,71,0.2)" }}>
              <p className="text-xs font-medium" style={{ color: "var(--color-on-surface-variant)" }}>Pending invites</p>
              {pendingInvites.map(inv => (
                <div key={inv.id} className="flex items-center gap-2 text-xs">
                  <span style={{ color: "var(--color-on-surface-variant)" }}>{inv.email}</span>
                  <span className="rounded-full px-2 py-0.5" style={{ color: "var(--color-on-surface-variant)", background: "rgba(128,128,128,0.1)" }}>{inv.role}</span>
                  {canManageMembers && (
                    <button
                      onClick={() => authFetch("/api/brains?action=revoke-invite", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brain_id: activeBrain?.id, invite_id: inv.id }) }).then(() => setPendingInvites(p => p.filter(i => i.id !== inv.id)))}
                      className="text-xs transition-colors hover:underline"
                      style={{ color: "var(--color-error)" }}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canInvite && (
            <div className="space-y-2 pt-2 border-t" style={{ borderColor: "var(--color-outline-variant)" }}>
              <p className="text-xs font-medium" style={{ color: "var(--color-on-surface-variant)" }}>Invite someone to this brain</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="their@email.com" type="email" className="flex-1 rounded-xl px-3 py-2 text-xs bg-transparent border outline-none text-on-surface placeholder:text-on-surface-variant/40" style={{ borderColor: "var(--color-outline-variant)" }} onFocus={e => (e.target.style.borderColor = "var(--color-primary)")} onBlur={e => (e.target.style.borderColor = "var(--color-outline-variant)")} />
                <div className="flex gap-2">
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="flex-1 rounded-xl px-2 py-2 text-xs bg-transparent border outline-none text-on-surface" style={{ borderColor: "var(--color-outline-variant)" }}>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button onClick={handleInvite} disabled={!inviteEmail.trim() || inviteStatus === "sending"} className="rounded-xl px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 whitespace-nowrap" style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}>
                    {inviteStatus === "sending" ? "…" : inviteStatus === "sent" ? "✓ Sent" : inviteStatus === "error" ? "✗ Failed" : "Invite"}
                  </button>
                </div>
                {(inviteStatus === "link_ready" || inviteStatus === "sent") && inviteLink && (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-[11px]" style={{ color: "var(--color-on-surface-variant)" }}>
                      {inviteStatus === "sent" ? "Email sent — you can also share this link:" : "Share this invite link:"}
                    </p>
                    <div className="flex items-center gap-2">
                      <input readOnly value={inviteLink} className="flex-1 px-3 py-2 rounded-xl text-[11px] text-on-surface focus:outline-none" style={{ background: "var(--color-surface-container)", border: "1px solid var(--color-outline-variant)" }} onFocus={e => e.currentTarget.select()} />
                      <button onClick={() => copyInviteLink(inviteLink)} className="px-3 py-2 rounded-xl text-[11px] font-semibold whitespace-nowrap" style={{ background: "var(--color-primary-container)", color: "var(--color-primary)", border: "1px solid var(--color-primary-container)" }}>
                        {inviteLinkCopied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {!canInvite && <p className="text-xs" style={{ color: "var(--color-outline)" }}>Only the brain owner can invite members.</p>}
        </div>
      )}

      <div className="rounded-2xl border p-4 space-y-3" style={{ background: "var(--color-surface-container-high)", borderColor: "var(--color-outline-variant)" }}>
        <div>
          <p className="text-sm font-semibold text-on-surface">Invite to Everion</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>Send someone an invite to join the platform</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={platformInviteEmail} onChange={e => setPlatformInviteEmail(e.target.value)} placeholder="their@email.com" type="email" className="flex-1 rounded-xl px-3 py-2 text-xs bg-transparent border outline-none text-on-surface placeholder:text-on-surface-variant/40" style={{ borderColor: "var(--color-outline-variant)" }} onFocus={e => (e.target.style.borderColor = "var(--color-primary)")} onBlur={e => (e.target.style.borderColor = "var(--color-outline-variant)")} />
          <button onClick={handlePlatformInvite} disabled={!platformInviteEmail.trim() || platformInviteStatus === "sending"} className="rounded-xl px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 whitespace-nowrap" style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}>
            {platformInviteStatus === "sending" ? "…" : platformInviteStatus === "sent" ? "✓ Invite sent" : platformInviteStatus === "error" ? "✗ Failed" : "Send invite"}
          </button>
        </div>
      </div>

      <TelegramPanel activeBrain={activeBrain} />
    </>
  );
}
