/**
 * StorageAdapter — thin wrapper over localStorage with typed get/set/remove.
 * Swappable to in-memory in tests by injecting a custom backend.
 */
export class StorageAdapter {
  private backend: Pick<Storage, "getItem" | "setItem" | "removeItem">;

  constructor(backend?: Pick<Storage, "getItem" | "setItem" | "removeItem">) {
    this.backend = backend ?? localStorage;
  }

  get<T = unknown>(key: string): T | null {
    try {
      const raw = this.backend.getItem(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  set(key: string, value: unknown): void {
    try {
      this.backend.setItem(key, JSON.stringify(value));
    } catch {
      // ignore quota errors
    }
  }

  remove(key: string): void {
    this.backend.removeItem(key);
  }
}

/** Singleton for app-wide use */
export const storage = new StorageAdapter();
