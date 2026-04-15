import { createContext, useContext } from "react";
import type { Brain } from "../types";

export interface BrainContextValue {
  activeBrain: Brain | null;
  brains: Brain[];
  setActiveBrain: (brain: Brain | null) => void;
  refresh: () => Promise<void>;
  canInvite: boolean;
  canManageMembers: boolean;
  deleteBrain: (brainId: string) => Promise<void>;
}

export const BrainContext = createContext<BrainContextValue | null>(null);

export function useBrain(): BrainContextValue {
  const ctx = useContext(BrainContext);
  if (!ctx) throw new Error("useBrain must be called inside <BrainContext.Provider>");
  return ctx;
}
