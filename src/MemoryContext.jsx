import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authFetch } from "./lib/authFetch";

const MemoryContext = createContext({ memoryGuide: "", refreshMemory: () => {} });

export function MemoryProvider({ children }) {
  const [memoryGuide, setMemoryGuide] = useState("");

  const refreshMemory = useCallback(async () => {
    try {
      const res = await authFetch("/api/memory");
      if (res.ok) {
        const data = await res.json();
        setMemoryGuide(data.content || "");
      }
    } catch {}
  }, []);

  useEffect(() => { refreshMemory(); }, [refreshMemory]);

  return (
    <MemoryContext.Provider value={{ memoryGuide, setMemoryGuide, refreshMemory }}>
      {children}
    </MemoryContext.Provider>
  );
}

export function useMemory() { return useContext(MemoryContext); }
