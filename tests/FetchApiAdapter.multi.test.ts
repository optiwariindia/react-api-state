import { describe, it, expect, vi } from "vitest";
import { FetchApiAdapter } from "../src/api/FetchApiAdapter";

describe("FetchApiAdapter - Multiple Endpoints", () => {
  it("should fetch and combine data from multiple endpoints", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/1") {
        return { ok: true, json: async () => [{ id: 1, name: "Item 1" }] };
      }
      if (url === "/api/2") {
        return { ok: true, json: async () => [{ id: 2, name: "Item 2" }] };
      }
      return { ok: false, status: 404 };
    });

    const adapter = new FetchApiAdapter<any>({
      endpoints: ["/api/1", "/api/2"],
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await adapter.list();
    expect(result).toEqual([
      { id: 1, name: "Item 1" },
      { id: 2, name: "Item 2" }
    ]);
  });

  it("should skip failed endpoints and return successful ones", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/1") {
        return { ok: true, json: async () => [{ id: 1, name: "Item 1" }] };
      }
      return { ok: false, status: 500, text: async () => "Error" };
    });

    const adapter = new FetchApiAdapter<any>({
      endpoints: ["/api/1", "/api/2"],
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await adapter.list();
    expect(result).toEqual([
      { id: 1, name: "Item 1" }
    ]);
  });

  it("should throw error when mutating with multiple endpoints and no specific mutation url", async () => {
    const adapter = new FetchApiAdapter<any>({
      endpoints: ["/api/1", "/api/2"]
    });

    await expect(adapter.create({ name: "New" })).rejects.toThrow("Mutations are not supported");
    await expect(adapter.update("1", { name: "New" })).rejects.toThrow("Mutations are not supported");
    await expect(adapter.delete("1")).rejects.toThrow("Mutations are not supported");
  });

  it("should allow mutation with multiple endpoints if explicit mutation url is provided", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      return { ok: true, json: async () => ({ data: { id: 1, name: "New" } }) };
    });

    const adapter = new FetchApiAdapter<any>({
      endpoints: ["/api/1", "/api/2"],
      create: "/api/create",
      update: "/api/update",
      delete: "/api/delete",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(adapter.create({ name: "New" })).resolves.toEqual({ id: 1, name: "New" });
  });
});
