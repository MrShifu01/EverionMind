import { useTheme } from "../ThemeContext";

interface NavItem {
  id: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "capture", label: "Capture", icon: "+" },
  { id: "grid", label: "Grid", icon: "\u25A6" },
  { id: "suggest", label: "Fill Brain", icon: "\u2726" },
  { id: "chat", label: "Ask", icon: "\u25C8" },
  { id: "more", label: "More", icon: "\u2261" },
];

interface BottomNavProps {
  activeView: string;
  onNavigate: (viewId: string) => void;
}

export default function BottomNav({ activeView, onNavigate }: BottomNavProps) {
  const { t, isDark } = useTheme();

  return (
    <nav
      aria-label="Main navigation"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        background: isDark
          ? "rgba(15, 15, 35, 0.92)"
          : "rgba(240, 240, 248, 0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: `1px solid ${t.border}`,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        zIndex: 900,
      }}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = activeView === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              minHeight: 56,
              padding: "8px 4px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: isActive ? t.accent : t.textMuted,
              transition: "color 0.15s ease",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <span
              style={{
                fontSize: 20,
                lineHeight: 1,
                fontWeight: isActive ? 700 : 400,
              }}
            >
              {item.icon}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: isActive ? 700 : 500,
                letterSpacing: 0.3,
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
