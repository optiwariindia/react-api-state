import { beforeEach, describe, expect, it } from "vitest";
import { LocalStorageAdapter } from "../src/storage/LocalStorageAdapter";
import { StoredState } from "../src/types";

interface Item {
  id: string;
  name: string;
}

describe("LocalStorageAdapter", () => {
  let adapter: LocalStorageAdapter<Item>;

  beforeEach(() => {
    localStorage.clear();
    adapter = new LocalStorageAdapter<Item>("test-prefix:");
  });

  it("should return null for non-existent key", async () => {
    const loaded = await adapter.load("missing");
    expect(loaded).toBeNull();
  });

  it("should save and load state accurately", async () => {
    const state: StoredState<Item> = {
      data: [{ id: "1", name: "Widget" }],
      operations: [
        {
          id: "op-1",
          type: "create",
          entityId: "1",
          createdAt: Date.now(),
        },
      ],
      timestamp: Date.now(),
    };

    await adapter.save("items", state);
    const loaded = await adapter.load("items");

    expect(loaded).not.toBeNull();
    expect(loaded?.data).toEqual([{ id: "1", name: "Widget" }]);
    expect(loaded?.operations.length).toBe(1);
  });

  it("should clear stored state", async () => {
    const state: StoredState<Item> = {
      data: [{ id: "1", name: "Widget" }],
      operations: [],
      timestamp: Date.now(),
    };

    await adapter.save("items", state);
    await adapter.clear("items");

    const loaded = await adapter.load("items");
    expect(loaded).toBeNull();
  });

  it("should handle invalid JSON in storage gracefully", async () => {
    localStorage.setItem("test-prefix:bad-json", "{ invalid json }");
    const loaded = await adapter.load("bad-json");
    expect(loaded).toBeNull();
  });
});
