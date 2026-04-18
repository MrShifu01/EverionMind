import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { Entry } from "../types";

interface EntriesContextValue {
  entries: Entry[];
  entriesLoaded: boolean;
  selected: Entry | null;
  setSelected: Dispatch<SetStateAction<Entry | null>>;
  handleDelete: (id: string) => void;
  handleUpdate: (id: string, changes: Partial<Entry>, options?: { silent?: boolean }) => Promise<void>;
  refreshEntries: () => Promise<void>;
}

export const EntriesContext = createContext<EntriesContextValue | null>(null);

export function useEntries(): EntriesContextValue {
  const ctx = useContext(EntriesContext);
  if (!ctx) throw new Error("useEntries must be called inside <EntriesContext.Provider>");
  return ctx;
}
