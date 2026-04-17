import type { Brain } from "../types";

export function useRole(_brain: Brain | null | undefined): { canWrite: boolean; canDelete: boolean } {
  return { canWrite: true, canDelete: true };
}
