import { useTheme } from "../ThemeContext";

const SHIMMER_ANIMATION = "skeleton-shimmer 1.5s ease-in-out infinite";

function SingleSkeleton() {
  const { t, isDark } = useTheme();
  const baseColor = isDark ? "#2a2a4a" : "#e0dff0";
  const shimmerColor = isDark ? "#3a3a5a" : "#d0cfe0";

  return (
    <div
      role="status"
      aria-label="Loading"
      style={{
        background: t.surface,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        padding: "16px 20px",
        overflow: "hidden",
      }}
    >
      {/* Title line */}
      <div
        data-testid="skeleton-line"
        style={{
          height: 14,
          width: "60%",
          borderRadius: 6,
          background: `linear-gradient(90deg, ${baseColor} 25%, ${shimmerColor} 50%, ${baseColor} 75%)`,
          backgroundSize: "200% 100%",
          animation: SHIMMER_ANIMATION,
          marginBottom: 12,
        }}
      />
      {/* Content line 1 */}
      <div
        data-testid="skeleton-line"
        style={{
          height: 10,
          width: "90%",
          borderRadius: 4,
          background: `linear-gradient(90deg, ${baseColor} 25%, ${shimmerColor} 50%, ${baseColor} 75%)`,
          backgroundSize: "200% 100%",
          animation: SHIMMER_ANIMATION,
          marginBottom: 8,
        }}
      />
      {/* Content line 2 */}
      <div
        data-testid="skeleton-line"
        style={{
          height: 10,
          width: "75%",
          borderRadius: 4,
          background: `linear-gradient(90deg, ${baseColor} 25%, ${shimmerColor} 50%, ${baseColor} 75%)`,
          backgroundSize: "200% 100%",
          animation: SHIMMER_ANIMATION,
          marginBottom: 8,
        }}
      />
      {/* Tags line */}
      <div
        data-testid="skeleton-line"
        style={{
          height: 8,
          width: "40%",
          borderRadius: 4,
          background: `linear-gradient(90deg, ${baseColor} 25%, ${shimmerColor} 50%, ${baseColor} 75%)`,
          backgroundSize: "200% 100%",
          animation: SHIMMER_ANIMATION,
          marginTop: 12,
        }}
      />
      <style>{`
        @keyframes skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
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
