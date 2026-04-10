import { cn } from "@/lib/utils"

/**
 * Active filter pill — shows an applied filter with a × clear button.
 * Lives in the filter bar to give users a quick-remove affordance.
 */
interface ActivePillProps {
  label: string
  onClear: () => void
  className?: string
}

function ActivePill({ label, onClear, className }: ActivePillProps) {
  return (
    <span
      className={cn(
        "inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
        "border-primary/20 bg-primary-container text-primary",
        className,
      )}
    >
      {label}
      <button
        type="button"
        onClick={onClear}
        className="press-scale ml-0.5 leading-none opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none"
        aria-label={`Remove ${label} filter`}
      >
        ×
      </button>
    </span>
  )
}

export { ActivePill }
