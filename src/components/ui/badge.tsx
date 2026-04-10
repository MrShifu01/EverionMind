import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center font-medium transition-colors",
  {
    variants: {
      variant: {
        // primary-container bg — note, person, default types
        default: "bg-primary-container text-primary",
        // secondary-container bg — document, supplier types
        secondary: "bg-secondary-container text-on-secondary-container",
        // error-tinted — secret, reminder, critical
        destructive: "bg-error/12 text-error",
        // subtle label with border
        outline: "border border-outline-variant text-on-surface-variant",
        // ghost muted — secondary info
        muted: "bg-surface-container text-on-surface-variant",
      },
      size: {
        sm: "rounded-md px-2 py-0.5 text-xs",
        pill: "rounded-full px-2 py-0.5 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  },
)

function Badge({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
