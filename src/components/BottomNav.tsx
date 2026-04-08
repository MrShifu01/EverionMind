import { memo } from "react";
import { cn } from "../lib/cn";

const NAV_ITEMS = [
  {
    id: "capture",
    label: "Home",
    icon: (
      <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    id: "grid",
    label: "Grid",
    icon: (
      <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    id: "_capture_fab",
    label: "New",
    isFAB: true,
    icon: (
      <svg aria-hidden="true" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
  },
  {
    id: "chat",
    label: "Ask",
    icon: (
      <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
  },
  {
    id: "more",
    label: "More",
    icon: (
      <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
      </svg>
    ),
  },
];

const MORE_IDS = new Set(["refine", "vault", "settings"]);

interface BottomNavProps {
  activeView: string;
  onNavigate: (id: string) => void;
  onCapture: () => void;
}

function BottomNavInner({ activeView, onNavigate, onCapture }: BottomNavProps) {
  const isMoreActive = MORE_IDS.has(activeView);

  return (
    <nav
      aria-label="Primary navigation"
      className="lg:hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center justify-around px-3 py-2 w-[92vw] max-w-sm rounded-full border"
      style={{
        background: "var(--color-surface-container-low)",
        borderColor: "var(--color-outline-variant)",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.id === "more"
            ? isMoreActive
            : activeView === item.id;

        if (item.isFAB) {
          return (
            <button
              key={item.id}
              onClick={onCapture}
              aria-label="New entry"
              className="flex flex-col items-center justify-center w-14 h-14 rounded-full press-scale transition-colors duration-150"
              style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
            >
              {item.icon}
            </button>
          );
        }

        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-200 gap-0.5 press-scale",
              isActive
                ? "text-primary"
                : "text-on-surface-variant"
            )}
            style={isActive ? { background: "var(--color-primary-container)" } : undefined}
          >
            {item.icon}
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default memo(BottomNavInner);
