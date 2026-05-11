import { useEffect, useState } from "react";
import type { Brain } from "../../types";
import SettingsRow, { SettingsValue } from "./SettingsRow";
import { authFetch } from "../../lib/authFetch";
import {
  grantBrainVaultAccess,
  revokeBrainVaultAccess,
  listBrainGrants,
  VaultGrantError,
} from "../../lib/vaultGrant";
import { useBrain } from "../../context/BrainContext";
import { isFeatureEnabled } from "../../lib/featureFlags";
import { useAdminDevMode } from "../../hooks/useAdminDevMode";
import CreateBrainModal from "../CreateBrainModal";
import { Button } from "../ui/button";
import { useCachedQuery } from "../../lib/useCachedQuery";

interface Props {
  activeBrain: Brain;
  onRefreshBrains?: () => void;
}

export default function BrainTab({ activeBrain, onRefreshBrains }: Props) {
  const { brains, refresh } = useBrain();
  const { adminFlags } = useAdminDevMode();
  const showMulti = isFeatureEnabled("multiBrain", adminFlags);

  // Sharing UI is gated behind the brain being yours and not personal.
  // Personal brains stay private; only non-personal brains can be shared.
  const canShareActive =
    (activeBrain.my_role === "owner" || activeBrain.owner_id === undefined) &&
    !activeBrain.is_personal;

  return (
    <div>
      {showMulti && (
        <MultiBrainSection
          brains={brains}
          activeBrain={activeBrain}
          onChanged={async () => {
            await refresh();
            onRefreshBrains?.();
          }}
        />
      )}

      {canShareActive && <MembersSection brain={activeBrain} />}

      <SettingsRow label="Name" last>
        <SettingsValue>{activeBrain.name}</SettingsValue>
      </SettingsRow>
    </div>
  );
}

// ── Multi-brain management section (phase 1) ──────────────────────────────
// Shown above the existing single-brain settings when the multiBrain flag is on.
// Lists every brain owned by the user, supports create / rename / delete.

interface MultiBrainSectionProps {
  brains: Brain[];
  activeBrain: Brain;
  onChanged: () => Promise<void> | void;
}

function MultiBrainSection({ brains, activeBrain, onChanged }: MultiBrainSectionProps) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const personal = brains.find((b) => b.is_personal);
  const others = brains.filter((b) => !b.is_personal).sort((a, b) => a.name.localeCompare(b.name));
  const sorted = personal ? [personal, ...others] : others;

  function beginEdit(b: Brain) {
    setEditingId(b.id);
    setEditName(b.name);
    setEditDesc(b.description ?? "");
    setError(null);
  }

  async function saveEdit(b: Brain) {
    if (!editName.trim() || savingId) return;
    setSavingId(b.id);
    setError(null);
    try {
      const r = await authFetch("/api/brains", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: b.id,
          name: editName.trim(),
          description: editDesc.trim() || null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d?.error || `HTTP ${r.status}`);
      }
      setEditingId(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteBrain(b: Brain) {
    if (b.is_personal) return;
    setSavingId(b.id);
    setError(null);
    try {
      const r = await authFetch(`/api/brains?id=${encodeURIComponent(b.id)}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d?.error || `HTTP ${r.status}`);
      }
      setConfirmDelId(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div>
          <div className="f-serif" style={{ fontSize: 18, color: "var(--ink)" }}>
            Your brains
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}>
            Create separate brains for different parts of your life. Switch between them from the
            header.
          </div>
        </div>
        <Button type="button" onClick={() => setCreating(true)} size="sm">
          + New brain
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            fontSize: 12,
            color: "var(--blood)",
            background: "var(--blood-wash)",
            padding: "8px 12px",
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          border: "1px solid var(--line-soft)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {sorted.map((b, i) => {
          const isEditing = editingId === b.id;
          const isConfirmingDelete = confirmDelId === b.id;
          const isActive = b.id === activeBrain.id;
          return (
            <div
              key={b.id}
              style={{
                display: "flex",
                alignItems: isEditing ? "flex-start" : "center",
                gap: 12,
                padding: "12px 14px",
                borderBottom: i < sorted.length - 1 ? "1px solid var(--line-soft)" : 0,
                background: isActive ? "var(--ember-wash)" : "transparent",
              }}
            >
              {isEditing ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={60}
                    style={{
                      padding: "6px 8px",
                      background: "var(--surface)",
                      border: "1px solid var(--line-soft)",
                      borderRadius: 6,
                      color: "var(--ink)",
                      fontSize: 13,
                      fontFamily: "var(--f-sans)",
                    }}
                  />
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    maxLength={280}
                    rows={2}
                    placeholder="Description (optional)"
                    style={{
                      padding: "6px 8px",
                      background: "var(--surface)",
                      border: "1px solid var(--line-soft)",
                      borderRadius: 6,
                      color: "var(--ink)",
                      fontSize: 12,
                      fontFamily: "var(--f-sans)",
                      resize: "vertical",
                    }}
                  />
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <Button
                      type="button"
                      onClick={() => setEditingId(null)}
                      disabled={savingId === b.id}
                      variant="outline"
                      size="xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={() => saveEdit(b)}
                      disabled={!editName.trim() || savingId === b.id}
                      size="xs"
                    >
                      {savingId === b.id ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        color: "var(--ink)",
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {b.name}
                      {b.is_personal && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: "var(--ink-faint)" }}>
                          Personal
                        </span>
                      )}
                      {isActive && !b.is_personal && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: "var(--ember)" }}>
                          Active
                        </span>
                      )}
                    </div>
                    {b.description && (
                      <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}>
                        {b.description}
                      </div>
                    )}
                  </div>

                  <Button
                    type="button"
                    onClick={() => beginEdit(b)}
                    aria-label="Rename"
                    variant="outline"
                    size="xs"
                  >
                    Edit
                  </Button>

                  {!b.is_personal && (
                    <Button
                      type="button"
                      onClick={() => (isConfirmingDelete ? deleteBrain(b) : setConfirmDelId(b.id))}
                      onBlur={() => isConfirmingDelete && setConfirmDelId(null)}
                      disabled={savingId === b.id}
                      variant="outline"
                      size="xs"
                      style={{
                        background: isConfirmingDelete ? "var(--blood-wash)" : "transparent",
                        borderColor: isConfirmingDelete ? "var(--blood)" : "var(--line-soft)",
                        color: "var(--blood)",
                      }}
                    >
                      {savingId === b.id ? "Deleting…" : isConfirmingDelete ? "Confirm?" : "Delete"}
                    </Button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {creating && (
        <CreateBrainModal
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

// ── Sharing — invites, members, role changes ───────────────────────────────
// Owner-only management for a single brain. Lists current members + pending
// invites, lets the owner invite by email with a role, change roles, remove
// members, and revoke pending invites.

interface MembersResponse {
  members: Array<{
    user_id: string;
    role: "owner" | "member" | "viewer";
    email: string | null;
    joined_at?: string;
  }>;
  invites: Array<{
    id: string;
    email: string;
    role: "viewer" | "member";
    created_at: string;
    expires_at: string;
  }>;
  my_role: "owner" | "member" | "viewer";
}

function MembersSection({ brain }: { brain: Brain }) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"viewer" | "member">("member");
  const [sending, setSending] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  // Set of user_ids who hold a vault grant on this brain. Re-fetched on
  // brain switch and after every grant/revoke so the per-member status
  // ("Vault access" vs "Grant vault access") stays in sync.
  const [vaultGrantedIds, setVaultGrantedIds] = useState<Set<string>>(new Set());

  const membersKey = `brain-members:${brain.id}`;
  const {
    data,
    isLoading,
    refetch: refresh,
    error: membersError,
  } = useCachedQuery<MembersResponse>(membersKey, async () => {
    const r = await authFetch(`/api/brains?action=members&id=${encodeURIComponent(brain.id)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as MembersResponse;
  });
  const loading = isLoading && !data;

  // Surface fetch errors via the same msg banner the old refresh used.
  useEffect(() => {
    if (membersError) {
      setMsg({ text: membersError.message || "Failed to load members", ok: false });
    }
  }, [membersError]);

  const refreshVaultGrants = async () => {
    try {
      const grants = await listBrainGrants(brain.id);
      setVaultGrantedIds(new Set(grants.map((g) => g.user_id)));
    } catch {
      // Pre-migration the endpoint returns 502 — show no badges, don't
      // block the rest of the members UI.
      setVaultGrantedIds(new Set());
    }
  };

  useEffect(() => {
    void refreshVaultGrants();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshVaultGrants closes over fresh state every render; the brain-switch is the trigger we want.
  }, [brain.id]);

  async function grantVault(userId: string) {
    const key = `vault-grant-${userId}`;
    setBusyKey(key);
    setMsg(null);
    try {
      await grantBrainVaultAccess(brain.id, userId);
      await refreshVaultGrants();
      setMsg({ text: "Vault access granted.", ok: true });
    } catch (err) {
      setMsg({
        text: err instanceof VaultGrantError ? err.message : "Grant failed",
        ok: false,
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function revokeVault(userId: string) {
    const key = `vault-revoke-${userId}`;
    setBusyKey(key);
    setMsg(null);
    try {
      await revokeBrainVaultAccess(brain.id, userId);
      await refreshVaultGrants();
      setMsg({ text: "Vault access revoked.", ok: true });
    } catch (err) {
      setMsg({
        text: err instanceof VaultGrantError ? err.message : "Revoke failed",
        ok: false,
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || sending) return;
    setSending(true);
    setMsg(null);
    try {
      const r = await authFetch("/api/brains?action=invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brain_id: brain.id,
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });
      const d = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        invite?: { email_sent?: boolean; email_error?: string };
      };
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setInviteEmail("");
      setMsg({
        text: d.invite?.email_sent
          ? `Invite sent to ${inviteEmail.trim()}.`
          : `Invite created. Email not sent (${d.invite?.email_error ?? "no Resend"}). Copy the link from the pending list.`,
        ok: true,
      });
      await refresh();
    } catch (err) {
      setMsg({
        text: err instanceof Error ? err.message : "Invite failed",
        ok: false,
      });
    } finally {
      setSending(false);
    }
  }

  async function changeRole(userId: string, role: "viewer" | "member") {
    const key = `role-${userId}`;
    setBusyKey(key);
    try {
      const r = await authFetch("/api/brains?action=update-role", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brain_id: brain.id, user_id: userId, role }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await refresh();
    } catch (err) {
      setMsg({
        text: err instanceof Error ? err.message : "Role change failed",
        ok: false,
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function removeMember(userId: string) {
    const key = `remove-${userId}`;
    setBusyKey(key);
    try {
      const r = await authFetch(
        `/api/brains?action=remove-member&id=${encodeURIComponent(brain.id)}&user_id=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // Drop any vault grant they held on this brain. Idempotent —
      // PostgREST DELETE returns 200 even if no row matched.
      await revokeBrainVaultAccess(brain.id, userId).catch(() => {});
      await Promise.all([refresh(), refreshVaultGrants()]);
    } catch (err) {
      setMsg({
        text: err instanceof Error ? err.message : "Remove failed",
        ok: false,
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function revokeInvite(inviteId: string) {
    const key = `revoke-${inviteId}`;
    setBusyKey(key);
    try {
      const r = await authFetch(
        `/api/brains?action=revoke-invite&invite_id=${encodeURIComponent(inviteId)}`,
        { method: "DELETE" },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await refresh();
    } catch (err) {
      setMsg({
        text: err instanceof Error ? err.message : "Revoke failed",
        ok: false,
      });
    } finally {
      setBusyKey(null);
    }
  }

  const fieldStyle: React.CSSProperties = {
    padding: "6px 8px",
    background: "var(--surface)",
    border: "1px solid var(--line-soft)",
    borderRadius: 6,
    color: "var(--ink)",
    fontSize: 13,
    fontFamily: "var(--f-sans)",
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ marginBottom: 12 }}>
        <div className="f-serif" style={{ fontSize: 18, color: "var(--ink)" }}>
          People with access
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}>
          Invite collaborators by email. Members can read and write; viewers are read-only.
        </div>
      </div>

      <form
        onSubmit={sendInvite}
        style={{
          display: "flex",
          gap: 8,
          alignItems: "stretch",
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <input
          type="email"
          required
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          placeholder="email@example.com"
          style={{ ...fieldStyle, flex: 1, minWidth: 220 }}
        />
        <select
          value={inviteRole}
          onChange={(e) => setInviteRole(e.target.value as "viewer" | "member")}
          style={{ ...fieldStyle, appearance: "none", paddingRight: 24 }}
        >
          <option value="member">Member (read + write)</option>
          <option value="viewer">Viewer (read-only)</option>
        </select>
        <Button type="submit" disabled={sending || !inviteEmail.trim()} size="sm">
          {sending ? "Sending…" : "Invite"}
        </Button>
      </form>

      {msg && (
        <div
          role="status"
          style={{
            fontSize: 12,
            color: msg.ok ? "var(--moss)" : "var(--blood)",
            background: msg.ok ? "var(--moss-wash)" : "var(--blood-wash)",
            padding: "8px 12px",
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          {msg.text}
        </div>
      )}

      {loading && !data ? (
        <div style={{ fontSize: 12, color: "var(--ink-faint)" }}>Loading members…</div>
      ) : (
        <div
          style={{
            border: "1px solid var(--line-soft)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {(data?.members ?? []).map((m, i, arr) => {
            const isOwner = m.role === "owner";
            const isLast = i === arr.length - 1 && (data?.invites?.length ?? 0) === 0;
            return (
              <div
                key={m.user_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderBottom: isLast ? 0 : "1px solid var(--line-soft)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--ink)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.email ?? `user ${m.user_id.slice(0, 8)}…`}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 2 }}>
                    {isOwner ? "Owner" : m.role === "member" ? "Member" : "Viewer"}
                  </div>
                </div>
                {!isOwner && (
                  <>
                    <select
                      value={m.role}
                      disabled={busyKey === `role-${m.user_id}`}
                      onChange={(e) => changeRole(m.user_id, e.target.value as "viewer" | "member")}
                      style={{ ...fieldStyle, appearance: "none", paddingRight: 24 }}
                    >
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    {vaultGrantedIds.has(m.user_id) ? (
                      <Button
                        type="button"
                        onClick={() => revokeVault(m.user_id)}
                        disabled={busyKey === `vault-revoke-${m.user_id}`}
                        variant="outline"
                        size="xs"
                        title="Member can read this brain's vault. Click to revoke."
                      >
                        {busyKey === `vault-revoke-${m.user_id}` ? "…" : "🔓 Vault"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => grantVault(m.user_id)}
                        disabled={busyKey === `vault-grant-${m.user_id}`}
                        variant="outline"
                        size="xs"
                        title="Grant this member access to read & write this brain's vault."
                      >
                        {busyKey === `vault-grant-${m.user_id}` ? "…" : "Grant vault"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      onClick={() => removeMember(m.user_id)}
                      disabled={busyKey === `remove-${m.user_id}`}
                      variant="outline"
                      size="xs"
                      style={{ color: "var(--blood)" }}
                    >
                      Remove
                    </Button>
                  </>
                )}
              </div>
            );
          })}

          {(data?.invites ?? []).length > 0 && (
            <div
              style={{
                padding: "8px 14px",
                fontSize: 11,
                color: "var(--ink-faint)",
                background: "var(--surface-low)",
                borderTop: "1px solid var(--line-soft)",
                borderBottom: "1px solid var(--line-soft)",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Pending invites
            </div>
          )}

          {(data?.invites ?? []).map((inv, i, arr) => {
            const isLast = i === arr.length - 1;
            return (
              <div
                key={inv.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderBottom: isLast ? 0 : "1px solid var(--line-soft)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--ink)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {inv.email}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 2 }}>
                    {inv.role === "member" ? "Member" : "Viewer"} · expires{" "}
                    {new Date(inv.expires_at).toLocaleDateString()}
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => revokeInvite(inv.id)}
                  disabled={busyKey === `revoke-${inv.id}`}
                  variant="outline"
                  size="xs"
                  style={{ color: "var(--blood)" }}
                >
                  Revoke
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
