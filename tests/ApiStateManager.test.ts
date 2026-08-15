import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiStateManager, clearStoreRegistry } from "../src/core/ApiStateManager";
import { ApiAdapter, StorageAdapter, StoredState } from "../src/types";

interface Customer {
  _id: string;
  name: string;
  email?: string;
  tempId?: string;
}

class MemoryStorageAdapter<T> implements StorageAdapter<T> {
  public store = new Map<string, StoredState<T>>();

  async load(key: string): Promise<StoredState<T> | null> {
    return this.store.get(key) || null;
  }

  async save(key: string, state: StoredState<T>): Promise<void> {
    this.store.set(key, state);
  }

  async clear(key: string): Promise<void> {
    this.store.delete(key);
  }
}

describe("ApiStateManager Core Logic", () => {
  let mockApi: ApiAdapter<Customer>;
  let memoryStorage: MemoryStorageAdapter<Customer>;

  beforeEach(() => {
    clearStoreRegistry();
    memoryStorage = new MemoryStorageAdapter<Customer>();

    mockApi = {
      list: vi.fn().mockResolvedValue([{ _id: "1", name: "Alice" }]),
      create: vi.fn().mockImplementation(async (data) => ({
        ...data,
        _id: "server-id-99",
      })),
      update: vi.fn().mockImplementation(async (id, changes) => ({
        _id: id,
        ...changes,
      })),
      delete: vi.fn().mockResolvedValue(undefined),
    };
  });

  it("should initialize with stored state and perform autoRefresh", async () => {
    await memoryStorage.save("cust-key", {
      data: [{ _id: "cached-1", name: "Cached User" }],
      operations: [],
      timestamp: Date.now(),
    });

    const manager = new ApiStateManager<Customer>({
      endpoint: "/api/customers",
      storageKey: "cust-key",
      storage: memoryStorage,
      api: mockApi,
      autoRefresh: true,
      autoSync: false,
    });

    await manager.init();
    await manager.refresh();

    // After refresh completes
    expect(mockApi.list).toHaveBeenCalled();
    expect(manager.getSnapshot().data).toEqual([{ _id: "1", name: "Alice" }]);
  });

  it("should perform optimistic ADD and queue CREATE operation with tempId", async () => {
    const manager = new ApiStateManager<Customer>({
      endpoint: "/api/customers",
      storageKey: "cust-key",
      storage: memoryStorage,
      api: mockApi,
      autoRefresh: false,
      autoSync: false,
      generateTempId: () => "temp-123",
    });

    await manager.init();

    const created = await manager.add({ name: "Bob", email: "bob@test.com" });

    expect(created._id).toBe("temp-123");
    expect(created.tempId).toBe("temp-123");
    expect(manager.getSnapshot().data).toEqual([
      { _id: "temp-123", tempId: "temp-123", name: "Bob", email: "bob@test.com" },
    ]);
    expect(manager.getSnapshot().hasPendingChanges).toBe(true);
  });

  it("should perform optimistic UPDATE and queue UPDATE operation", async () => {
    const manager = new ApiStateManager<Customer>({
      endpoint: "/api/customers",
      storageKey: "cust-key",
      storage: memoryStorage,
      api: mockApi,
      autoRefresh: false,
      autoSync: false,
    });

    await manager.init();
    manager.set([{ _id: "1", name: "Alice" }]);

    await manager.update("1", { name: "Alice Smith" });

    expect(manager.get("1")?.name).toBe("Alice Smith");
    expect(manager.getSnapshot().hasPendingChanges).toBe(true);
  });

  it("should perform optimistic DELETE and queue DELETE operation", async () => {
    const manager = new ApiStateManager<Customer>({
      endpoint: "/api/customers",
      storageKey: "cust-key",
      storage: memoryStorage,
      api: mockApi,
      autoRefresh: false,
      autoSync: false,
    });

    await manager.init();
    manager.set([{ _id: "1", name: "Alice" }]);

    await manager.delete("1");

    expect(manager.get("1")).toBeUndefined();
    expect(manager.getSnapshot().data).toEqual([]);
    expect(manager.getSnapshot().hasPendingChanges).toBe(true);
  });

  it("should synchronize pending operations, send tempId to server without fake _id, and replace with server _id", async () => {
    const manager = new ApiStateManager<Customer>({
      endpoint: "/api/customers",
      storageKey: "cust-key",
      storage: memoryStorage,
      api: mockApi,
      autoRefresh: false,
      autoSync: false,
      generateTempId: () => "temp-555",
    });

    await manager.init();

    await manager.add({ name: "Charlie" });
    await manager.update("temp-555", { email: "charlie@test.com" });

    await manager.sync();

    // Verify payload sent to server has tempId and no temporary _id
    expect(mockApi.create).toHaveBeenCalledWith({
      tempId: "temp-555",
      name: "Charlie",
      email: "charlie@test.com",
    });
    expect(manager.getSnapshot().hasPendingChanges).toBe(false);
    expect(manager.getSnapshot().data[0]._id).toBe("server-id-99");
    expect(manager.getSnapshot().data[0].tempId).toBe("temp-555");
  });

  it("should retain queue and expose error on sync failure", async () => {
    const failingApi: ApiAdapter<Customer> = {
      ...mockApi,
      create: vi.fn().mockRejectedValue(new Error("Network Error")),
    };

    const manager = new ApiStateManager<Customer>({
      endpoint: "/api/customers",
      storageKey: "cust-key",
      storage: memoryStorage,
      api: failingApi,
      autoRefresh: false,
      autoSync: false,
      generateTempId: () => "temp-err",
    });

    await manager.init();
    await manager.add({ name: "Fail User" });

    await manager.sync();

    expect(manager.getSnapshot().error?.message).toBe("Network Error");
    expect(manager.getSnapshot().hasPendingChanges).toBe(true);
    expect(manager.get("temp-err")).toBeDefined();
  });

  it("should trigger search and update searchParams via search() and refresh()", async () => {
    const manager = new ApiStateManager<Customer, { query: string }>({
      endpoint: "/api/customers",
      storageKey: "cust-key",
      storage: memoryStorage,
      api: mockApi,
      autoRefresh: false,
      autoSync: false,
    });

    await manager.init();

    await manager.search({ query: "active users" });

    expect(mockApi.list).toHaveBeenCalledWith({ query: "active users" });
    expect(manager.getSearchParams()).toEqual({ query: "active users" });

    await manager.refresh({ query: "pending users" });
    expect(mockApi.list).toHaveBeenCalledWith({ query: "pending users" });
    expect(manager.getSearchParams()).toEqual({ query: "pending users" });
  });
});
