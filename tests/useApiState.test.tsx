import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearStoreRegistry } from "../src/core/ApiStateManager";
import { useApiState } from "../src/useApiState";

interface Item {
  _id: string;
  name: string;
  tempId?: string;
}

describe("useApiState React Hook", () => {
  beforeEach(() => {
    clearStoreRegistry();
    localStorage.clear();
  });

  it("should initialize hook state cleanly", async () => {
    const mockList = vi.fn().mockResolvedValue([{ _id: "1", name: "Item 1" }]);

    const { result } = renderHook(() =>
      useApiState<Item>({
        endpoint: "/api/items",
        storageKey: "test-hook-1",
        api: {
          list: mockList,
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
        autoRefresh: true,
        autoSync: false,
      })
    );

    expect(result.current.loading).toBe(true);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([{ _id: "1", name: "Item 1" }]);
  });

  it("should handle optimistic add, update, and delete through hook", async () => {
    const mockApi = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async (item) => ({ ...item, _id: "server-1" })),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    };

    const { result } = renderHook(() =>
      useApiState<Item>({
        endpoint: "/api/items",
        storageKey: "test-hook-2",
        api: mockApi,
        autoRefresh: false,
        autoSync: false,
        generateTempId: () => "temp-99",
      })
    );

    await act(async () => {
      await result.current.add({ name: "New Item" });
    });

    expect(result.current.data).toEqual([
      { _id: "temp-99", tempId: "temp-99", name: "New Item" },
    ]);
    expect(result.current.hasPendingChanges).toBe(true);

    await act(async () => {
      await result.current.update("temp-99", { name: "Updated Item" });
    });

    expect(result.current.data).toEqual([
      { _id: "temp-99", tempId: "temp-99", name: "Updated Item" },
    ]);

    await act(async () => {
      await result.current.sync();
    });

    expect(result.current.hasPendingChanges).toBe(false);
    expect(result.current.data[0]._id).toBe("server-1");
    expect(result.current.data[0].tempId).toBe("temp-99");

    await act(async () => {
      await result.current.delete("server-1");
    });

    expect(result.current.data).toEqual([]);
  });

  it("should support direct set and clear", async () => {
    const { result } = renderHook(() =>
      useApiState<Item>({
        endpoint: "/api/items",
        storageKey: "test-hook-3",
        autoRefresh: false,
        autoSync: false,
      })
    );

    await act(async () => {
      result.current.set([
        { _id: "1", name: "Direct 1" },
        { _id: "2", name: "Direct 2" },
      ]);
    });

    expect(result.current.data.length).toBe(2);
    expect(result.current.get("1")?.name).toBe("Direct 1");

    await act(async () => {
      result.current.clear();
    });

    expect(result.current.data).toEqual([]);
    expect(result.current.hasPendingChanges).toBe(false);
  });

  it("should trigger sync on window online event when autoSync is true", async () => {
    const mockSync = vi.fn();
    const mockApi = {
      list: vi.fn().mockResolvedValue([]),
      create: mockSync,
      update: vi.fn(),
      delete: vi.fn(),
    };

    const { result } = renderHook(() =>
      useApiState<Item>({
        endpoint: "/api/items",
        storageKey: "test-hook-4",
        api: mockApi,
        autoRefresh: false,
        autoSync: true,
      })
    );

    // Dispatch online event
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    expect(result.current.isOffline).toBe(false);
  });

  it("should trigger search with parameters via search() method", async () => {
    const mockList = vi.fn().mockResolvedValue([{ _id: "10", name: "Found Product" }]);
    const mockApi = {
      list: mockList,
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    const { result } = renderHook(() =>
      useApiState<Item, { keyword: string }>({
        endpoint: "/api/items",
        storageKey: "test-hook-5",
        api: mockApi,
        autoRefresh: false,
        autoSync: false,
      })
    );

    await act(async () => {
      await result.current.search({ keyword: "laptop" });
    });

    expect(mockList).toHaveBeenCalledWith({ keyword: "laptop" });
    expect(result.current.searchParams).toEqual({ keyword: "laptop" });
    expect(result.current.data).toEqual([{ _id: "10", name: "Found Product" }]);
  });
});
