/**
 * Everion logomark — an almost-complete ring with a centered dot.
 *
 * Design rationale:
 *   The ring represents continuous, preserved memory — thoughts held in a loop.
 *   The small gap at the top is the capture aperture: the open moment where
 *   a new thought enters.
 *   The filled center dot is the captured thought itself — grounded, present, kept.
 *
 * Always renders in the primary amber accent so it reads as the brand color
 * regardless of light/dark mode.
 */

interface EverionLogoProps {
  size?: number;
  className?: string;
}

export function EverionLogo({ size = 24, className }: EverionLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0 }}
    >
      {/*
        Almost-complete ring — gap of ~20° at the top.
        Center (14,14), radius 10.5.

        Right edge of gap (at 280° clockwise from east):
          x = 14 + 10.5 * cos(280°) ≈ 15.82
          y = 14 + 10.5 * sin(280°) ≈  3.66

        Left edge of gap (at 260° clockwise from east):
          x = 14 + 10.5 * cos(260°) ≈ 12.18
          y = 14 + 10.5 * sin(260°) ≈  3.66

        Large arc (1), clockwise sweep (1) traces the 340° arc.
      */}
      <path
        d="M 15.82 3.66 A 10.5 10.5 0 1 1 12.18 3.66"
        stroke="var(--color-primary)"
        strokeWidth="2.25"
        strokeLinecap="round"
        fill="none"
      />

      {/* Captured thought — filled center dot */}
      <circle cx="14" cy="14" r="2.75" fill="var(--color-primary)" />
    </svg>
  );
}
