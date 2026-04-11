import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Toggle pill — used for filter chips, view toggles, selection buttons.
 * Active state uses the primary accent; inactive uses a muted surface with a hairline border.
 */
interface ChipProps extends React.ComponentProps<"button"> {
  active?: boolean;
}

function Chip({ active = false, className, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      data-active={active}
      className={cn(
        "press-scale inline-flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 select-none",
        "focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        active
          ? "bg-primary text-primary-foreground"
          : "border-outline-variant bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface border",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export { Chip };
