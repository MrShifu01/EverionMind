// Toast stack for the generic background-ops system. Mirrors
// BackgroundTaskToast visually but reads from useBackgroundOps so any
// startTask call surfaces here regardless of which tab launched it.

import { useBackgroundOps } from "../hooks/useBackgroundOps";

function Spinner() {
  return (
    <svg className="h-4 w-4 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  );
}

export function BackgroundOpsToast() {
  const { tasks, dismissTask, dismissAll } = useBackgroundOps();
  if (tasks.length === 0) return null;

  const finished = tasks.filter((t) => t.status === "done" || t.status === "error");

  return (
    <div
      // Sits above the file-capture toast (bottom-24) so the two stacks don't overlap.
      className="fixed bottom-44 left-1/2 z-[60] flex -translate-x-1/2 flex-col gap-2 lg:bottom-24"
      style={{ maxWidth: "calc(100vw - 2rem)", width: 340 }}
    >
      {tasks.map((task) => {
        const isActive = task.status === "running";
        const isDone = task.status === "done";
        const isError = task.status === "error";

        return (
          <div
            key={task.id}
            className="flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg"
            style={{
              background: "var(--color-surface-container-high)",
              borderColor: isError
                ? "var(--color-error)"
                : isDone
                  ? "var(--color-primary)"
                  : "var(--color-outline-variant)",
            }}
          >
            <span
              className="mt-0.5"
              style={{
                color: isError
                  ? "var(--color-error)"
                  : isDone
                    ? "var(--color-primary)"
                    : "var(--color-on-surface-variant)",
              }}
            >
              {isActive && <Spinner />}
              {isDone && <CheckIcon />}
              {isError && <ErrorIcon />}
            </span>

            <div className="min-w-0 flex-1">
              <p
                className="truncate text-sm font-medium"
                style={{ color: "var(--color-on-surface)" }}
              >
                {task.label}
              </p>
              <p
                className="text-xs break-words"
                style={{
                  color: isError ? "var(--color-error)" : "var(--color-on-surface-variant)",
                }}
              >
                {isError
                  ? task.error || "Failed"
                  : isDone
                    ? task.result || "Done"
                    : task.progress
                      ? renderProgress(task.progress)
                      : "Working…"}
              </p>
            </div>

            {!isActive && (
              <button
                onClick={() => dismissTask(task.id)}
                aria-label="Dismiss"
                className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        );
      })}

      {finished.length > 1 && (
        <button
          onClick={dismissAll}
          className="self-end text-xs underline underline-offset-2 transition-colors hover:opacity-80"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          Dismiss all
        </button>
      )}
    </div>
  );
}

function renderProgress(p: { current: number; total?: number; suffix?: string }): string {
  const head = p.total ? `${p.current} / ${p.total}` : `${p.current}`;
  return p.suffix ? `${head} · ${p.suffix}` : `${head}…`;
}
