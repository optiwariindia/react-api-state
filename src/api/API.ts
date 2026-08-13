async function parseResponseError(response: Response): Promise<{ status: number; message: string; [key: string]: any }> {
  try {
    const data = await response.json();
    if (data && typeof data === "object") {
      return {
        status: response.status,
        message: data.message || data.error || response.statusText || "Request failed",
        ...data,
      };
    }
  } catch {
    // Ignore JSON parse error
  }
  return {
    status: response.status,
    message: response.statusText || `Request failed with status ${response.status}`,
  };
}

export class API {
  #tokenPath: string;
  #token: string | null = null;
  #controller: Map<string, AbortController> = new Map();
  baseUrl: string;

  constructor(baseUrl = "", tokenPath = "token") {
    this.#tokenPath = tokenPath;
    this.baseUrl = baseUrl;
  }

  set Token(token: string | null) {
    this.#token = token;
  }

  cancel(requestKey?: string): void {
    if (!requestKey) return;
    const controller = this.#controller.get(requestKey);
    if (!controller) return;
    controller.abort();
    this.#controller.delete(requestKey);
  }

  async request(method: string, endpoint: string, { body, headers = {} }: { body?: any; headers?: Record<string, string> } = {}): Promise<any> {
    const requestKey = `${method}-${endpoint}`;
    const controller = new AbortController();
    this.cancel(requestKey);
    this.#controller.set(requestKey, controller);

    const url = `${this.baseUrl}${endpoint}`;
    const token =
      typeof window !== "undefined" && window.localStorage
        ? localStorage.getItem(this.#tokenPath)
        : null;

    const activeToken = this.#token ?? token;

    // Set default headers
    const defaultHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(activeToken && { Authorization: `Bearer ${activeToken}` }),
    };

    // Merge headers
    const mergedHeaders: Record<string, string> = {
      ...defaultHeaders,
      ...headers,
    };

    // Handle FormData content type
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      delete mergedHeaders["Content-Type"];
    }

    const config: RequestInit = {
      method,
      headers: mergedHeaders,
      credentials: "include",
      signal: controller.signal,
    };

    if (body && method !== "GET") {
      config.body = typeof FormData !== "undefined" && body instanceof FormData ? body : JSON.stringify(body);
    }

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorData = await parseResponseError(response);

        if (typeof document !== "undefined" && typeof CustomEvent !== "undefined") {
          document.dispatchEvent(
            new CustomEvent("error-received", {
              detail: {
                status: response.status,
                message: errorData.message,
              },
            })
          );
        }
        return errorData;
      }
      return await response.json();
    } catch (error: any) {
      if (error.name === "AbortError") {
        console.log("Cancelled : ", requestKey);
        return {
          status: "canceled",
          data: [],
          message: "",
        };
      }
      throw error;
    } finally {
      this.#controller.delete(requestKey);
    }
  }

  async getHtml(url: string, config: RequestInit = { mode: "no-cors" }): Promise<string | any> {
    console.log(url);

    const response = await fetch(url, config);
    if (!response.ok) {
      let errorData: any;
      try {
        errorData = await response.json();
        console.log(errorData);
      } catch {
        errorData = { message: response.statusText };
      }

      if (typeof document !== "undefined" && typeof CustomEvent !== "undefined") {
        document.dispatchEvent(
          new CustomEvent("error-received", {
            detail: {
              status: response.status,
              message: errorData.message,
            },
          })
        );
      }
      return errorData;
    }
    return await response.text();
  }

  get(endpoint: string, options = {}): Promise<any> {
    return this.request("GET", endpoint, options);
  }

  post(endpoint: string, body?: any, options = {}): Promise<any> {
    return this.request("POST", endpoint, { ...options, body });
  }

  put(endpoint: string, body?: any, options = {}): Promise<any> {
    return this.request("PUT", endpoint, { ...options, body });
  }

  patch(endpoint: string, body?: any, options = {}): Promise<any> {
    return this.request("PATCH", endpoint, { ...options, body });
  }

  delete(endpoint: string, body?: any, options = {}): Promise<any> {
    return this.request("DELETE", endpoint, { ...options, body });
  }

  copy(endpoint: string, body = {}, options = {}): Promise<any> {
    return this.request("COPY", endpoint, { ...options, body });
  }
}
