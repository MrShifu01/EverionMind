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

      const stored = localStorage.getItem("openbrain_active_brain_id");
      const match = data.find((b) => b.id === stored);
      const personal = data.find((b) => b.type === "personal");
      const initial = match || personal || data[0] || null;

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

  const createBrain = useCallback(async (name: string, type: string = "family"): Promise<Brain> => {
    const res = await authFetch("/api/brains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to create brain");
    }
    const brain: Brain = await res.json();
    setBrains((prev) => [...prev, brain]);
    return brain;
  }, []);

  const deleteBrain = useCallback(
    async (brain_id: string) => {
      const res = await authFetch("/api/brains", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brain_id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete brain");
      }
      setBrains((prev) => prev.filter((b) => b.id !== brain_id));
      setActiveBrainState((prev) => {
        if (prev?.id === brain_id) {
          const personal = brains.find((b) => b.type === "personal");
          if (personal && onBrainSwitch) onBrainSwitch(personal);
          return personal || null;
        }
        return prev;
      });
    },
    [brains, onBrainSwitch],
  );

  return {
    brains,
    activeBrain,
    setActiveBrain,
    loading,
    error,
    refresh: fetchBrains,
    createBrain,
    deleteBrain,
  };
}
