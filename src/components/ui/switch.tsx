import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

// Pill toggle. Tuned dimensions:
//   default — 44 × 24 track, 20px thumb, 2px gutter (1.83:1 ratio)
//   sm      — 36 × 20 track, 16px thumb, 2px gutter (1.80:1 ratio)
// Previous numbers (32 × 18.4 with a 16px thumb that nearly filled the
// height) rendered as a chunky bean — barely longer than tall, with a
// near-circle thumb. The new ratios match the iOS-style switches used
// across the rest of the surface.
function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-colors outline-none",
        "focus-visible:ring-ring/40 focus-visible:ring-2 focus-visible:ring-offset-1",
        "data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        // Track size
        "data-[size=default]:h-6 data-[size=default]:w-11",
        "data-[size=sm]:h-5 data-[size=sm]:w-9",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "bg-background pointer-events-none block rounded-full shadow-sm ring-0 transition-transform",
          // Thumb size + slide distance (track − thumb − 2*gutter, gutter=2px)
          "group-data-[size=default]/switch:size-5 group-data-[size=default]/switch:translate-x-0.5",
          "group-data-[size=default]/switch:data-checked:translate-x-[22px]",
          "group-data-[size=sm]/switch:size-4 group-data-[size=sm]/switch:translate-x-0.5",
          "group-data-[size=sm]/switch:data-checked:translate-x-[18px]",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
