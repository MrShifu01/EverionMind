import type { JSX } from "react";

export default function LoadingScreen(): JSX.Element {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ background: "var(--color-background)" }}
    >
      <div className="flex flex-col items-center gap-6">
        {/* Logo — flat, no glow */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{
            background: "var(--color-primary-container)",
            border: "1px solid var(--color-outline-variant)",
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2a5 5 0 0 1 5 5c0 1.5-.67 2.84-1.72 3.75A5 5 0 0 1 17 15a5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 1.72-3.75A5 5 0 0 1 7 7a5 5 0 0 1 5-5z" />
            <circle cx="12" cy="12" r="1.5" fill="var(--color-primary)" stroke="none" />
          </svg>
        </div>

        {/* Brand */}
        <div className="text-center">
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ fontFamily: "'Lora', Georgia, serif", color: "var(--color-on-surface)" }}
          >
            Everion
          </h1>
          <p
            className="text-[10px] uppercase tracking-[0.2em] mt-1"
            style={{ color: "var(--color-on-surface-variant)", fontFamily: "'DM Sans', system-ui, sans-serif" }}
          >
            Your second brain
          </p>
        </div>

        {/* Loading bar — transform-only animation, no layout thrash */}
        <div
          className="w-32 h-0.5 rounded-full overflow-hidden"
          style={{ background: "var(--color-outline-variant)" }}
        >
          <div
            className="h-full w-1/2 rounded-full"
            style={{
              background: "var(--color-primary)",
              animation: "loading-sweep 1.4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes loading-sweep {
          0%   { transform: translateX(-200%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}
