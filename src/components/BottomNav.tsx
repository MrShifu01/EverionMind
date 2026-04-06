import { Home, Grid3X3, Sparkles, MessageSquare, MoreHorizontal } from "lucide-react";
import { useTheme } from "../ThemeContext";

interface NavItem {
  id: string;
  label: string;
  Icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: "capture", label: "Home", Icon: Home },
  { id: "grid", label: "Grid", Icon: Grid3X3 },
  { id: "suggest", label: "Fill", Icon: Sparkles },
  { id: "chat", label: "Ask", Icon: MessageSquare },
  { id: "more", label: "More", Icon: MoreHorizontal },
];

interface BottomNavProps {
  activeView: string;
  onNavigate: (viewId: string) => void;
}

export default function BottomNav({ activeView, onNavigate }: BottomNavProps) {
  const { isDark } = useTheme();

  return (
    <div
      className="md:hidden fixed right-0 bottom-0 left-0 z-[900] flex items-end justify-center pb-[env(safe-area-inset-bottom,0px)] px-4 pb-4"
    >
      <nav
        aria-label="Main navigation"
        className="flex w-full max-w-sm items-center justify-around rounded-2xl px-2 py-1.5"
        style={{
          background: isDark ? "rgba(26,25,25,0.75)" : "rgba(255,255,255,0.75)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: isDark ? "1px solid rgba(72,72,71,0.2)" : "1px solid rgba(0,0,0,0.08)",
          boxShadow: isDark
            ? "0px 20px 40px rgba(0,0,0,0.4), 0px 0px 20px rgba(139,92,246,0.08)"
            : "0px 8px 32px rgba(0,0,0,0.12)",
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
              className="touch-target flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-none bg-transparent px-1 py-2 transition-all duration-200 [-webkit-tap-highlight-color:transparent] active:scale-90"
              style={
                isActive
                  ? {
                      background: isDark ? "rgba(139,92,246,0.12)" : "rgba(124,58,237,0.08)",
                      color: isDark ? "#8b5cf6" : "#7c3aed",
                    }
                  : { color: isDark ? "#777575" : "#9ca3af" }
              }
            >
              <item.Icon
                size={20}
                strokeWidth={isActive ? 2.5 : 1.75}
                style={{ transition: "all 0.2s" }}
              />
              <span
                className="text-[10px] uppercase tracking-[0.15em]"
                style={{ fontWeight: isActive ? 700 : 500 }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
