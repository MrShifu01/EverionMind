// ─────────────────────────────────────────────────────────────────────────────
// useBackgroundOps
//
// Generic background-task system for any long-running or one-shot operation
// triggered from the UI (persona scan, wipe, Gmail sync, bulk import, etc.).
// Lives alongside the existing useBackgroundCapture hook — that one stays
// dedicated to the file-capture flow.
//
// Why this exists:
//   - Local React useState dies on tab-switch and app-close.
//   - The user wants in-flight operations to survive both.
//   - Most server endpoints are already idempotent (re-call returns 0
//     remaining if done) so resume = "call the runner again."
//
// Design:
//   - Tasks are kind/label/status records, mirrored to localStorage.
//   - Runners are pure functions registered by `kind` in a separate
//     registry file. They're closures-free so they can be re-invoked
//     from a fresh app load using only the persisted resumeKey.
//   - On app mount: hydrate localStorage → for each running task,
//     look up the runner by kind and re-invoke it.
//   - One toast component reads from the context and displays a stack
//     of in-flight + recently-finished operations.
// ─────────────────────────────────────────────────────────────────────────────

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { TASK_RUNNERS, type TaskHelpers } from "../lib/backgroundTaskRegistry";

export type OpStatus = "running" | "done" | "error";

export interface OpTask {
  id: string;
  kind: string;          // looks up the runner in TASK_RUNNERS
  label: string;         // user-facing
  status: OpStatus;
  progress?: { current: number; total?: number; suffix?: string };
  result?: string;       // success message
  error?: string;
  startedAt: number;
  finishedAt?: number;
  resumeKey?: string;    // passed to the runner on resume
}

interface BackgroundOpsContext {
  tasks: OpTask[];
  startTask: (opts: {
    kind: string;
    label: string;
    resumeKey?: string;
  }) => string; // returns task id
  isRunning: (kind: string, resumeKey?: string) => boolean;
  dismissTask: (id: string) => void;
  dismissAll: () => void;
}

const Ctx = createContext<BackgroundOpsContext | null>(null);

const STORAGE_KEY = "everion.background_ops.v1";
const FINISHED_TTL_MS = 60_000; // dismiss done/error tasks after 60s

function loadFromStorage(): OpTask[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToStorage(tasks: OpTask[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch { /* storage full / disabled */ }
}

export function BackgroundOpsProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<OpTask[]>(() => loadFromStorage());
  // Use a ref to read latest tasks inside async runners without re-creating callbacks.
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  // Track which task ids are currently being executed so resume doesn't fire twice.
  const runningIds = useRef<Set<string>>(new Set());

  // Persist on every change.
  useEffect(() => {
    saveToStorage(tasks);
  }, [tasks]);

  const updateTask = useCallback((id: string, patch: Partial<OpTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const runTask = useCallback(async (task: OpTask): Promise<void> => {
    if (runningIds.current.has(task.id)) return; // already executing
    runningIds.current.add(task.id);

    const runner = TASK_RUNNERS[task.kind];
    if (!runner) {
      updateTask(task.id, {
        status: "error",
        error: `No runner registered for "${task.kind}"`,
        finishedAt: Date.now(),
      });
      runningIds.current.delete(task.id);
      return;
    }

    const helpers: TaskHelpers = {
      setProgress: (p) => updateTask(task.id, { progress: p }),
      setLabel: (l) => updateTask(task.id, { label: l }),
    };

    try {
      const result = await runner(task.resumeKey || "", helpers);
      updateTask(task.id, {
        status: "done",
        result: result || "Done.",
        finishedAt: Date.now(),
        progress: undefined,
      });
    } catch (err: any) {
      updateTask(task.id, {
        status: "error",
        error: err?.message || "Failed",
        finishedAt: Date.now(),
        progress: undefined,
      });
    } finally {
      runningIds.current.delete(task.id);
    }
  }, [updateTask]);

  // Hydrate-and-resume: on mount, kick off any tasks left in 'running' state.
  useEffect(() => {
    const stale = loadFromStorage().filter((t) => t.status === "running");
    if (!stale.length) return;
    // Defer to next tick so all consumers have time to mount before runners fire.
    const timer = setTimeout(() => {
      for (const t of stale) {
        runTask(t).catch(() => { /* runner records its own errors */ });
      }
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-dismiss old finished tasks (keeps the toast stack tidy).
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTasks((prev) =>
        prev.filter((t) => {
          if (t.status === "running") return true;
          if (!t.finishedAt) return true;
          return now - t.finishedAt < FINISHED_TTL_MS;
        }),
      );
    }, 5_000);
    return () => clearInterval(interval);
  }, []);

  const startTask = useCallback<BackgroundOpsContext["startTask"]>((opts) => {
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const task: OpTask = {
      id,
      kind: opts.kind,
      label: opts.label,
      status: "running",
      startedAt: Date.now(),
      resumeKey: opts.resumeKey,
    };
    setTasks((prev) => [...prev, task]);
    // Fire-and-forget — runner updates the task as it goes.
    runTask(task).catch(() => { /* runner records its own errors */ });
    return id;
  }, [runTask]);

  const isRunning = useCallback<BackgroundOpsContext["isRunning"]>((kind, resumeKey) => {
    return tasksRef.current.some(
      (t) => t.status === "running" && t.kind === kind && (!resumeKey || t.resumeKey === resumeKey),
    );
  }, []);

  const dismissTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    // Only dismiss finished — never silently drop a running task.
    setTasks((prev) => prev.filter((t) => t.status === "running"));
  }, []);

  const value = useMemo(
    () => ({ tasks, startTask, isRunning, dismissTask, dismissAll }),
    [tasks, startTask, isRunning, dismissTask, dismissAll],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBackgroundOps(): BackgroundOpsContext {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useBackgroundOps must be used inside BackgroundOpsProvider");
  }
  return ctx;
}
