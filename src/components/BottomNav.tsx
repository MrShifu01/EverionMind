import { memo, useMemo } from "react";
import { NavIcon } from "./icons/NavIcons";
import { useKeyboardVisible } from "../hooks/useKeyboardVisible";
import { isFeatureEnabled, FEATURE_FLAGS, type FeatureFlagKey } from "../lib/featureFlags";

// 5-slot grid: capture FAB always anchors center. Side slots are flag-aware:
// when a feature is OFF in prod (e.g. Chat or Schedule) we drop the slot
// rather than render a tab that routes to an empty view (Everion.tsx redirects
// disabled views back to memory — without this filter, tapping the tab does
// nothing visible to the user).
// Sentinel id "_more" triggers the MobileMoreMenu sheet instead of navigating.
// Settings is reachable from inside that sheet, so giving it a dedicated tab
// here was duplication. More is also a better foothold for future destinations
// (Lists, Important, Vault) without the bottom bar overflowing.
const ALL_ITEMS = [
  { id: "memory", label: "Memory", icon: NavIcon.grid, flag: undefined },
  { id: "chat", label: "Chat", icon: NavIcon.chat, flag: "chat" as FeatureFlagKey },
  { id: "_capture_fab", label: "Add", isFAB: true, icon: NavIcon.add, flag: undefined },
  { id: "_more", label: "More", icon: NavIcon.more, flag: undefined },
];

interface BottomNavProps {
  activeView: string;
  onNavigate: (id: string) => void;
  onCapture: () => void;
  onOpenMore: () => void;
  adminFlags?: Record<string, boolean>;
}

function BottomNavInner({
  activeView,
  onNavigate,
  onCapture,
  onOpenMore,
  adminFlags,
}: BottomNavProps) {
  const keyboardVisible = useKeyboardVisible();
  const navItems = useMemo(() => {
    const flags = adminFlags ?? {};
    return ALL_ITEMS.filter((item) => {
      if (!item.flag) return true;
      if (!(item.flag in FEATURE_FLAGS)) return true;
      return isFeatureEnabled(item.flag, flags);
    });
  }, [adminFlags]);
  if (keyboardVisible) return null;
  return (
    <nav
      aria-label="Primary navigation"
      className="bottom-nav-mobile"
      style={{
        // In-flow flex child of the app shell (not position:fixed).
        // App shell is body-height = 100lvh = full settled viewport, with
        // <main id="main-content"> as the inner scroll container. Nav is
        // the last flex child, pinned to the bottom by flex layout — no
        // dependency on window.innerHeight or layout-viewport timing.
        // padding-bottom: env(safe-area-inset-bottom) plus matching height
        // makes the nav background fill the home-indicator / gesture-bar
        // zone naturally; iOS PWA renders body content through the safe
        // area via viewport-fit=cover.
        flexShrink: 0,
        zIndex: "var(--z-nav)",
        alignItems: "center",
        justifyContent: "space-around",
        background: "var(--surface-low)",
        borderTop: "1px solid var(--line-soft)",
        // --edge-bottom-pad = 0 in PWA standalone (flush at screen edge,
        // iOS home indicator overlays), env(safe-area-inset-bottom) in a
        // browser tab (clears the URL/address bar). Defined in index.css.
        paddingBottom: "var(--edge-bottom-pad, 0px)",
        height: "calc(56px + var(--edge-bottom-pad, 0px))",
        // DIAGNOSTIC: bright red bottom border (3px) so we can see exactly
        // where the nav's bottom edge lands relative to the screen edge.
        // Any space below the red line is the actual layout gap. Remove
        // once measured.
        borderBottom: "3px solid #ff3b30",
      }}
    >
      {navItems.map((item) => {
        const isActive = activeView === item.id;

        if (item.isFAB) {
          return (
            <button
              key={item.id}
              onClick={onCapture}
              aria-label="New entry"
              className="press"
              style={{
                width: 56,
                height: 56,
                minHeight: 56,
                marginTop: -28,
                flexShrink: 0,
                borderRadius: "50%",
                background: "var(--ember)",
                color: "var(--ember-ink)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "var(--lift-2)",
                border: "none",
                cursor: "pointer",
              }}
            >
              {item.icon}
            </button>
          );
        }

        return (
          <button
            key={item.id}
            onClick={() => (item.id === "_more" ? onOpenMore() : onNavigate(item.id))}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
            className="press"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "6px 12px",
              minHeight: 48,
              flex: 1,
              border: "none",
              cursor: "pointer",
              background: "transparent",
              color: isActive ? "var(--ember)" : "var(--ink-faint)",
              transition: "color 180ms",
            }}
          >
            <span style={{ display: "flex", alignItems: "center" }}>{item.icon}</span>
            <span
              className="f-sans"
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: isActive ? "var(--ember)" : "var(--ink-faint)",
              }}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export default memo(BottomNavInner);
