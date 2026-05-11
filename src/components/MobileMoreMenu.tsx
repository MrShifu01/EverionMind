import { memo, useMemo } from "react";
import { NavIcon } from "./icons/NavIcons";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "./ui/sheet";
import { useDesignTheme } from "../design/DesignThemeContext";
import { isFeatureEnabled, FEATURE_FLAGS, type FeatureFlagKey } from "../lib/featureFlags";

interface MobileMoreMenuProps {
  isOpen: boolean;
  onNavigate: (id: string) => void;
  adminFlags?: Record<string, boolean>;
}

// View IDs match Everion.tsx NAV_VIEWS. Flag column matches FEATURE_FLAGS keys
// so the menu only surfaces views that actually render. Without filtering,
// tapping a flag-disabled item triggers Everion.tsx's redirect-to-memory and
// looks like a broken nav button.
const HOME_ICON = (
  <svg
    aria-hidden="true"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
  >
    <path d="m3 11 9-8 9 8" />
    <path d="M5 10v10h14V10" />
  </svg>
);

const ALL_ITEMS: { id: string; label: string; icon: React.ReactNode; flag?: FeatureFlagKey }[] = [
  { id: "home", label: "Home", icon: HOME_ICON },
  { id: "memory", label: "Memory", icon: NavIcon.grid },
  { id: "chat", label: "Chat", icon: NavIcon.chat, flag: "chat" },
  { id: "vault", label: "Vault", icon: NavIcon.vault, flag: "vault" },
];

const SUN_ICON = (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
  </svg>
);
const MOON_ICON = (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
  >
    <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z" />
  </svg>
);

function NavRow({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className="press"
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "0 14px",
        minHeight: 44,
        height: 44,
        borderRadius: 8,
        fontFamily: "var(--f-sans)",
        fontSize: 14,
        fontWeight: 500,
        color: active ? "var(--ink)" : "var(--ink-soft)",
        background: active ? "var(--surface)" : "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {active && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: -4,
            top: 10,
            bottom: 10,
            width: 2,
            background: "var(--ember)",
            borderRadius: 2,
          }}
        />
      )}
      <span
        style={{
          display: "flex",
          alignItems: "center",
          color: active ? "var(--ink)" : "var(--ink-faint)",
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );
}

function MobileMoreMenuInner({ isOpen, onNavigate, adminFlags }: MobileMoreMenuProps) {
  const { mode, toggleMode } = useDesignTheme();
  const isDark = mode === "dark";
  const navItems = useMemo(() => {
    const flags = adminFlags ?? {};
    return ALL_ITEMS.filter((item) => {
      if (!item.flag) return true;
      if (!(item.flag in FEATURE_FLAGS)) return true;
      return isFeatureEnabled(item.flag, flags);
    });
  }, [adminFlags]);

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && onNavigate("close")}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-[280px] gap-0 border-l p-0 lg:hidden"
        style={{
          background: "var(--surface-low)",
          borderColor: "var(--line-soft)",
          paddingTop: "max(16px, env(safe-area-inset-top))",
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        }}
      >
        {/* Brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "4px 18px 16px",
          }}
        >
          <img
            src="/logoNew.webp"
            width={26}
            height={26}
            alt=""
            aria-hidden="true"
            decoding="async"
            style={{ flexShrink: 0, objectFit: "contain", display: "block" }}
          />
          <SheetTitle
            className="f-serif"
            style={{
              fontSize: 19,
              fontWeight: 450,
              letterSpacing: "-0.01em",
              color: "var(--ink)",
            }}
          >
            Everion
          </SheetTitle>
          <SheetDescription className="sr-only">
            Navigate between Memory, Chat, Schedule, Important, Vault, Settings, and theme.
          </SheetDescription>
        </div>

        <div
          aria-hidden="true"
          style={{ height: 1, background: "var(--line-soft)", margin: "0 14px 12px" }}
        />

        {/* Nav */}
        <nav
          className="f-sans"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            padding: "0 12px",
            flex: 1,
            overflowY: "auto",
          }}
          aria-label="More navigation"
        >
          {navItems.map((item) => (
            <NavRow
              key={item.id}
              label={item.label}
              icon={item.icon}
              onClick={() => onNavigate(item.id)}
            />
          ))}
        </nav>

        {/* Footer: settings + theme toggle */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            padding: "12px 12px 0",
            margin: "12px 14px 0",
            borderTop: "1px solid var(--line-soft)",
          }}
        >
          <NavRow label="Settings" icon={NavIcon.settings} onClick={() => onNavigate("settings")} />
          <NavRow
            label={isDark ? "Light mode" : "Dark mode"}
            icon={isDark ? SUN_ICON : MOON_ICON}
            onClick={toggleMode}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default memo(MobileMoreMenuInner);
