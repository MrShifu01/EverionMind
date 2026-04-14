import { useState, useEffect, useRef, type JSX } from "react";
import { authFetch } from "../lib/authFetch";
import type { Brain } from "../types";
import { cn } from "../lib/cn";
import { BrainTypeIcon } from "./icons/BrainTypeIcon";
import { isMultiBrainEnabled } from "../lib/featureFlags";

const BRAIN_TYPES = [
  {
    value: "family",
    label: "Family",
    desc: "Household, kids, shared finances, emergencies",
  },
  {
    value: "business",
    label: "Business",
    desc: "Staff, suppliers, SOPs, costs, licences",
  },
];

interface PendingInvite {
  email: string;
  role: string;
}

interface CreateBrainModalProps {
  onClose: () => void;
  onCreate: (brain: Brain, brainType: string) => Promise<void>;
}

export default function CreateBrainModal({
  onClose,
  onCreate,
}: CreateBrainModalProps): JSX.Element | null {
  if (!isMultiBrainEnabled()) return null;
  const [name, setName] = useState("");
  const [brainType, setBrainType] = useState("family");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<Element | null>(null);

  // Store trigger element so focus returns on close
  useEffect(() => {
    triggerRef.current = document.activeElement;
    return () => {
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
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
    if (!name.trim()) {
      setError("Please enter a brain name");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/brains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), type: brainType }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to create brain");
      }
      const brain = await res.json();
      for (const invite of pendingInvites) {
        await authFetch("/api/brains?action=invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brain_id: brain.id, email: invite.email, role: invite.role }),
        }).catch((err) => console.error("[CreateBrain] pending invite failed", invite.email, err));
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
      <div
        className="absolute inset-0"
        style={{ background: "var(--color-scrim)" }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-md rounded-3xl border p-7"
        style={{
          background: "var(--color-surface)",
          borderColor: "var(--color-outline-variant)",
          boxShadow: "var(--shadow-lg)",
          animation: "zoom-in-95 0.2s ease-out",
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-on-surface-variant hover:text-on-surface hover:bg-surface-container press-scale absolute top-5 right-5 flex h-11 w-11 items-center justify-center rounded-lg transition-all"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h3
          id="create-brain-title"
          className="text-on-surface mb-6 text-xl font-bold"
          style={{ fontFamily: "'Lora', Georgia, serif" }}
        >
          Create shared brain
        </h3>

        {/* Brain type */}
        <div className="mb-5">
          <label className="text-on-surface-variant mb-2 block text-[10px] font-semibold tracking-[0.2em] uppercase">
            Brain type
          </label>
          <div className="grid grid-cols-2 gap-2">
            {BRAIN_TYPES.map((bt) => (
              <button
                key={bt.value}
                type="button"
                onClick={() => setBrainType(bt.value)}
                className={cn(
                  "press-scale flex flex-col items-start gap-1.5 rounded-2xl border p-4 text-left transition-all",
                  brainType === bt.value
                    ? "border-primary/40 bg-primary/5"
                    : "border-outline-variant/20 hover:border-primary/20 hover:bg-surface-container",
                )}
              >
                <span className="text-on-surface-variant">
                  <BrainTypeIcon type={bt.value} className="h-7 w-7" />
                </span>
                <span className="text-on-surface text-sm font-semibold">{bt.label}</span>
                <span className="text-on-surface-variant text-[11px] leading-tight">{bt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Brain name */}
        <div className="mb-5">
          <label className="text-on-surface-variant mb-2 block text-[10px] font-semibold tracking-[0.2em] uppercase">
            Brain name
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder={brainType === "business" ? "e.g. Smash Burger Bar" : "e.g. Stander Family"}
            className="text-on-surface placeholder:text-on-surface-variant/40 min-h-[44px] w-full rounded-xl px-4 py-3 text-sm transition-all focus:outline-none"
            style={{
              background: "var(--color-surface-container)",
              border: "1px solid var(--color-outline-variant)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--color-primary)";
              e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-primary-container)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--color-outline-variant)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
        </div>

        {/* Invite members */}
        <div className="mb-5">
          <label className="text-on-surface-variant mb-2 block text-[10px] font-semibold tracking-[0.2em] uppercase">
            Invite members{" "}
            <span className="text-on-surface-variant/50 normal-case">(optional)</span>
          </label>
          <div className="flex gap-2">
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addInvite()}
              placeholder="email@example.com"
              className="text-on-surface placeholder:text-on-surface-variant/40 min-h-[44px] flex-1 rounded-xl px-4 py-2.5 text-sm transition-all focus:outline-none"
              style={{
                background: "var(--color-surface-container)",
                border: "1px solid var(--color-outline-variant)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--color-primary)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--color-outline-variant)";
              }}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="cursor-pointer rounded-xl px-3 text-sm focus:outline-none"
              style={{
                background: "var(--color-surface-container)",
                border: "1px solid var(--color-outline-variant)",
                color: "var(--color-on-surface-variant)",
              }}
            >
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              onClick={addInvite}
              className="press-scale text-on-primary-container rounded-xl px-3 py-2.5 text-sm font-semibold transition-all"
              style={{ background: "var(--color-primary)" }}
            >
              Add
            </button>
          </div>

          {pendingInvites.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {pendingInvites.map((inv) => (
                <div
                  key={inv.email}
                  className="flex items-center gap-2 rounded-lg px-3 py-2"
                  style={{ background: "var(--color-surface-container)" }}
                >
                  <span className="text-on-surface flex-1 text-xs">{inv.email}</span>
                  <span className="text-on-surface-variant/60 text-[10px] tracking-widest uppercase">
                    {inv.role}
                  </span>
                  <button
                    onClick={() => setPendingInvites((p) => p.filter((i) => i.email !== inv.email))}
                    className="text-on-surface-variant hover:text-error transition-colors"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="text-on-surface-variant/50 mt-2 text-[11px]">
            <span className="text-on-surface-variant/70 font-medium">Member</span> — view, add,
            edit. &nbsp;
            <span className="text-on-surface-variant/70 font-medium">Viewer</span> — read-only.
          </p>
        </div>

        {error && (
          <p className="text-error mb-4 flex items-center gap-1.5 text-xs">
            <svg
              className="h-3.5 w-3.5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="text-on-surface-variant hover:text-on-surface press-scale flex-1 rounded-xl py-3 text-sm font-semibold transition-all disabled:opacity-40"
            style={{ border: "1px solid var(--color-outline-variant)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            className="press-scale text-on-primary-container flex flex-2 items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background:
                loading || !name.trim()
                  ? "var(--color-surface-container-highest)"
                  : "var(--color-primary)",
              color:
                loading || !name.trim()
                  ? "var(--color-on-surface-variant)"
                  : "var(--color-on-primary)",
            }}
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Creating…
              </>
            ) : (
              "Create Brain"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
