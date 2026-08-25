import { ApiAdapter, EndpointConfig } from "../types";
import { API } from "./API";

export interface FetchApiAdapterOptions extends EndpointConfig {
  endpoint?: string;
  endpoints?: string[];
  apiClient?: API;
}

export class FetchApiAdapter<T> implements ApiAdapter<T> {
  private config: FetchApiAdapterOptions;
  public client: API;

  constructor(options: string | FetchApiAdapterOptions) {
    if (typeof options === "string") {
      this.config = { endpoint: options };
    } else {
      this.config = options;
    }

    if (this.config.apiClient) {
      this.client = this.config.apiClient;
    } else {
      this.client = new API();
    }
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const defaultHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (!this.config.headers) {
      return defaultHeaders;
    }

    let customHeaders: Record<string, string> = {};
    if (typeof this.config.headers === "function") {
      customHeaders = await this.config.headers();
    } else {
      customHeaders = this.config.headers;
    }

    return {
      ...defaultHeaders,
      ...customHeaders,
    };
  }

  private getListUrl(): string {
    if (this.config.list) return this.config.list;
    if (this.config.endpoint) return this.config.endpoint;
    throw new Error("Endpoint or list URL must be specified.");
  }

  private getCreateUrl(): string {
    if (this.config.create) return this.config.create;
    if (this.config.endpoint) return this.config.endpoint;
    if (this.config.endpoints && this.config.endpoints.length > 0) {
      throw new Error("Mutations are not supported when using multiple endpoints unless a specific create URL is provided.");
    }
    throw new Error("Endpoint or create URL must be specified.");
  }

  private getUpdateUrl(id: string): string {
    if (typeof this.config.update === "function") {
      return this.config.update(id);
    }
    if (typeof this.config.update === "string") {
      return this.config.update;
    }
    if (this.config.endpoint) {
      const base = this.config.endpoint.replace(/\/$/, "");
      return `${base}/${encodeURIComponent(id)}`;
    }
    if (this.config.endpoints && this.config.endpoints.length > 0) {
      throw new Error("Mutations are not supported when using multiple endpoints unless a specific update URL is provided.");
    }
    throw new Error("Endpoint or update URL must be specified.");
  }

  private getDeleteUrl(id: string): string {
    if (typeof this.config.delete === "function") {
      return this.config.delete(id);
    }
    if (typeof this.config.delete === "string") {
      return this.config.delete;
    }
    if (this.config.endpoint) {
      const base = this.config.endpoint.replace(/\/$/, "");
      return `${base}/${encodeURIComponent(id)}`;
    }
    if (this.config.endpoints && this.config.endpoints.length > 0) {
      throw new Error("Mutations are not supported when using multiple endpoints unless a specific delete URL is provided.");
    }
    throw new Error("Endpoint or delete URL must be specified.");
  }

  private processResult(result: any): any {
    if (result && typeof result === "object" && !Array.isArray(result)) {
      if (
        result.status === "error" ||
        result.status === "fail" ||
        result.success === false
      ) {
        throw new Error(
          result.message || result.error || "API request failed with error status"
        );
      }
    }

    if (this.config.transformResponse) {
      return this.config.transformResponse(result);
    }

    return result;
  }

  private async parseFetchError(resp: Response): Promise<Error> {
    let errorMessage = `HTTP error! status: ${resp.status}`;
    try {
      if (typeof resp.json === "function") {
        const json = await resp.json();
        if (json && typeof json === "object") {
          errorMessage = json.message || json.error || errorMessage;
        } else if (typeof json === "string") {
          errorMessage = json;
        }
      } else if (typeof resp.text === "function") {
        const text = await resp.text();
        if (text) {
          try {
            const json = JSON.parse(text);
            errorMessage = json.message || json.error || errorMessage;
          } catch {
            errorMessage = text;
          }
        }
      }
    } catch {
      // ignore
    }
    return new Error(errorMessage);
  }

  private async fetchListFromUrl(url: string, search?: any): Promise<T[]> {
    const headers = await this.getHeaders();

    const searchPayload =
      search !== undefined && search !== null
        ? search
        : this.config.search !== undefined
        ? this.config.search
        : this.config.searchParams;

    const hasSearch =
      searchPayload !== undefined &&
      searchPayload !== null &&
      (typeof searchPayload !== "object" || Object.keys(searchPayload).length > 0);

    let raw: any;
    if (this.config.fetch) {
      const resp = await this.config.fetch(url, {
        method: hasSearch ? "POST" : "GET",
        headers: {
          ...(hasSearch ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        ...(hasSearch ? { body: JSON.stringify(searchPayload) } : {}),
      });
      if (!resp.ok) {
        throw await this.parseFetchError(resp);
      }
      raw = await resp.json();
    } else {
      raw = hasSearch
        ? await this.client.post(url, searchPayload, { headers })
        : await this.client.get(url, { headers });
    }

    const processed = this.processResult(raw);

    if (Array.isArray(processed)) {
      return processed;
    }
    if (processed && typeof processed === "object") {
      if (Array.isArray(processed.data)) return processed.data;
      if (Array.isArray(processed.items)) return processed.items;
      if (Array.isArray(processed.results)) return processed.results;
    }
    return [];
  }

  async list(search?: any): Promise<T[]> {
    if (this.config.endpoints && Array.isArray(this.config.endpoints) && this.config.endpoints.length > 0) {
      const results = await Promise.allSettled(
        this.config.endpoints.map(url => this.fetchListFromUrl(url, search))
      );

      let combinedData: T[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") {
          combinedData = combinedData.concat(result.value);
        } else {
          console.warn(`[FetchApiAdapter] Failed to fetch from endpoint:`, result.reason);
        }
      }
      return combinedData;
    }

    const url = this.getListUrl();
    return this.fetchListFromUrl(url, search);
  }

  async create(data: Partial<T>): Promise<T> {
    const headers = await this.getHeaders();
    const url = this.getCreateUrl();
    const method = (this.config.method?.create || "PUT").toLowerCase() as "put" | "post";

    let raw: any;
    if (this.config.fetch) {
      const resp = await this.config.fetch(url, {
        method: method.toUpperCase(),
        headers,
        body: JSON.stringify(data),
      });
      if (!resp.ok) {
        throw await this.parseFetchError(resp);
      }
      raw = await resp.json();
    } else {
      raw = method === "post"
        ? await this.client.post(url, data, { headers })
        : await this.client.put(url, data, { headers });
    }

    const processed = this.processResult(raw);
    if (processed && typeof processed === "object" && !Array.isArray(processed)) {
      if ("data" in processed && processed.data && typeof processed.data === "object") {
        return processed.data as T;
      }
    }
    return processed as T;
  }

  async update(id: string, changes: Partial<T>): Promise<T> {
    const headers = await this.getHeaders();
    const url = this.getUpdateUrl(id);
    const method = (this.config.method?.update || "PUT").toLowerCase() as "put" | "patch";

    let raw: any;
    if (this.config.fetch) {
      const resp = await this.config.fetch(url, {
        method: method.toUpperCase(),
        headers,
        body: JSON.stringify(changes),
      });
      if (!resp.ok) {
        throw await this.parseFetchError(resp);
      }
      raw = await resp.json();
    } else {
      raw = method === "patch"
        ? await this.client.patch(url, changes, { headers })
        : await this.client.put(url, changes, { headers });
    }

    const processed = this.processResult(raw);
    if (processed && typeof processed === "object" && !Array.isArray(processed)) {
      if ("data" in processed && processed.data && typeof processed.data === "object") {
        return processed.data as T;
      }
    }
    return processed as T;
  }

  async delete(id: string): Promise<void> {
    const headers = await this.getHeaders();
    const url = this.getDeleteUrl(id);

    let raw: any;
    if (this.config.fetch) {
      const resp = await this.config.fetch(url, {
        method: "DELETE",
        headers,
      });
      if (!resp.ok) {
        throw await this.parseFetchError(resp);
      }
      return;
    } else {
      raw = await this.client.delete(url, undefined, { headers });
    }

    this.processResult(raw);
  }
}
