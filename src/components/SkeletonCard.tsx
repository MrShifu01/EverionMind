function SingleSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="rounded-3xl p-6 border"
      style={{
        background: "#1a1919",
        borderColor: "rgba(72,72,71,0.05)",
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-full skeleton-shimmer" />
        <div className="flex flex-col gap-1.5 flex-1">
          <div className="h-2.5 w-16 rounded-full skeleton-shimmer" />
          <div className="h-2 w-12 rounded-full skeleton-shimmer" />
        </div>
      </div>
      {/* Title */}
      <div className="space-y-2 mb-4">
        <div className="h-4 w-3/4 rounded-full skeleton-shimmer" />
        <div className="h-4 w-1/2 rounded-full skeleton-shimmer" />
      </div>
      {/* Content lines */}
      <div className="space-y-2 mb-4">
        <div className="h-3 w-full rounded-full skeleton-shimmer" />
        <div className="h-3 w-5/6 rounded-full skeleton-shimmer" />
      </div>
      {/* Tags */}
      <div className="flex gap-2">
        <div className="h-5 w-14 rounded-full skeleton-shimmer" />
        <div className="h-5 w-18 rounded-full skeleton-shimmer" />
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{ background: "#1a1919" }}
    >
      <div className="w-8 h-8 rounded-lg skeleton-shimmer flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-1/3 rounded-full skeleton-shimmer" />
        <div className="h-2.5 w-1/2 rounded-full skeleton-shimmer" />
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
