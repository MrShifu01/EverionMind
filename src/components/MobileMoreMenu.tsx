import { memo } from "react";
import { cn } from "../lib/cn";
import { NavIcon } from "./icons/NavIcons";

interface MobileMoreMenuProps {
  isOpen: boolean;
  onNavigate: (id: string) => void;
}

const SIDEBAR_ITEMS = [
  { id: "grid", label: "Memory Grid", icon: NavIcon.grid },
  { id: "todos", label: "Todos", icon: NavIcon.todos },
  { id: "refine", label: "Improve Brain", icon: NavIcon.refine },
  { id: "vault", label: "Vault", icon: NavIcon.vault },
  { id: "settings", label: "Settings", icon: NavIcon.settings },
];

function MobileMoreMenuInner({ isOpen, onNavigate }: MobileMoreMenuProps) {
  return (
    <div className={cn("fixed inset-0 z-40 lg:hidden", !isOpen && "pointer-events-none")}>
      {/* Backdrop */}
      <div
        data-testid="sidebar-backdrop"
        className={cn(
          "absolute inset-0 bg-black/40 transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0",
        )}
        onClick={() => onNavigate("close")}
      />

      {/* Sliding sidebar panel */}
      <aside
        className={cn(
          "absolute top-0 right-0 flex h-full w-72 transform flex-col transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full",
        )}
        style={{
          background: "var(--color-surface)",
          borderLeft: "1px solid var(--color-outline-variant)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-5 py-5"
          style={{ borderColor: "var(--color-outline-variant)" }}
        >
          <span className="text-base font-semibold" style={{ color: "var(--color-on-surface)" }}>
            Menu
          </span>
          <button
            onClick={() => onNavigate("close")}
            aria-label="Close menu"
            className="press-scale flex h-9 w-9 items-center justify-center rounded-xl transition-colors"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            <svg
              aria-hidden="true"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="More navigation">
          {SIDEBAR_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="press-scale flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-150"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              {item.icon}
              <span className="text-sm font-medium" style={{ color: "var(--color-on-surface)" }}>
                {item.label}
              </span>
            </button>
          ))}
        </nav>
      </aside>
    </div>
  );
}

export default memo(MobileMoreMenuInner);
