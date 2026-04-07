import { useState, useEffect, type JSX } from "react";
import { authFetch } from "../lib/authFetch";
import type { Brain } from "../types";
import { cn } from "../lib/cn";

const BRAIN_TYPES = [
  { value: "family",   label: "Family",   emoji: "🏠", desc: "Household, kids, shared finances, emergencies" },
  { value: "business", label: "Business", emoji: "🏪", desc: "Staff, suppliers, SOPs, costs, licences" },
];

interface PendingInvite { email: string; role: string; }

interface CreateBrainModalProps {
  onClose: () => void;
  onCreate: (brain: Brain, brainType: string) => Promise<void>;
}

export default function CreateBrainModal({ onClose, onCreate }: CreateBrainModalProps): JSX.Element {
  const [name, setName] = useState("");
  const [brainType, setBrainType] = useState("family");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  function addInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || pendingInvites.some((i) => i.email === email)) return;
    setPendingInvites((prev) => [...prev, { email, role: inviteRole }]);
    setInviteEmail("");
  }

  async function handleCreate() {
    if (!name.trim()) { setError("Please enter a brain name"); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/brains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), type: brainType }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to create brain"); }
      const brain = await res.json();
      for (const invite of pendingInvites) {
        await authFetch("/api/brains?action=invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brain_id: brain.id, email: invite.email, role: invite.role }),
        }).catch(() => {});
      }
      await onCreate(brain, brainType);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-brain-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Scrim */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative w-full max-w-md rounded-3xl p-7 border"
        style={{
          background: "rgba(26,25,25,0.95)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderColor: "rgba(72,72,71,0.12)",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5), 0 0 20px rgba(114,239,245,0.05)",
          animation: "zoom-in-95 0.2s ease-out",
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all press-scale"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h3
          id="create-brain-title"
          className="text-xl font-bold text-on-surface mb-6"
          style={{ fontFamily: "'Manrope', sans-serif" }}
        >
          Create shared brain
        </h3>

        {/* Brain type */}
        <div className="mb-5">
          <label className="block text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-semibold mb-2">
            Brain type
          </label>
          <div className="grid grid-cols-2 gap-2">
            {BRAIN_TYPES.map((bt) => (
              <button
                key={bt.value}
                type="button"
                onClick={() => setBrainType(bt.value)}
                className={cn(
                  "flex flex-col items-start gap-1.5 p-4 rounded-2xl border transition-all press-scale text-left",
                  brainType === bt.value
                    ? "border-primary/40 bg-primary/5"
                    : "border-outline-variant/20 hover:border-primary/20 hover:bg-surface-container"
                )}
              >
                <span className="text-2xl">{bt.emoji}</span>
                <span className="text-sm font-semibold text-on-surface" style={{ fontFamily: "'Manrope', sans-serif" }}>
                  {bt.label}
                </span>
                <span className="text-[11px] text-on-surface-variant leading-tight">{bt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Brain name */}
        <div className="mb-5">
          <label className="block text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-semibold mb-2">
            Brain name
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder={brainType === "business" ? "e.g. Smash Burger Bar" : "e.g. Stander Family"}
            className="w-full px-4 py-3 rounded-xl text-on-surface placeholder:text-on-surface-variant/40 text-sm min-h-[44px] transition-all focus:outline-none"
            style={{
              background: "#262626",
              border: "1px solid rgba(72,72,71,0.20)",
              fontFamily: "'Inter', sans-serif",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(114,239,245,0.6)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(114,239,245,0.08)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(72,72,71,0.20)"; e.currentTarget.style.boxShadow = "none"; }}
          />
        </div>

        {/* Invite members */}
        <div className="mb-5">
          <label className="block text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-semibold mb-2">
            Invite members <span className="normal-case text-on-surface-variant/50">(optional)</span>
          </label>
          <div className="flex gap-2">
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addInvite()}
              placeholder="email@example.com"
              className="flex-1 px-4 py-2.5 rounded-xl text-on-surface placeholder:text-on-surface-variant/40 text-sm min-h-[44px] focus:outline-none transition-all"
              style={{
                background: "#262626",
                border: "1px solid rgba(72,72,71,0.20)",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(114,239,245,0.4)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(72,72,71,0.20)"; }}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="px-3 rounded-xl text-sm focus:outline-none cursor-pointer"
              style={{ background: "#262626", border: "1px solid rgba(72,72,71,0.20)", color: "#adaaaa" }}
            >
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              onClick={addInvite}
              className="px-3 py-2.5 rounded-xl text-sm font-semibold press-scale transition-all text-on-primary-container"
              style={{ background: "linear-gradient(135deg, #72eff5, #1fb1b7)" }}
            >
              Add
            </button>
          </div>

          {pendingInvites.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {pendingInvites.map((inv) => (
                <div key={inv.email} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "#262626" }}>
                  <span className="flex-1 text-xs text-on-surface">{inv.email}</span>
                  <span className="text-[10px] uppercase tracking-widest text-on-surface-variant/60">{inv.role}</span>
                  <button
                    onClick={() => setPendingInvites((p) => p.filter((i) => i.email !== inv.email))}
                    className="text-on-surface-variant hover:text-error transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="mt-2 text-[11px] text-on-surface-variant/50">
            <span className="text-on-surface-variant/70 font-medium">Member</span> — view, add, edit. &nbsp;
            <span className="text-on-surface-variant/70 font-medium">Viewer</span> — read-only.
          </p>
        </div>

        {error && (
          <p className="mb-4 text-xs text-error flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface transition-all press-scale disabled:opacity-40"
            style={{ border: "1px solid rgba(72,72,71,0.20)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            className="flex-2 flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold press-scale disabled:opacity-40 disabled:cursor-not-allowed text-on-primary-container"
            style={{
              background: loading || !name.trim() ? "#262626" : "linear-gradient(135deg, #72eff5, #1fb1b7)",
              color: loading || !name.trim() ? "#777575" : "#002829",
              fontFamily: "'Manrope', sans-serif",
              boxShadow: !loading && name.trim() ? "0 4px 24px rgba(114,239,245,0.20)" : "none",
            }}
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Creating…
              </>
            ) : "Create Brain"}
          </button>
        </div>
      </div>
    </div>
  );
}
