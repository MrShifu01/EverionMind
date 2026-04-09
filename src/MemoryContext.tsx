/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { authFetch } from "./lib/authFetch";

interface MemoryContextValue {
  memoryGuide: string;
  setMemoryGuide: (guide: string) => void;
  refreshMemory: () => Promise<void>;
}

const MemoryContext = createContext<MemoryContextValue>({
  memoryGuide: "",
  setMemoryGuide: () => {},
  refreshMemory: async () => {},
});

export function MemoryProvider({ children }: { children: ReactNode }) {
  const [memoryGuide, setMemoryGuide] = useState("");

  const refreshMemory = useCallback(async () => {
    try {
      const res = await authFetch("/api/memory");
      if (res.ok) {
        const data = await res.json();
        setMemoryGuide(data.content || "");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshMemory(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [refreshMemory]);

  return (
    <MemoryContext.Provider value={{ memoryGuide, setMemoryGuide, refreshMemory }}>
      {children}
    </MemoryContext.Provider>
  );
}

export function useMemory(): MemoryContextValue {
  return useContext(MemoryContext);
}
