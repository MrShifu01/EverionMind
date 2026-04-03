import { useState, useEffect, useCallback } from "react";
import { authFetch } from "../lib/authFetch";

/**
 * useBrain — manages the list of brains the user belongs to
 * and which one is currently active.
 *
 * Returns:
 *   brains        — all brains (owned + member of)
 *   activeBrain   — the currently selected brain object
 *   setActiveBrain — switch active brain (resets app state via callback)
 *   loading       — initial fetch in progress
 *   error         — fetch error message
 *   refresh       — manually re-fetch brains
 *   createBrain   — (name) => Promise<brain>
 *   deleteBrain   — (brain_id) => Promise
 */
export function useBrain(onBrainSwitch) {
  const [brains, setBrains] = useState([]);
  const [activeBrain, setActiveBrainState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchBrains = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/brains");
      if (!res.ok) throw new Error("Failed to load brains");
      const data = await res.json();
      setBrains(data);

      // Restore last-used brain from localStorage, or default to personal
      const stored = localStorage.getItem("openbrain_active_brain_id");
      const match = data.find(b => b.id === stored);
      const personal = data.find(b => b.type === "personal");
      const initial = match || personal || data[0] || null;

      setActiveBrainState(prev => {
        // Don't reset if already set to avoid unnecessary re-renders
        if (prev && data.find(b => b.id === prev.id)) return prev;
        return initial;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBrains(); }, [fetchBrains]);

  const setActiveBrain = useCallback((brain) => {
    setActiveBrainState(brain);
    if (brain?.id) localStorage.setItem("openbrain_active_brain_id", brain.id);
    if (onBrainSwitch) onBrainSwitch(brain);
  }, [onBrainSwitch]);

  const createBrain = useCallback(async (name) => {
    const res = await authFetch("/api/brains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to create brain");
    }
    const brain = await res.json();
    setBrains(prev => [...prev, brain]);
    return brain;
  }, []);

  const deleteBrain = useCallback(async (brain_id) => {
    const res = await authFetch("/api/brains", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brain_id }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to delete brain");
    }
    setBrains(prev => prev.filter(b => b.id !== brain_id));
    // If the deleted brain was active, switch to personal
    setActiveBrainState(prev => {
      if (prev?.id === brain_id) {
        const personal = brains.find(b => b.type === "personal");
        if (personal && onBrainSwitch) onBrainSwitch(personal);
        return personal || null;
      }
      return prev;
    });
  }, [brains, onBrainSwitch]);

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
