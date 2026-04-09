import { useState, useRef, useEffect, type JSX, type ReactNode } from "react";
import CreateBrainModal from "./CreateBrainModal";
import { BrainTypeIcon } from "./icons/BrainTypeIcon";
import type { Brain } from "../types";
import { cn } from "../lib/cn";

interface BrainSwitcherProps {
  brains: Brain[];
  activeBrain: Brain | null;
  onSwitch: (brain: Brain) => void;
  onBrainCreated: (brain: Brain) => Promise<void>;
  onBrainTip?: (brain: Brain) => void;
}

export default function BrainSwitcher({
  brains,
  activeBrain,
  onSwitch,
  onBrainCreated,
  onBrainTip,
}: BrainSwitcherProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const personalBrains = brains.filter((b) => b.type === "personal");
  const sharedBrains = brains.filter((b) => b.type !== "personal");

  function select(brain: Brain) {
    onSwitch(brain);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Switch brain"
        className="press-scale flex w-full items-center gap-2.5 rounded-xl px-3 py-2 transition-all"
        style={{
          background: "var(--color-surface-container)",
          border: "1px solid var(--color-outline-variant)",
        }}
      >
        <div
          className="text-on-surface-variant flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ background: "var(--color-surface-container-high)" }}
        >
          <BrainTypeIcon type={activeBrain?.type ?? "personal"} className="h-4 w-4" />
        </div>
        <span className="text-on-surface flex-1 truncate text-left text-sm font-semibold">
          {activeBrain?.name || "Select Brain"}
        </span>
        {activeBrain?.myRole === "viewer" && (
          <span className="text-on-surface-variant/60 text-[9px] font-semibold tracking-widest uppercase">
            view
          </span>
        )}
        <svg
          className={cn(
            "text-on-surface-variant h-3.5 w-3.5 flex-shrink-0 transition-transform",
            open && "rotate-180",
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute top-full left-0 z-50 mt-2 w-64 rounded-2xl border py-2"
          style={{
            background: "var(--color-surface)",
            borderColor: "var(--color-outline-variant)",
            boxShadow: "var(--shadow-lg)",
            animation: "zoom-in-95 0.15s ease-out",
          }}
        >
          {personalBrains.length > 0 && (
            <p className="text-on-surface-variant/50 px-4 py-1.5 text-[10px] font-semibold tracking-[0.2em] uppercase">
              Personal
            </p>
          )}
          {personalBrains.map((b) => (
            <BrainItem
              key={b.id}
              brain={b}
              active={activeBrain?.id === b.id}
              onSelect={select}
              icon={<BrainTypeIcon type={b.type ?? "personal"} className="h-4 w-4" />}
            />
          ))}

          {sharedBrains.length > 0 && (
            <p className="text-on-surface-variant/50 mt-1 px-4 py-1.5 text-[10px] font-semibold tracking-[0.2em] uppercase">
              Shared
            </p>
          )}
          {sharedBrains.map((b) => (
            <BrainItem
              key={b.id}
              brain={b}
              active={activeBrain?.id === b.id}
              onSelect={select}
              icon={<BrainTypeIcon type={b.type ?? "personal"} className="h-4 w-4" />}
              role={b.myRole}
            />
          ))}

          <div
            className="mx-3 my-2 border-t"
            style={{ borderColor: "var(--color-outline-variant)" }}
          />

          <button
            onClick={() => {
              setOpen(false);
              setShowCreate(true);
            }}
            className="text-primary hover:bg-surface-container flex w-full items-center gap-3 px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create New Brain
          </button>
        </div>
      )}

      {showCreate && (
        <CreateBrainModal
          onClose={() => setShowCreate(false)}
          onCreate={async (brain) => {
            await onBrainCreated(brain);
            onBrainTip?.(brain);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

interface BrainItemProps {
  brain: Brain;
  active: boolean;
  onSelect: (brain: Brain) => void;
  icon: ReactNode;
  role?: string;
}

function BrainItem({ brain, active, onSelect, icon, role }: BrainItemProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onSelect(brain)}
      className="hover:bg-surface-container flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors"
    >
      <span className="text-on-surface-variant flex-shrink-0">{icon}</span>
      <span className="text-on-surface flex-1 truncate text-sm font-medium">{brain.name}</span>
      {role && role !== "owner" && (
        <span className="text-on-surface-variant/60 text-[9px] font-semibold tracking-widest uppercase">
          {role}
        </span>
      )}
      {active && (
        <svg
          className="text-primary h-3.5 w-3.5 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      )}
    </button>
  );
}
