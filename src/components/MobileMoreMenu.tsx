import { memo } from "react";

interface MobileMoreMenuProps {
  isOpen: boolean;
  onNavigate: (id: string) => void;
}

const MORE_ITEMS = [
  { id: "refine", label: "Refine", icon: "✦" },
  { id: "vault", label: "Vault", icon: "🔐" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

function MobileMoreMenuInner({ isOpen, onNavigate }: MobileMoreMenuProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-40 lg:hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) onNavigate("close");
      }}
    >
      <div
        className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-3xl border overflow-hidden"
        style={{
          background: "var(--color-surface-container-low)",
          borderColor: "var(--color-outline-variant)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {MORE_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left border-b last:border-b-0 transition-colors hover:bg-primary-container/30"
            style={{
              borderColor: "var(--color-outline-variant)",
            }}
          >
            <span className="text-lg">{item.icon}</span>
            <span className="text-sm font-medium text-on-surface">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default memo(MobileMoreMenuInner);
