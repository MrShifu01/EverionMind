import type { ReactNode } from "react";
import { NavIcon } from "./components/icons/NavIcons";
import type { Entry } from "./types";

interface Props {
  entriesLoaded: boolean;
  entries: Entry[];
  activeBrainName: string | undefined;
  typeIcons: Record<string, ReactNode>;
  onNavigate: (id: string) => void;
  onSelectEntry: (e: Entry) => void;
}

function CaptureSkeleton() {
  return (
    <div className="space-y-6">
      {/* Welcome skeleton */}
      <div
        className="h-16 animate-pulse rounded-3xl"
        style={{ background: "var(--color-surface-container)" }}
      />
      {/* Grid skeleton */}
      <div>
        <div
          className="mb-3 h-3 w-24 animate-pulse rounded-full"
          style={{ background: "var(--color-surface-container)" }}
        />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl"
              style={{ background: "var(--color-surface-container)" }}
            />
          ))}
        </div>
      </div>
      {/* List skeleton */}
      <div>
        <div
          className="mb-3 h-3 w-28 animate-pulse rounded-full"
          style={{ background: "var(--color-surface-container)" }}
        />
        <div
          className="overflow-hidden rounded-2xl border"
          style={{ borderColor: "var(--color-outline-variant)" }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3"
              style={{
                borderTop: i > 0 ? "1px solid var(--color-outline-variant)" : undefined,
              }}
            >
              <div
                className="h-5 w-5 animate-pulse rounded-full"
                style={{ background: "var(--color-surface-container)" }}
              />
              <div
                className="h-3 flex-1 animate-pulse rounded-full"
                style={{ background: "var(--color-surface-container)" }}
              />
              <div
                className="h-3 w-12 animate-pulse rounded-full"
                style={{ background: "var(--color-surface-container)" }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CaptureWelcomeScreen({
  entriesLoaded,
  entries,
  activeBrainName,
  typeIcons,
  onNavigate,
  onSelectEntry,
}: Props) {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-4 pb-32 sm:px-6 lg:pb-8">
      {!entriesLoaded ? <CaptureSkeleton /> : <CaptureContent />}
    </div>
  );

  function CaptureContent() {
    const recentEntries = [...entries]
      .sort(
        (a, b) =>
          new Date(b.updated_at ?? b.created_at ?? 0).getTime() -
          new Date(a.updated_at ?? a.created_at ?? 0).getTime(),
      )
      .slice(0, 5);
    const quickActions: { id: string; label: string; icon: ReactNode }[] = [
      { id: "todos", label: "Schedule", icon: NavIcon.todos },
      { id: "memory", label: "Memory Grid", icon: NavIcon.grid },
    ];
    return (
      <div className="space-y-8">
        {/* Welcome */}
        <div>
          <h2
            className="f-serif"
            style={{
              fontSize: 32,
              fontWeight: 400,
              letterSpacing: "-0.015em",
              color: "var(--ink)",
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            welcome back.
          </h2>
          <p
            className="f-serif"
            style={{
              fontSize: 15,
              fontStyle: "italic",
              color: "var(--ink-faint)",
              margin: "6px 0 0",
            }}
          >
            {activeBrainName ?? "your brain"} · {entries.length}{" "}
            {entries.length === 1 ? "entry" : "entries"}
          </p>
        </div>

        {/* Quick actions */}
        <div>
          <div className="micro" style={{ marginBottom: 12 }}>
            Quick nav
          </div>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((v) => (
              <button
                key={v.id}
                onClick={() => onNavigate(v.id)}
                className="press design-card"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: 16,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span style={{ color: "var(--ink-faint)" }}>{v.icon}</span>
                <span
                  className="f-serif"
                  style={{ fontSize: 16, fontWeight: 450, color: "var(--ink)" }}
                >
                  {v.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        {recentEntries.length > 0 && (
          <div>
            <div className="micro" style={{ marginBottom: 12 }}>
              Recent
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {recentEntries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => onSelectEntry(entry)}
                  className="press design-card"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 14 }} aria-hidden="true">
                    {typeIcons[entry.type] ?? "📝"}
                  </span>
                  <span
                    className="f-serif flex-1 truncate"
                    style={{
                      fontSize: 15,
                      fontWeight: 450,
                      color: "var(--ink)",
                    }}
                  >
                    {entry.title}
                  </span>
                  <span
                    className="f-sans"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--ink-faint)",
                    }}
                  >
                    {entry.type}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
}
