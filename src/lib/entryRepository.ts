import { authFetch } from "./authFetch";
import { enqueue } from "./offlineQueue";
import { writeEntriesCache } from "./entriesCache";
import { indexEntry, removeFromIndex } from "./searchIndex";
import { captureError } from "./notifications";
import type { Entry } from "../types";

interface RepoOptions {
  getEntries: () => Entry[];
  setEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  isOnline: boolean;
  refreshCount: () => void;
}

/**
 * EntryRepository — centralises optimistic update + offline queue + cache sync.
 * Replace inline fetch+queue sequences in OpenBrain with repository.save() etc.
 */
export class EntryRepository {
  constructor(private opts: RepoOptions) {}

  async save(entry: Entry): Promise<void> {
    // Optimistic add
    this.opts.setEntries((prev) => [entry, ...prev]);
    writeEntriesCache(this.opts.getEntries());
    indexEntry(entry);

    if (this.opts.isOnline) {
      try {
        await authFetch("/api/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry),
        });
      } catch (err) {
        captureError(err, "EntryRepository.save");
      }
    } else {
      await enqueue({
        id: crypto.randomUUID(),
        url: "/api/capture",
        method: "POST",
        body: JSON.stringify(entry),
        created_at: new Date().toISOString(),
      });
      this.opts.refreshCount();
    }
  }

  async update(id: string, patch: Partial<Entry>): Promise<void> {
    // Optimistic patch
    this.opts.setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

    if (this.opts.isOnline) {
      try {
        await authFetch("/api/update-entry", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...patch }),
        });
        const updated = { ...this.opts.getEntries().find((e) => e.id === id), ...patch } as Entry;
        removeFromIndex(id);
        indexEntry(updated);
      } catch (err) {
        captureError(err, "EntryRepository.update");
      }
    } else {
      await enqueue({
        id: crypto.randomUUID(),
        url: "/api/update-entry",
        method: "PATCH",
        body: JSON.stringify({ id, ...patch }),
        created_at: new Date().toISOString(),
      });
      this.opts.refreshCount();
    }
  }

  async delete(id: string): Promise<void> {
    // Optimistic remove
    this.opts.setEntries((prev) => prev.filter((e) => e.id !== id));
    removeFromIndex(id);
    writeEntriesCache(this.opts.getEntries());

    if (this.opts.isOnline) {
      try {
        await authFetch("/api/delete-entry", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
      } catch (err) {
        captureError(err, "EntryRepository.delete");
      }
    } else {
      await enqueue({
        id: crypto.randomUUID(),
        url: "/api/delete-entry",
        method: "DELETE",
        body: JSON.stringify({ id }),
        created_at: new Date().toISOString(),
      });
      this.opts.refreshCount();
    }
  }

  async restore(entry: Entry): Promise<void> {
    // Re-add to state (undo delete)
    this.opts.setEntries((prev) => [entry, ...prev]);
    indexEntry(entry);
    writeEntriesCache(this.opts.getEntries());
  }
}
