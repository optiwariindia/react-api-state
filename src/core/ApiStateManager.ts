import { ApiAdapter } from "../api/ApiAdapter";
import { FetchApiAdapter } from "../api/FetchApiAdapter";
import { LocalStorageAdapter } from "../storage/LocalStorageAdapter";
import {
  ApiStateSnapshot,
  EndpointConfig,
  IdKey,
  StorageAdapter,
  StoredState,
  UseApiStateOptions,
} from "../types";
import { OperationQueue } from "./OperationQueue";
import { reconcile } from "./Reconciler";

export function defaultGenerateTempId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `local-${crypto.randomUUID()}`;
  }
  return `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export class ApiStateManager<T extends Record<string, any>> {
  private data: T[] = [];
  private loading = true;
  private syncing = false;
  private error: Error | null = null;
  private isOfflineState = false;

  private queue: OperationQueue<T> = new OperationQueue<T>();
  private storage: StorageAdapter<T>;
  private api: ApiAdapter<T>;
  private idField: IdKey<T>;
  private tempIdField: string;
  private sendTempId: boolean;
  private storageKey: string;
  private autoRefresh: boolean;
  private autoSync: boolean;
  private generateTempId: () => string;

  private listeners = new Set<() => void>();
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private syncPromise: Promise<void> | null = null;

  constructor(options: UseApiStateOptions<T>) {
    this.idField = options.idField || ("_id" as IdKey<T>);
    this.tempIdField = options.tempIdField || "tempId";
    this.sendTempId = options.sendTempId !== false;

    const endpointStr =
      typeof options.endpoint === "string" ? options.endpoint : undefined;

    this.storageKey =
      options.storageKey || endpointStr || "react-api-state-default";

    this.storage = options.storage || new LocalStorageAdapter<T>();

    if (options.api && typeof (options.api as any).list === "function") {
      this.api = options.api as ApiAdapter<T>;
    } else if (options.api && typeof (options.api as any).request === "function") {
      this.api = new FetchApiAdapter<T>({
        endpoint: endpointStr,
        apiClient: options.api as any,
        headers: options.headers,
        fetch: options.fetch,
        method: options.method,
      });
    } else {
      const endpointConfig: EndpointConfig =
        options.api && typeof options.api === "object"
          ? (options.api as EndpointConfig)
          : {};

      this.api = new FetchApiAdapter<T>({
        endpoint: endpointStr,
        headers: options.headers,
        fetch: options.fetch,
        method: options.method,
        ...endpointConfig,
      });
    }

    this.autoRefresh = options.autoRefresh !== false;
    this.autoSync = options.autoSync !== false;
    this.generateTempId = options.generateTempId || defaultGenerateTempId;

    this.isOfflineState = this.checkIsOffline();
    this.setupEventListeners();
  }

  private checkIsOffline(): boolean {
    if (typeof window !== "undefined" && typeof navigator !== "undefined") {
      return !navigator.onLine;
    }
    return false;
  }

  private setupEventListeners(): void {
    if (typeof window !== "undefined") {
      const handleOnline = () => {
        this.isOfflineState = false;
        this.notify();
        if (this.autoSync) {
          this.sync().catch(() => {});
        }
      };

      const handleOffline = () => {
        this.isOfflineState = true;
        this.notify();
      };

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.loading = true;
      this.notify();

      try {
        const stored = await this.storage.load(this.storageKey);
        if (stored) {
          this.data = stored.data || [];
          this.queue.setOperations(stored.operations || []);
        }
      } catch (err) {
        console.warn(`[ApiStateManager] Storage load error for key "${this.storageKey}":`, err);
      } finally {
        this.loading = false;
        this.isInitialized = true;
        this.notify();
      }

      if (this.autoRefresh) {
        this.refresh().catch(() => {});
      } else if (this.autoSync && !this.queue.isEmpty() && !this.isOfflineState) {
        this.sync().catch(() => {});
      }
    })();

    return this.initPromise;
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (!this.isInitialized) {
      this.init().catch(() => {});
    }
    return () => {
      this.listeners.delete(listener);
    };
  };

  private cachedSnapshot: ApiStateSnapshot<T> | null = null;

  private updateSnapshot(): void {
    this.cachedSnapshot = {
      data: this.data,
      loading: this.loading,
      syncing: this.syncing,
      error: this.error,
      isOffline: this.isOfflineState,
      hasPendingChanges: !this.queue.isEmpty(),
    };
  }

  private notify(): void {
    this.updateSnapshot();
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        console.error("[ApiStateManager] Listener error:", e);
      }
    }
  }

  public getSnapshot = (): ApiStateSnapshot<T> => {
    if (!this.cachedSnapshot) {
      this.updateSnapshot();
    }
    return this.cachedSnapshot!;
  };

  private async saveStorage(): Promise<void> {
    const state: StoredState<T> = {
      data: this.data,
      operations: this.queue.operations,
      timestamp: Date.now(),
    };
    await this.storage.save(this.storageKey, state);
  }

  public get(id: string): T | undefined {
    return this.data.find(
      (item) =>
        String(item[this.idField]) === String(id) ||
        (this.tempIdField in item && String(item[this.tempIdField]) === String(id))
    );
  }

  public set(data: T[]): void {
    this.data = [...data];
    this.notify();
    this.saveStorage().catch(() => {});
  }

  public async add(data: Partial<T>): Promise<T> {
    const hasExplicitId =
      data[this.idField] !== undefined &&
      data[this.idField] !== null &&
      data[this.idField] !== "";

    const tempId = this.generateTempId();
    const entityId = hasExplicitId ? String(data[this.idField]) : tempId;

    const newItem = {
      [this.idField]: entityId,
      ...(this.sendTempId ? { [this.tempIdField]: tempId } : {}),
      ...data,
    } as unknown as T;

    this.data = [...this.data, newItem];

    const payload: any = {
      ...(this.sendTempId ? { [this.tempIdField]: tempId } : {}),
      ...data,
    };

    // If ID was generated temporarily, don't send fake string ID in idField so Mongoose generates real ObjectId
    if (!hasExplicitId) {
      delete payload[this.idField];
    }

    this.queue.add("create", entityId, payload);
    this.notify();

    await this.saveStorage();

    if (this.autoSync && !this.isOfflineState) {
      this.sync().catch(() => {});
    }

    return newItem;
  }

  public async update(id: string, changes: Partial<T>): Promise<T> {
    const existingIndex = this.data.findIndex(
      (item) =>
        String(item[this.idField]) === String(id) ||
        (this.tempIdField in item && String(item[this.tempIdField]) === String(id))
    );

    let updatedItem: T;
    if (existingIndex >= 0) {
      updatedItem = {
        ...this.data[existingIndex],
        ...changes,
      };
      this.data = [
        ...this.data.slice(0, existingIndex),
        updatedItem,
        ...this.data.slice(existingIndex + 1),
      ];
    } else {
      updatedItem = {
        [this.idField]: id,
        ...changes,
      } as unknown as T;
    }

    this.queue.add("update", id, changes);
    this.notify();

    await this.saveStorage();

    if (this.autoSync && !this.isOfflineState) {
      this.sync().catch(() => {});
    }

    return updatedItem;
  }

  public async delete(id: string): Promise<void> {
    this.data = this.data.filter(
      (item) =>
        String(item[this.idField]) !== String(id) &&
        !(this.tempIdField in item && String(item[this.tempIdField]) === String(id))
    );

    this.queue.add("delete", id);
    this.notify();

    await this.saveStorage();

    if (this.autoSync && !this.isOfflineState) {
      this.sync().catch(() => {});
    }
  }

  public async refresh(): Promise<void> {
    this.loading = true;
    this.notify();

    try {
      const serverSnapshot = await this.api.list();
      this.data = reconcile(
        serverSnapshot,
        this.queue.operations,
        this.idField,
        this.tempIdField
      );
      this.error = null;
      await this.saveStorage();
    } catch (err) {
      this.error = err as Error;
    } finally {
      this.loading = false;
      this.notify();
    }
  }

  public async sync(): Promise<void> {
    if (this.syncing) {
      return this.syncPromise || Promise.resolve();
    }

    if (this.queue.isEmpty()) {
      return;
    }

    this.syncing = true;
    this.error = null;
    this.notify();

    this.syncPromise = (async () => {
      try {
        while (!this.queue.isEmpty()) {
          const ops = this.queue.operations;
          if (ops.length === 0) break;

          const op = ops[0];

          if (op.type === "create") {
            const created = await this.api.create(op.payload || {});
            const serverId = created ? created[this.idField] : undefined;
            const realIdStr =
              serverId !== undefined && serverId !== null
                ? String(serverId)
                : op.entityId;

            this.data = this.data.map((item) => {
              const isMatch =
                String(item[this.idField]) === op.entityId ||
                (this.tempIdField in item &&
                  String(item[this.tempIdField]) === op.entityId);

              if (isMatch) {
                return {
                  ...item,
                  ...(created || {}),
                  [this.idField]: realIdStr,
                  ...(this.sendTempId ? { [this.tempIdField]: op.entityId } : {}),
                };
              }
              return item;
            });

            if (realIdStr !== op.entityId) {
              this.queue.replaceEntityId(
                op.entityId,
                realIdStr,
                this.idField as string
              );
            }
            this.queue.remove(op.id);
          } else if (op.type === "update") {
            await this.api.update(op.entityId, op.payload || {});
            this.queue.remove(op.id);
          } else if (op.type === "delete") {
            await this.api.delete(op.entityId);
            this.queue.remove(op.id);
          }

          await this.saveStorage();
          this.notify();
        }
      } catch (err) {
        this.error = err as Error;
      } finally {
        this.syncing = false;
        this.syncPromise = null;
        await this.saveStorage();
        this.notify();
      }
    })();

    return this.syncPromise;
  }

  public clear(): void {
    this.data = [];
    this.queue.clear();
    this.error = null;
    this.notify();
    this.storage.clear(this.storageKey).catch(() => {});
  }
}

// Global registry of stores to ensure singleton state sharing per key
const storeRegistry = new Map<string, ApiStateManager<any>>();

export function getOrCreateStateManager<T extends Record<string, any>>(
  options: UseApiStateOptions<T>
): ApiStateManager<T> {
  const endpointStr =
    typeof options.endpoint === "string" ? options.endpoint : undefined;
  const key = options.storageKey || endpointStr || "react-api-state-default";

  if (!storeRegistry.has(key)) {
    storeRegistry.set(key, new ApiStateManager<T>(options));
  }
  return storeRegistry.get(key) as ApiStateManager<T>;
}

export function clearStoreRegistry(): void {
  storeRegistry.clear();
}
