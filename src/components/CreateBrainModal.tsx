import { useState, type JSX } from "react";
import { authFetch } from "../lib/authFetch";
import type { Brain } from "../types";

/**
 * CreateBrainModal — create a shared brain + optionally invite members by email.
 */

interface BrainTypeOption {
  value: string;
  label: string;
  emoji: string;
  desc: string;
}

const BRAIN_TYPES: BrainTypeOption[] = [
  { value: "family", label: "Family", emoji: "🏠", desc: "For household, kids, shared finances, emergencies" },
  { value: "business", label: "Business", emoji: "🏪", desc: "For staff, suppliers, SOPs, costs, licences" },
];

interface PendingInvite {
  email: string;
  role: string;
}

interface CreateBrainModalProps {
  onClose: () => void;
  onCreate: (brain: Brain, brainType: string) => Promise<void>;
}

export default function CreateBrainModal({ onClose, onCreate }: CreateBrainModalProps): JSX.Element {
  const [name, setName] = useState<string>("");
  const [brainType, setBrainType] = useState<string>("family");
  const [inviteEmail, setInviteEmail] = useState<string>("");
  const [inviteRole, setInviteRole] = useState<string>("member");
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  function addInvite(): void {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || pendingInvites.some(i => i.email === email)) return;
    setPendingInvites(prev => [...prev, { email, role: inviteRole }]);
    setInviteEmail("");
  }

  function removeInvite(email: string): void {
    setPendingInvites(prev => prev.filter(i => i.email !== email));
  }

  async function handleCreate(): Promise<void> {
    if (!name.trim()) { setError("Please enter a brain name"); return; }
    setLoading(true);
    setError(null);
    try {
      // Create the brain
      const res = await authFetch("/api/brains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), type: brainType }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to create brain"); }
      const brain = await res.json();

      // Send invites
      for (const invite of pendingInvites) {
        await authFetch("/api/brains?action=invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brain_id: brain.id, email: invite.email, role: invite.role }),
        }).catch(err => console.error('[CreateBrainModal:invite] Failed to send invite', err)); // Non-fatal
      }

      await onCreate(brain, brainType);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 2000,
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#1a1a2e",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 14,
          padding: 28,
          width: 420,
          maxWidth: "90vw",
          boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
        }}
      >
        <h3 style={{ margin: "0 0 18px", fontSize: 17, color: "#e8e8e8", fontWeight: 600 }}>
          Create shared brain
        </h3>

        {/* Brain type selector */}
        <label style={labelStyle}>Brain type</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {BRAIN_TYPES.map(bt => (
            <button
              key={bt.value}
              type="button"
              onClick={() => setBrainType(bt.value)}
              style={{
                flex: 1,
                padding: "10px 12px",
                background: brainType === bt.value ? "rgba(124,143,240,0.2)" : "rgba(255,255,255,0.04)",
                border: brainType === bt.value ? "1px solid rgba(124,143,240,0.5)" : "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 18, marginBottom: 3 }}>{bt.emoji}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: brainType === bt.value ? "#a5b4fc" : "#d4d4d8" }}>{bt.label}</div>
              <div style={{ fontSize: 10, color: "#666", lineHeight: 1.3, marginTop: 2 }}>{bt.desc}</div>
            </button>
          ))}
        </div>

        {/* Brain name */}
        <label style={labelStyle}>Brain name</label>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleCreate()}
          placeholder='e.g. "Stander Family" or "Smash Burger Bar"'
          style={inputStyle}
        />

        {/* Invite members */}
        <label style={{ ...labelStyle, marginTop: 16 }}>Invite members (optional)</label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addInvite()}
            placeholder="email@example.com"
            style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
          />
          <select
            value={inviteRole}
            onChange={e => setInviteRole(e.target.value)}
            style={{
              ...inputStyle,
              marginBottom: 0,
              width: 90,
              flexShrink: 0,
            }}
          >
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>
          <button onClick={addInvite} style={addBtnStyle}>Add</button>
        </div>

        {/* Pending invites list */}
        {pendingInvites.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {pendingInvites.map(inv => (
              <div key={inv.email} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "6px 10px", background: "rgba(255,255,255,0.05)",
                borderRadius: 7, fontSize: 13,
              }}>
                <span style={{ color: "#d4d4d8" }}>{inv.email}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#888", fontSize: 11 }}>{inv.role}</span>
                  <button
                    onClick={() => removeInvite(inv.email)}
                    style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 14 }}
                  >×</button>
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 11, color: "#666", marginTop: 10, lineHeight: 1.5 }}>
          <b style={{ color: "#888" }}>Member</b> — can view, add, and edit entries.<br />
          <b style={{ color: "#888" }}>Viewer</b> — read-only access.
        </div>

        {error && (
          <div style={{ marginTop: 12, color: "#f87171", fontSize: 13 }}>{error}</div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={cancelBtnStyle} disabled={loading}>
            Cancel
          </button>
          <button onClick={handleCreate} style={createBtnStyle} disabled={loading || !name.trim()}>
            {loading ? "Creating…" : "Create brain"}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#888",
  marginBottom: 6,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  color: "#e8e8e8",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  marginBottom: 4,
};

const addBtnStyle: React.CSSProperties = {
  padding: "9px 14px",
  background: "rgba(124,143,240,0.15)",
  border: "1px solid rgba(124,143,240,0.3)",
  borderRadius: 8,
  color: "#a5b4fc",
  fontSize: 13,
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "9px 18px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  color: "#aaa",
  fontSize: 14,
  cursor: "pointer",
};

const createBtnStyle: React.CSSProperties = {
  padding: "9px 20px",
  background: "rgba(124,143,240,0.25)",
  border: "1px solid rgba(124,143,240,0.4)",
  borderRadius: 8,
  color: "#c7d2fe",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
