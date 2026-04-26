function SingleSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="rounded-3xl border p-6"
      style={{
        background: "var(--color-surface-container-lowest)",
        borderColor: "var(--color-outline-variant)",
      }}
    >
      {/* Header row */}
      <div className="mb-4 flex items-center gap-3">
        <div className="skeleton-shimmer h-9 w-9 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="skeleton-shimmer h-2.5 w-16 rounded-full" />
          <div className="skeleton-shimmer h-2 w-12 rounded-full" />
        </div>
      </div>
      {/* Title */}
      <div className="mb-4 space-y-2">
        <div className="skeleton-shimmer h-4 w-3/4 rounded-full" />
        <div className="skeleton-shimmer h-4 w-1/2 rounded-full" />
      </div>
      {/* Content lines */}
      <div className="mb-4 space-y-2">
        <div data-testid="skeleton-line" className="skeleton-shimmer h-3 w-full rounded-full" />
        <div data-testid="skeleton-line" className="skeleton-shimmer h-3 w-5/6 rounded-full" />
      </div>
      {/* Tags */}
      <div className="flex gap-2">
        <div data-testid="skeleton-line" className="skeleton-shimmer h-5 w-14 rounded-full" />
        <div data-testid="skeleton-line" className="skeleton-shimmer h-5 w-18 rounded-full" />
      </div>
    </div>
  );
}

interface SkeletonCardProps {
  count?: number;
}

export default function SkeletonCard({ count = 1 }: SkeletonCardProps) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <SingleSkeleton key={i} />
      ))}
    </>
  );
}
