import { describe, expect, it, vi } from "vitest";
import { FetchApiAdapter } from "../src/api/FetchApiAdapter";

interface Item {
  id: string;
  name: string;
}

describe("FetchApiAdapter", () => {
  it("should make list GET request when no search parameters are provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => [{ id: "1", name: "Alpha" }],
    });

    const adapter = new FetchApiAdapter<Item>({
      endpoint: "/api/items",
      fetch: mockFetch as any,
    });

    const list = await adapter.list();
    expect(mockFetch).toHaveBeenCalledWith("/api/items", {
      method: "GET",
      headers: expect.objectContaining({
        "Content-Type": "application/json",
      }),
    });
    expect(list).toEqual([{ id: "1", name: "Alpha" }]);
  });

  it("should make POST request with body when search parameters are passed to list()", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => [{ id: "2", name: "Searched Item" }],
    });

    const adapter = new FetchApiAdapter<Item>({
      endpoint: "/api/items",
      fetch: mockFetch as any,
    });

    const list = await adapter.list({ query: "phone", minPrice: 100 });
    expect(mockFetch).toHaveBeenCalledWith("/api/items", {
      method: "POST",
      headers: expect.objectContaining({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ query: "phone", minPrice: 100 }),
    });
    expect(list).toEqual([{ id: "2", name: "Searched Item" }]);
  });

  it("should make POST request with body when search options are configured in adapter options", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => [{ id: "3", name: "Config Search Item" }],
    });

    const adapter = new FetchApiAdapter<Item>({
      endpoint: "/api/items",
      search: { status: "active" },
      fetch: mockFetch as any,
    });

    const list = await adapter.list();
    expect(mockFetch).toHaveBeenCalledWith("/api/items", {
      method: "POST",
      headers: expect.objectContaining({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ status: "active" }),
    });
    expect(list).toEqual([{ id: "3", name: "Config Search Item" }]);
  });

  it("should default to PUT for create and PUT for update", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ id: "100", name: "Default PUT Item" }),
    });

    const adapter = new FetchApiAdapter<Item>({
      endpoint: "/api/items",
      fetch: mockFetch as any,
    });

    await adapter.create({ name: "Default PUT Item" });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/items",
      expect.objectContaining({ method: "PUT" })
    );

    await adapter.update("100", { name: "Updated via PUT" });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/items/100",
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("should support method overrides for POST / PATCH", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ id: "200", name: "Override Item" }),
    });

    const adapter = new FetchApiAdapter<Item>({
      endpoint: "/api/items",
      method: {
        create: "POST",
        update: "PATCH",
      },
      fetch: mockFetch as any,
    });

    await adapter.create({ name: "Override Item" });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/items",
      expect.objectContaining({ method: "POST" })
    );

    await adapter.update("200", { name: "Updated via PATCH" });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/items/200",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("should unwrap envelope response for list endpoint ({ status: 'success', data: [...] })", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        status: "success",
        message: "You have 0 record",
        data: [{ id: "10", name: "Envelope Item" }],
      }),
    });

    const adapter = new FetchApiAdapter<Item>({
      endpoint: "/api/items",
      fetch: mockFetch as any,
    });

    const list = await adapter.list();
    expect(list).toEqual([{ id: "10", name: "Envelope Item" }]);
  });

  it("should unwrap envelope response for create endpoint ({ status: 'success', data: {...} })", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        status: "success",
        message: "Item created",
        data: { id: "99", name: "New Envelope Item" },
      }),
    });

    const adapter = new FetchApiAdapter<Item>({
      endpoint: "/api/items",
      fetch: mockFetch as any,
    });

    const created = await adapter.create({ name: "New Envelope Item" });
    expect(created).toEqual({ id: "99", name: "New Envelope Item" });
  });

  it("should throw error when API returns status: 'error' in response body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        status: "error",
        message: "Authentication failed",
      }),
    });

    const adapter = new FetchApiAdapter<Item>({
      endpoint: "/api/items",
      fetch: mockFetch as any,
    });

    await expect(adapter.list()).rejects.toThrow("Authentication failed");
  });

  it("should support custom transformResponse function", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        result: {
          payload: [{ id: "50", name: "Transformed" }],
        },
      }),
    });

    const adapter = new FetchApiAdapter<Item>({
      endpoint: "/api/items",
      transformResponse: (res) => res.result.payload,
      fetch: mockFetch as any,
    });

    const list = await adapter.list();
    expect(list).toEqual([{ id: "50", name: "Transformed" }]);
  });

  it("should support custom function URLs for update and delete", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ id: "10", name: "Updated" }),
    });

    const adapter = new FetchApiAdapter<Item>({
      endpoint: "/api/items",
      update: (id) => `/custom/update/${id}`,
      delete: (id) => `/custom/delete/${id}`,
      fetch: mockFetch as any,
    });

    await adapter.update("10", { name: "Updated" });
    expect(mockFetch).toHaveBeenCalledWith("/custom/update/10", expect.anything());

    await adapter.delete("10");
    expect(mockFetch).toHaveBeenCalledWith("/custom/delete/10", expect.anything());
  });

  it("should throw HTTP error when response is not ok", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ message: "Bad Request" }),
    });

    const adapter = new FetchApiAdapter<Item>({
      endpoint: "/api/items",
      fetch: mockFetch as any,
    });

    await expect(adapter.list()).rejects.toThrow("Bad Request");
  });
});
