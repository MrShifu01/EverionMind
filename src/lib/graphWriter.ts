/**
 * Serialized concept graph writes — one write queue per brain.
 * All sites that load→merge→save the concept graph must go through here
 * to prevent concurrent writes from silently overwriting each other.
 */
import { loadGraphFromDB, saveGraphToDB, mergeGraph, validateGraph } from "./conceptGraph";
import type { ConceptGraph } from "./conceptGraph";

const _queues = new Map<string, Promise<void>>();

function _chain(brainId: string, fn: () => Promise<void>): Promise<void> {
  const prev = _queues.get(brainId) ?? Promise.resolve();
  const next = prev.then(fn).finally(() => {
    if (_queues.get(brainId) === next) _queues.delete(brainId);
  });
  _queues.set(brainId, next);
  return next;
}

/**
 * Atomically merge `incoming` concepts and relationships into the stored graph.
 * Serialized per brain — concurrent calls queue behind each other.
 */
export function writeConceptsToGraph(brainId: string, incoming: ConceptGraph): Promise<void> {
  return _chain(brainId, async () => {
    if (!validateGraph(incoming)) {
      console.error("[graphWriter] Invalid incoming graph — write aborted");
      return;
    }
    const existing = await loadGraphFromDB(brainId);
    const merged = mergeGraph(existing, incoming);
    await saveGraphToDB(brainId, merged);
  });
}

