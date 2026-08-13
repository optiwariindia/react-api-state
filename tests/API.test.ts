import { describe, expect, it, vi } from "vitest";
import { API } from "../src/api/API";

describe("API Class", () => {
  it("should initialize with baseUrl and allow Token setter", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "success", data: [] }),
    });
    globalThis.fetch = mockFetch as any;

    const api = new API("https://api.example.com");
    api.Token = "my-jwt-token";

    await api.get("/users");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/users",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer my-jwt-token",
        }),
      })
    );
  });

  it("should send POST request with body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "1", name: "John" }),
    });
    globalThis.fetch = mockFetch as any;

    const api = new API("https://api.example.com");
    const result = await api.post("/users", { name: "John" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/users",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "John" }),
      })
    );
    expect(result).toEqual({ id: "1", name: "John" });
  });

  it("should dispatch error-received CustomEvent on non-200 response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ message: "Authentication failed" }),
    });
    globalThis.fetch = mockFetch as any;

    const dispatchSpy = vi.spyOn(document, "dispatchEvent");

    const api = new API("https://api.example.com");
    const errorData = await api.get("/protected");

    expect(dispatchSpy).toHaveBeenCalled();
    expect(errorData.message).toBe("Authentication failed");
  });

  it("should support request cancellation", async () => {
    const mockFetch = vi.fn().mockImplementation((_url, options) => {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    globalThis.fetch = mockFetch as any;

    const api = new API("https://api.example.com");
    const promise = api.get("/long-request");

    api.cancel("GET-/long-request");

    const result = await promise;
    expect(result).toEqual({
      status: "canceled",
      data: [],
      message: "",
    });
  });
});
