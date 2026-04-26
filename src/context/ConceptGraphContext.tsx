import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { loadGraph, getGodNodes } from "../lib/conceptGraph";
import type { ConceptGraph } from "../lib/conceptGraph";
import type { Concept } from "../types";

interface ConceptGraphContextValue {
  conceptGraph: ConceptGraph | null;
  conceptMap: Record<string, string[]> | undefined;
  godNodes: Concept[];
  /** Escape hatch: call to force a re-derive from localStorage. Not wired up by default. */
  refreshGraph: () => void;
}

const ConceptGraphContext = createContext<ConceptGraphContextValue | null>(null);

export function ConceptGraphProvider({
  children,
  activeBrainId,
}: {
  children: ReactNode;
  activeBrainId?: string;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail?.brainId === activeBrainId) setTick((t) => t + 1);
    };
    window.addEventListener("concept-graph-updated", handler);
    return () => window.removeEventListener("concept-graph-updated", handler);
  }, [activeBrainId]);

  const conceptGraph = useMemo(() => {
    if (!activeBrainId) return null;
    const g = loadGraph(activeBrainId);
    return g.concepts.length > 0 ? g : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrainId, tick]);

  const conceptMap = useMemo(() => {
    if (!conceptGraph) return undefined;
    const map: Record<string, string[]> = {};
    for (const c of conceptGraph.concepts) {
      for (const eid of c.source_entries) {
        if (!map[eid]) map[eid] = [];
        map[eid].push(c.label);
      }
    }
    return map;
  }, [conceptGraph]);

  const godNodes = useMemo(() => {
    if (!conceptGraph) return [];
    return getGodNodes(conceptGraph, 8);
  }, [conceptGraph]);

  const refreshGraph = useCallback(() => setTick((t) => t + 1), []);

  const value = useMemo(
    () => ({ conceptGraph, conceptMap, godNodes, refreshGraph }),
    [conceptGraph, conceptMap, godNodes, refreshGraph],
  );

  return <ConceptGraphContext.Provider value={value}>{children}</ConceptGraphContext.Provider>;
}

export function useConceptGraph(): ConceptGraphContextValue {
  const ctx = useContext(ConceptGraphContext);
  if (!ctx) throw new Error("useConceptGraph must be called inside <ConceptGraphProvider>");
  return ctx;
}
