import { StorageAdapter, StoredState } from "../types";

export class LocalStorageAdapter<T> implements StorageAdapter<T> {
  private memoryFallback = new Map<string, StoredState<T>>();
  private prefix: string;

  constructor(prefix: string = "react-api-state:") {
    this.prefix = prefix;
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  private isLocalStorageAvailable(): boolean {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return false;
      }
      const testKey = "__react_api_state_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  async load(key: string): Promise<StoredState<T> | null> {
    const fullKey = this.getKey(key);
    if (!this.isLocalStorageAvailable()) {
      return this.memoryFallback.get(fullKey) || null;
    }

    try {
      const raw = window.localStorage.getItem(fullKey);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray(parsed.data) &&
        Array.isArray(parsed.operations)
      ) {
        return parsed as StoredState<T>;
      }
      return null;
    } catch (err) {
      console.warn(`[LocalStorageAdapter] Failed to load key "${fullKey}":`, err);
      return null;
    }
  }

  async save(key: string, state: StoredState<T>): Promise<void> {
    const fullKey = this.getKey(key);
    if (!this.isLocalStorageAvailable()) {
      this.memoryFallback.set(fullKey, state);
      return;
    }

    try {
      window.localStorage.setItem(fullKey, JSON.stringify(state));
    } catch (err) {
      console.warn(`[LocalStorageAdapter] Failed to save key "${fullKey}":`, err);
      // Save to memory fallback if quota exceeded or error occurred
      this.memoryFallback.set(fullKey, state);
    }
  }

  async clear(key: string): Promise<void> {
    const fullKey = this.getKey(key);
    this.memoryFallback.delete(fullKey);

    if (this.isLocalStorageAvailable()) {
      try {
        window.localStorage.removeItem(fullKey);
      } catch (err) {
        console.warn(`[LocalStorageAdapter] Failed to clear key "${fullKey}":`, err);
      }
    }
  }
}
