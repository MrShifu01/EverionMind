import { useState, useEffect, useRef } from "react";
import JSZip from "jszip";
import { authFetch } from "../../lib/authFetch";
import type { Brain } from "../../types";

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
        setImportStatus("invalid");
        setTimeout(() => setImportStatus(null), 3000);
        return;
      }
      if (data.entries.length > 500) {
        setImportStatus("toobig");
        setTimeout(() => setImportStatus(null), 3000);
        return;
      }
      setImporting(true);
      const res = await authFetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brain_id: activeBrain.id,
          entries: data.entries,
          options: { skip_duplicates: true },
        }),
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
    ? (() => {
        const [, i, s] = importStatus.split(":");
        return `✓ Imported ${i}, skipped ${s} duplicates`;
      })()
    : importStatus === "invalid"
      ? "✗ Invalid file format"
      : importStatus === "toobig"
        ? "✗ Max 500 entries per import"
        : importStatus === "error"
          ? "✗ Import failed"
          : null;

  return (
    <div
      className="space-y-3 rounded-2xl border p-4"
      style={{
        background: "var(--color-surface-container-high)",
        borderColor: "var(--color-outline-variant)",
      }}
    >
      <p className="text-on-surface text-sm font-semibold">Export / Import</p>
      <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
        Export all entries from <strong className="text-on-surface">{activeBrain.name}</strong> as
        JSON, or import from a previous export.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={handleExport}
          className="rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
          style={{
            color: "var(--color-on-surface-variant)",
            borderColor: "var(--color-outline-variant)",
          }}
        >
          ⬇ Export Brain
        </button>
        <input
          type="file"
          accept=".json"
          ref={fileRef}
          onChange={handleImportFile}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
        >
          {importing ? "Importing…" : "⬆ Import"}
        </button>
      </div>
      {statusMsg && (
        <p
          className="text-xs"
          style={{
            color: statusMsg.startsWith("✓") ? "var(--color-primary)" : "var(--color-error)",
          }}
        >
          {statusMsg}
        </p>
      )}
    </div>
  );
}

// ── Google Keep Import Panel ───────────────────────────────────
interface KeepNote {
  title?: string;
  textContent?: string;
  listContent?: Array<{ text: string; isChecked: boolean }>;
  labels?: Array<{ name: string }>;
  isTrashed?: boolean;
}

function convertKeepNote(note: KeepNote): { title: string; content: string; type: string; tags: string[] } | null {
  if (note.isTrashed) return null;

  const content = note.listContent?.length
    ? note.listContent.map((item) => `- [${item.isChecked ? "x" : " "}] ${item.text}`).join("\n")
    : (note.textContent ?? "");

  const title = note.title?.trim() || content.slice(0, 80);
  if (!title) return null;

  const tags = note.labels?.map((l) => l.name).filter(Boolean) ?? [];
  return { title, content, type: "note", tags };
}

async function parseKeepFiles(files: FileList): Promise<ReturnType<typeof convertKeepNote>[]> {
  const entries: ReturnType<typeof convertKeepNote>[] = [];

  for (const file of Array.from(files)) {
    if (file.name.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(file);
      const jsonFiles = Object.values(zip.files).filter(
        (f) => !f.dir && f.name.endsWith(".json"),
      );
      for (const zf of jsonFiles) {
        try {
          const text = await zf.async("text");
          const note: KeepNote = JSON.parse(text);
          const entry = convertKeepNote(note);
          if (entry) entries.push(entry);
        } catch {
          // skip malformed files
        }
      }
    } else if (file.name.endsWith(".json")) {
      try {
        const text = await file.text();
        const note: KeepNote = JSON.parse(text);
        const entry = convertKeepNote(note);
        if (entry) entries.push(entry);
      } catch {
        // skip malformed files
      }
    }
  }

  return entries;
}

function GoogleKeepImportPanel({ activeBrain }: { activeBrain: Brain }) {
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    e.target.value = "";

    setImporting(true);
    setStatus(null);

    let entries: ReturnType<typeof convertKeepNote>[];
    try {
      entries = await parseKeepFiles(files);
    } catch {
      setImporting(false);
      setStatus("error");
      setTimeout(() => setStatus(null), 4000);
      return;
    }

    if (entries.length === 0) {
      setImporting(false);
      setStatus("empty");
      setTimeout(() => setStatus(null), 4000);
      return;
    }

    const BATCH = 500;
    let totalImported = 0;
    try {
      for (let i = 0; i < entries.length; i += BATCH) {
        const batch = entries.slice(i, i + BATCH);
        const res = await authFetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brain_id: activeBrain.id, entries: batch }),
        });
        if (!res.ok) throw new Error("import failed");
        const data = await res.json();
        totalImported += data.imported ?? batch.length;
      }
      setStatus(`imported:${totalImported}`);
    } catch {
      setStatus("error");
    }

    setImporting(false);
    setTimeout(() => setStatus(null), 5000);
  };

  const statusMsg = status?.startsWith("imported:")
    ? `✓ Imported ${status.split(":")[1]} notes`
    : status === "empty"
      ? "✗ No valid Keep notes found"
      : status === "error"
        ? "✗ Import failed"
        : null;

  return (
    <div
      className="space-y-3 rounded-2xl border p-4"
      style={{
        background: "var(--color-surface-container-high)",
        borderColor: "var(--color-outline-variant)",
      }}
    >
      <div>
        <p className="text-on-surface text-sm font-semibold">Import from Google Keep</p>
        <p className="mt-0.5 text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
          Upload a Google Takeout <strong className="text-on-surface">.zip</strong> or individual
          Keep <strong className="text-on-surface">.json</strong> files. Trashed notes are skipped.
        </p>
      </div>
      <input
        type="file"
        accept=".zip,.json"
        multiple
        ref={fileRef}
        onChange={handleFiles}
        className="hidden"
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={importing}
        className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
        style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
      >
        {importing ? "Importing…" : "⬆ Import Keep Notes"}
      </button>
      {statusMsg && (
        <p
          className="text-xs"
          style={{
            color: statusMsg.startsWith("✓") ? "var(--color-primary)" : "var(--color-error)",
          }}
        >
          {statusMsg}
        </p>
      )}
    </div>
  );
}

// ── Brain Tab ──────────────────────────────────────────────────
interface BrainMember {
  user_id: string;
  role: string;
}

interface Props {
  activeBrain: Brain;
  canInvite: boolean;
  canManageMembers: boolean;
  onRefreshBrains?: () => void;
}

export default function BrainTab({
  activeBrain,
  canInvite,
  canManageMembers,
  onRefreshBrains,
}: Props) {
  const [members, setMembers] = useState<BrainMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<
    Array<{ id: string; email: string; role: string; created_at: string }>
  >([]);
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
      .then((r) => (r.ok ? r.json() : []))
      .then(setMembers)
      .catch((err) => console.error("[BrainTab] Failed to fetch members", err));
    authFetch(`/api/brains?action=pending-invites&brain_id=${activeBrain.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setPendingInvites)
      .catch((err) => console.error("[BrainTab] Failed to fetch pending invites", err));
  }, [activeBrain?.id]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteStatus("sending");
    try {
      const res = await authFetch("/api/brains?action=invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brain_id: activeBrain.id,
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.invite?.token) {
          setInviteLink(`${window.location.origin}/?invite=${data.invite.token}`);
        }
        setInviteStatus(data.emailSent ? "sent" : "link_ready");
        setInviteEmail("");
        setTimeout(() => {
          setInviteStatus(null);
          setInviteLink(null);
        }, 30000);
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
    if (res.ok)
      setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m)));
  };

  const handleRemoveMember = async (userId: string) => {
    const res = await authFetch("/api/brains?action=member", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brain_id: activeBrain.id, user_id: userId }),
    });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
      if (onRefreshBrains) onRefreshBrains();
    }
  };

  const copyInviteLink = (text: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .catch((err) => console.error("[BrainTab] clipboard write failed", err));
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setInviteLinkCopied(true);
    setTimeout(() => setInviteLinkCopied(false), 2000);
  };

  return (
    <>
      <ExportImportPanel activeBrain={activeBrain} />
      <GoogleKeepImportPanel activeBrain={activeBrain} />

      {activeBrain.type !== "personal" && (
        <div
          className="space-y-3 rounded-2xl border p-4"
          style={{
            background: "var(--color-surface-container-high)",
            borderColor: "var(--color-outline-variant)",
          }}
        >
          <p className="text-on-surface text-sm font-semibold">{activeBrain.name} — Members</p>
          {members.length > 0 && (
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.user_id} className="flex items-center gap-2 text-xs">
                  <span className="font-mono" style={{ color: "var(--color-on-surface-variant)" }}>
                    {m.user_id.slice(0, 8)}…
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5"
                    style={{
                      color: "var(--color-primary)",
                      background: "var(--color-primary-container)",
                    }}
                  >
                    {m.role}
                  </span>
                  {canManageMembers && (
                    <>
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.user_id, e.target.value)}
                        className="text-on-surface rounded-xl border bg-transparent px-2 py-1 text-xs outline-none"
                        style={{ borderColor: "var(--color-outline-variant)" }}
                      >
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        onClick={() => handleRemoveMember(m.user_id)}
                        className="text-xs transition-colors hover:underline"
                        style={{ color: "var(--color-error)" }}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {canInvite && pendingInvites.length > 0 && (
            <div
              className="space-y-1 border-t pt-2"
              style={{ borderColor: "var(--color-outline-variant)" }}
            >
              <p
                className="text-xs font-medium"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                Pending invites
              </p>
              {pendingInvites.map((inv) => (
                <div key={inv.id} className="flex items-center gap-2 text-xs">
                  <span style={{ color: "var(--color-on-surface-variant)" }}>{inv.email}</span>
                  <span
                    className="rounded-full px-2 py-0.5"
                    style={{
                      color: "var(--color-on-surface-variant)",
                      background: "var(--color-surface-container)",
                    }}
                  >
                    {inv.role}
                  </span>
                  {canManageMembers && (
                    <button
                      onClick={() =>
                        authFetch("/api/brains?action=revoke-invite", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ brain_id: activeBrain?.id, invite_id: inv.id }),
                        }).then(() => setPendingInvites((p) => p.filter((i) => i.id !== inv.id)))
                      }
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
            <div
              className="space-y-2 border-t pt-2"
              style={{ borderColor: "var(--color-outline-variant)" }}
            >
              <p
                className="text-xs font-medium"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                Invite someone to this brain
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="their@email.com"
                  type="email"
                  className="text-on-surface placeholder:text-on-surface-variant/40 flex-1 rounded-xl border bg-transparent px-3 py-2 text-xs outline-none"
                  style={{ borderColor: "var(--color-outline-variant)" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--color-outline-variant)")}
                />
                <div className="flex gap-2">
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="text-on-surface flex-1 rounded-xl border bg-transparent px-2 py-2 text-xs outline-none"
                    style={{ borderColor: "var(--color-outline-variant)" }}
                  >
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    onClick={handleInvite}
                    disabled={!inviteEmail.trim() || inviteStatus === "sending"}
                    className="rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-40"
                    style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
                  >
                    {inviteStatus === "sending"
                      ? "…"
                      : inviteStatus === "sent"
                        ? "✓ Sent"
                        : inviteStatus === "error"
                          ? "✗ Failed"
                          : "Invite"}
                  </button>
                </div>
                {(inviteStatus === "link_ready" || inviteStatus === "sent") && inviteLink && (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-[11px]" style={{ color: "var(--color-on-surface-variant)" }}>
                      {inviteStatus === "sent"
                        ? "Email sent — you can also share this link:"
                        : "Share this invite link:"}
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={inviteLink}
                        className="text-on-surface flex-1 rounded-xl px-3 py-2 text-[11px] focus:outline-none"
                        style={{
                          background: "var(--color-surface-container)",
                          border: "1px solid var(--color-outline-variant)",
                        }}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <button
                        onClick={() => copyInviteLink(inviteLink)}
                        className="rounded-xl px-3 py-2 text-[11px] font-semibold whitespace-nowrap"
                        style={{
                          background: "var(--color-primary-container)",
                          color: "var(--color-primary)",
                          border: "1px solid var(--color-primary-container)",
                        }}
                      >
                        {inviteLinkCopied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {!canInvite && (
            <p className="text-xs" style={{ color: "var(--color-outline)" }}>
              Only the brain owner can invite members.
            </p>
          )}
        </div>
      )}

      <div
        className="space-y-3 rounded-2xl border p-4"
        style={{
          background: "var(--color-surface-container-high)",
          borderColor: "var(--color-outline-variant)",
        }}
      >
        <div>
          <p className="text-on-surface text-sm font-semibold">Invite to Everion</p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
            Send someone an invite to join the platform
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={platformInviteEmail}
            onChange={(e) => setPlatformInviteEmail(e.target.value)}
            placeholder="their@email.com"
            type="email"
            className="text-on-surface placeholder:text-on-surface-variant/40 flex-1 rounded-xl border bg-transparent px-3 py-2 text-xs outline-none"
            style={{ borderColor: "var(--color-outline-variant)" }}
            onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--color-outline-variant)")}
          />
          <button
            onClick={handlePlatformInvite}
            disabled={!platformInviteEmail.trim() || platformInviteStatus === "sending"}
            className="rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
          >
            {platformInviteStatus === "sending"
              ? "…"
              : platformInviteStatus === "sent"
                ? "✓ Invite sent"
                : platformInviteStatus === "error"
                  ? "✗ Failed"
                  : "Send invite"}
          </button>
        </div>
      </div>
    </>
  );
}
