// Icon constants and VoiceWaveform used by CaptureSheet and its sub-panels.
import { useState } from "react";

export const IconMic = ({ on = false }: { on?: boolean }) =>
  on ? (
    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  ) : (
    <svg
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );

export const IconAttach = (
  <svg
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M21 11.5 12 20.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" />
  </svg>
);

export const IconVault = (
  <svg
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <rect x="4" y="10" width="16" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);

export const IconSend = (
  <svg
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M4 12 20 4l-7 16-2-7-7-1z" />
  </svg>
);

export const IconX = (
  <svg
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconCamera = (
  <svg
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M4 8h3l1-2h8l1 2h3v12H4z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

export const IconArrowLeft = (
  <svg
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M15 6l-6 6 6 6M4 12h16" />
  </svg>
);

export function VoiceWaveform() {
  const [bars] = useState(() =>
    Array.from({ length: 32 }, () => ({
      height: 4 + Math.random() * 20,
      opacity: 0.3 + Math.random() * 0.6,
      dur: 0.6 + Math.random() * 1.4,
      delay: Math.random() * 2,
    })),
  );
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        marginTop: 12,
        height: 28,
      }}
      aria-hidden="true"
    >
      {bars.map((b, i) => (
        <span
          key={i}
          style={{
            width: 2,
            height: b.height,
            background: "var(--ember)",
            opacity: b.opacity,
            borderRadius: 2,
            animation: `design-breathe ${b.dur}s ease-in-out infinite`,
            animationDelay: `-${b.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
