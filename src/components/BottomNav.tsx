import { memo } from "react";
import { cn } from "../lib/cn";

const NAV_ITEMS = [
  {
    id: "capture",
    label: "Home",
    icon: (
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
        />
      </svg>
    ),
  },
  {
    id: "refine",
    label: "Fix Issues",
    icon: (
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
        />
      </svg>
    ),
  },
  {
    id: "_capture_fab",
    label: "Capture",
    isFAB: true,
    icon: (
      <svg
        aria-hidden="true"
        className="h-6 w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
  },
  {
    id: "todos",
    label: "Todos",
    icon: (
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    id: "more",
    label: "More",
    icon: (
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
        />
      </svg>
    ),
  },
];

const MORE_IDS = new Set(["suggest", "vault", "settings", "grid", "chat", "timeline"]);

interface BottomNavProps {
  activeView: string;
  onNavigate: (id: string) => void;
  onCapture: () => void;
  refineBadge?: number;
}

function BottomNavInner({ activeView, onNavigate, onCapture, refineBadge }: BottomNavProps) {
  const isMoreActive = MORE_IDS.has(activeView);

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed bottom-5 left-1/2 z-50 flex w-[92vw] max-w-sm -translate-x-1/2 items-center justify-around rounded-full border px-3 py-2 lg:hidden"
      style={{
        background: "var(--color-surface-container-low)",
        borderColor: "var(--color-outline-variant)",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === "more" ? isMoreActive : activeView === item.id;

        if (item.isFAB) {
          return (
            <button
              key={item.id}
              onClick={onCapture}
              aria-label="New entry"
              className="press-scale flex h-14 w-14 flex-col items-center justify-center rounded-full transition-colors duration-150"
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
              "press-scale relative flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-xl transition-all duration-200",
              isActive ? "text-primary" : "text-on-surface-variant",
            )}
            style={isActive ? { background: "var(--color-primary-container)" } : undefined}
          >
            {item.icon}
            <span className="text-[10px] font-medium">{item.label}</span>
            {item.id === "refine" && refineBadge && refineBadge > 0 ? (
              <span
                className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
                style={{ background: "var(--color-error)", color: "var(--color-on-error)" }}
              >
                {refineBadge > 9 ? "9+" : refineBadge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export default memo(BottomNavInner);
