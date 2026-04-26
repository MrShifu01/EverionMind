import { useState, useEffect, useCallback } from "react";
import { authFetch } from "../lib/authFetch";
import type { Brain } from "../types";

export function useBrain(onBrainSwitch?: (brain: Brain | null) => void) {
  const [brains, setBrains] = useState<Brain[]>([]);
  const [activeBrain, setActiveBrainState] = useState<Brain | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBrains = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/brains");
      if (!res.ok) throw new Error("Failed to load brains");
      const data: Brain[] = await res.json();
      setBrains(data);

      const initial = data[0] || null;

      setActiveBrainState((prev) => {
        if (prev && data.find((b) => b.id === prev.id)) return prev;
        return initial;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBrains();
  }, [fetchBrains]);

  const setActiveBrain = useCallback(
    (brain: Brain | null) => {
      setActiveBrainState(brain);
      if (brain?.id) localStorage.setItem("openbrain_active_brain_id", brain.id);
      if (onBrainSwitch) onBrainSwitch(brain);
    },
    [onBrainSwitch],
  );

  return {
    brains,
    activeBrain,
    setActiveBrain,
    loading,
    error,
    refresh: fetchBrains,
  };
}
