import type { Entry } from "../../types";
import { enrichEntry, type EnrichError } from "../enrichEntry";

interface BulkEnrichProgress {
  idx: number;
  total: number;
  done: number;
  title: string;
  phase: string;
  errors: EnrichError[];
}

interface PipelineHooks {
  onUpdate: (id: string, changes: any) => Promise<void>;
  getEntries?: () => Entry[];
  throttleMs?: number;
}

interface EnrichmentPipeline {
  enrich(entry: Entry, brainId: string): void;
  enrichBulk(entries: Entry[], brainId: string): AsyncGenerator<BulkEnrichProgress>;
}

export function createPipeline(hooks: PipelineHooks): EnrichmentPipeline {
  const throttle = hooks.throttleMs ?? 5000;

  return {
    enrich(entry: Entry, brainId: string): void {
      enrichEntry(entry, brainId, hooks.onUpdate).catch(() => {});

      if (hooks.getEntries) {
        const entries = hooks.getEntries();
        import("../brainConnections")
          .then(({ findAndSaveConnections }) => {
            findAndSaveConnections(entry, entries, brainId).catch(() => {});
          })
          .catch(() => {});
      }
    },

    async *enrichBulk(entries: Entry[], brainId: string): AsyncGenerator<BulkEnrichProgress> {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const title = entry.title || "(untitled)";
        let currentPhase = "starting";
        let errors: EnrichError[] = [];

        yield {
          idx: i + 1,
          total: entries.length,
          done: i,
          title,
          phase: currentPhase,
          errors: [],
        };

        try {
          errors = await enrichEntry(entry, brainId, hooks.onUpdate, (p) => {
            currentPhase = p;
          });
        } catch (err) {
          errors = [{ step: "unknown", message: String((err as any)?.message ?? err) }];
        }

        yield { idx: i + 1, total: entries.length, done: i + 1, title, phase: "done", errors };

        if (i < entries.length - 1) await new Promise((r) => setTimeout(r, throttle));
      }
    },
  };
}
