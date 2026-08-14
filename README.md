# react-api-state

> API-backed React state abstraction with local-first persistence and automatic background synchronization.

[![npm version](https://img.shields.io/npm/v/react-api-state.svg)](https://www.npmjs.com/package/react-api-state)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

`react-api-state` provides an offline-first, local-first state management hook for React applications. Your user interface updates instantly on every mutation without blocking on network requests, changes are saved locally to persistence storage, and synchronization with your server happens seamlessly when connectivity returns.

---

## 🚀 Key Features

- ⚡ **Local-First & Optimistic UI**: UI updates immediately on local mutations without waiting for server responses.
- 📦 **Offline Persistence**: Retains cached entities and pending sync operations across page reloads (built-in `LocalStorageAdapter`, extensible to IndexedDB).
- 🔄 **Smart Reconciliation**: Refresh operations merge fresh server snapshots with pending local changes without destroying un-synced data.
- 🔀 **Operation Queue Coalescing**: Automatically merges consecutive updates and cancels redundant offline operations (e.g., `CREATE` + `DELETE`).
- 🆔 **Temporary ID Resolution**: Generates local temporary IDs for offline entities and transparently replaces them with real database IDs upon server synchronization.
- 🌐 **Automatic Network Synchronization**: Listens for browser `online` events and triggers background synchronization automatically.
- 🌐 **Built-in HTTP `API` Client**: Includes a full-featured HTTP client with token handling, request cancellation, and error event dispatching.
- 🛡️ **Zero Heavy Dependencies**: Designed specifically for modern React 18 & React 19 with full TypeScript type safety.

---

## 📦 Installation

```bash
npm install react-api-state
# or
yarn add react-api-state
# or
pnpm add react-api-state
```

---

## 💡 Quick Start

```tsx
import React from "react";
import { useApiState } from "react-api-state";

interface Customer {
  _id: string;
  name: string;
  email: string;
}

export function CustomerList() {
  const customers = useApiState<Customer>("/api/customers");

  if (customers.loading) return <div>Loading cached customers...</div>;

  return (
    <div>
      {customers.isOffline && <div className="banner">You are currently offline</div>}

      <ul>
        {customers.data.map((c) => (
          <li key={c._id}>
            {c.name} ({c.email})
            <button onClick={() => customers.delete(c._id)}>Delete</button>
          </li>
        ))}
      </ul>

      <button
        onClick={() =>
          customers.add({
            name: "John Doe",
            email: "john@example.com",
          })
        }
      >
        Add Customer
      </button>
    </div>
  );
}
```

---

## 📖 Hook API Reference

The `useApiState<T>()` hook exposes a strongly-typed object:

| Property / Method | Type | Description |
| :--- | :--- | :--- |
| `data` | `T[]` | Current local collection data (optimistically updated). |
| `loading` | `boolean` | `true` during initial storage load or server refresh. |
| `syncing` | `boolean` | `true` while pending operations are being sent to the server. |
| `error` | `Error \| null` | Error object if the last sync or refresh failed. |
| `isOffline` | `boolean` | Whether the environment is currently offline (`navigator.onLine`). |
| `hasPendingChanges` | `boolean` | `true` if there are unsynchronized operations in the queue. |
| `get(id)` | `(id: string) => T \| undefined` | Retrieve an item from current local state by ID. |
| `set(data)` | `(data: T[]) => void` | Directly replace current local state (does **not** queue sync operations). |
| `add(data)` | `(data: Partial<T>) => Promise<T>` | Optimistically add item locally & queue a `CREATE` operation. |
| `update(id, changes)` | `(id: string, changes: Partial<T>) => Promise<T>` | Optimistically update item locally & queue an `UPDATE` operation. |
| `delete(id)` | `(id: string) => Promise<void>` | Optimistically remove item locally & queue a `DELETE` operation. |
| `refresh()` | `() => Promise<void>` | Fetch fresh snapshot from server and reconcile with pending operations. |
| `sync()` | `() => Promise<void>` | Send pending local operations to the server. |
| `clear()` | `() => void` | Clear local data and operation queue. |

---

## 🔍 Detailed CRUD Example

```tsx
import { useApiState } from "react-api-state";

interface Task {
  _id: string;
  title: string;
  completed: boolean;
}

export function TaskManager() {
  const tasks = useApiState<Task>({
    endpoint: "/api/tasks",
    idField: "_id",
  });

  // 1. Get single item by ID
  const activeTask = tasks.get("task-123");

  // 2. Optimistically Add Item
  const handleCreate = async () => {
    const newTask = await tasks.add({
      title: "Write documentation",
      completed: false,
    });
    console.log("Created task with temp/real ID:", newTask._id);
  };

  // 3. Optimistically Update Item
  const handleToggle = async (id: string, currentCompleted: boolean) => {
    await tasks.update(id, { completed: !currentCompleted });
  };

  // 4. Optimistically Delete Item
  const handleDelete = async (id: string) => {
    await tasks.delete(id);
  };

  // 5. Manual Sync & Refresh
  return (
    <div>
      <button onClick={() => tasks.refresh()} disabled={tasks.loading}>
        Refresh from Server
      </button>
      <button onClick={() => tasks.sync()} disabled={tasks.syncing || !tasks.hasPendingChanges}>
        {tasks.syncing ? "Syncing..." : "Sync Pending Changes"}
      </button>

      {tasks.error && <p className="error">Sync Error: {tasks.error.message}</p>}
    </div>
  );
}
```

---

## 🛜 Offline Usage & Background Sync

`react-api-state` decouples React UI state from network connectivity:

1. **Instant UI Feedback**: When offline, mutations (`add`, `update`, `delete`) complete immediately in React local state.
2. **Operation Queueing**: Operations are saved to an internal operation queue in local persistence storage.
3. **Auto-Synchronization**: When connectivity returns (`online` browser event), `sync()` is called automatically.
4. **Status Flags**: Components use `isOffline` and `hasPendingChanges` to display offline badges or sync indicators.

---

## 🌐 Using the Built-in `API` Class

`react-api-state` includes a full-featured HTTP `API` class:

```ts
import { API } from "react-api-state";

// 1. Initialize API client
const api = new API("https://api.example.com", "my_auth_token_key");

// 2. Set Bearer Token dynamically
api.Token = "eyJhbGciOiJIUzI1NiIsInR5cCI6...";

// 3. Perform HTTP operations directly
const customers = await api.get("/customers");
const newCustomer = await api.post("/customers", { name: "Alice" });
await api.patch("/customers/123", { name: "Alice Smith" });
await api.delete("/customers/123");

// 4. Cancel pending request
api.cancel("GET-/customers");
```

### Passing a Custom `API` Instance to `useApiState`

```tsx
import { API, useApiState } from "react-api-state";

const myApiClient = new API("https://api.example.com");
myApiClient.Token = "my-bearer-token";

export function CustomerApp() {
  const customers = useApiState<Customer>({
    endpoint: "/customers",
    api: myApiClient,
  });

  return <div>{/* UI Components */}</div>;
}
```

### Default HTTP Methods

By default, `react-api-state` uses:
- **`GET [endpoint]`** to fetch/list all records (`refresh()`)
- **`PUT [endpoint]`** to create new records (`add()`)
- **`PUT [endpoint]/:id`** to update existing records (`update()`)
- **`DELETE [endpoint]/:id`** to delete records (`delete()`)

If you want to override methods for alternative REST conventions (e.g. `POST` for create or `PATCH` for update):

```tsx
const customers = useApiState<Customer>({
  endpoint: "/api/customers",
  method: {
    create: "POST", // Override default PUT to use POST
    update: "PATCH", // Override default PUT to use PATCH
  },
});
```

---

## ✉️ Response Envelopes & Error Detection

`react-api-state` handles API envelopes automatically:

### 1. Success Envelopes

If your API wraps success responses:
```json
{
  "status": "success",
  "message": "You have 10 records",
  "data": [
    { "_id": "1", "name": "John" }
  ]
}
```
`react-api-state` automatically unwraps the `data` array (or `items` / `results`) for `list()`, `create()`, and `update()`.

### 2. Error Envelopes

If your API returns error responses:
```json
{
  "status": "error",
  "message": "Authentication failed"
}
```
`react-api-state` detects `status: "error"` (or `success: false`) and exposes the `message` string under `customers.error`.

### 3. Custom Response Transformers

```ts
const customers = useApiState<Customer>({
  endpoint: "/api/customers",
  transformResponse: (res) => res.result.payload,
});
```

---

## ⚙️ Configuration Options

```ts
interface UseApiStateOptions<T> {
  /** Base REST endpoint string (e.g. "/api/customers") */
  endpoint?: string;

  /** Primary key field name on entities. Default: "_id" */
  idField?: keyof T;

  /** Field name for client temporary ID. Default: "tempId" */
  tempIdField?: string;

  /** Whether to include tempId in create request body to server. Default: true */
  sendTempId?: boolean;

  /** Custom storage key for persistence. Default: derived from endpoint */
  storageKey?: string;

  /** Storage adapter instance. Default: LocalStorageAdapter */
  storage?: StorageAdapter<T>;

  /** Custom API adapter instance, API client instance, or endpoint config */
  api?: ApiAdapter<T> | API | EndpointConfig;

  /** Automatically refresh from API on initialization. Default: true */
  autoRefresh?: boolean;

  /** Automatically sync pending changes when online. Default: true */
  autoSync?: boolean;

  /** Custom fetch implementation */
  fetch?: typeof fetch;

  /** Dynamic or static headers */
  headers?: Record<string, string> | (() => Promise<Record<string, string>>);

  /** Custom temporary ID generator */
  generateTempId?: () => string;
}
```

---

## 🔀 Operation Queue Coalescing

`react-api-state` prevents redundant network requests by merging queued mutations before sync:

- **`UPDATE` + `UPDATE`**: Multiple consecutive updates to the same entity are merged into a single `UPDATE` with combined properties.
- **`CREATE` + `UPDATE`**: An offline create followed by updates produces a single `CREATE` operation with final merged data.
- **`CREATE` + `DELETE`**: An entity created and deleted while offline cancels both operations, removing them from the queue entirely.
- **`UPDATE` + `DELETE`**: Preceding updates are discarded and replaced with a single `DELETE` operation.

---

## 🆔 Temporary IDs & Mongoose / Backend Deduplication

When creating entities locally/offline, `react-api-state` generates a client `tempId` (e.g. `local-550e8400-e29b...`) instead of forcing a fake string as the primary `_id`:

```tsx
const customers = useApiState<Customer>({
  endpoint: "/api/customers",
  idField: "_id",
  tempIdField: "tempId", // Default: "tempId"
});
```

### 1. What happens during local creation (`add`):
- Local entity state gets:
  ```json
  {
    "_id": "local-550e8400-e29b...",
    "tempId": "local-550e8400-e29b...",
    "name": "John Doe"
  }
  ```
- The payload sent to the backend includes `tempId` and **omits the fake string `_id`**, so Mongoose generates a clean `ObjectId`:
  ```json
  {
    "tempId": "local-550e8400-e29b...",
    "name": "John Doe"
  }
  ```

### 2. Server-side Idempotency & Deduplication:
Your backend / Mongoose can easily check if a request with that `tempId` was already received to prevent duplicate inserts:
```js
// In your Express / Mongoose controller:
const existing = await Customer.findOne({ tempId: req.body.tempId });
if (existing) return res.json({ status: "success", data: existing });

const customer = await Customer.create(req.body);
res.json({ status: "success", data: customer });
```

### 3. Automatic Server ID Replacement:
When Mongoose responds with the real database `_id` (e.g. `"64a7f289b0123"`):
- `react-api-state` updates `_id` to `"64a7f289b0123"` while preserving `tempId`.
- Updates any subsequent pending operations referencing the temporary ID.
- Reconciles server snapshots by matching `_id` OR `tempId`.

---

## 🔌 Custom Adapters

### Custom Storage Adapter (e.g. IndexedDB)

```ts
import { StorageAdapter, StoredState } from "react-api-state";
import { get, set, del } from "idb-keyval";

export class IndexedDBAdapter<T> implements StorageAdapter<T> {
  async load(key: string): Promise<StoredState<T> | null> {
    return (await get(key)) || null;
  }
  async save(key: string, state: StoredState<T>): Promise<void> {
    await set(key, state);
  }
  async clear(key: string): Promise<void> {
    await del(key);
  }
}
```

### Custom API Adapter (e.g. GraphQL or Firebase)

```ts
import { ApiAdapter } from "react-api-state";

class CustomGraphQLAdapter<T> implements ApiAdapter<T> {
  async list(): Promise<T[]> {
    return [];
  }
  async create(data: Partial<T>): Promise<T> {
    return data as T;
  }
  async update(id: string, changes: Partial<T>): Promise<T> {
    return { id, ...changes } as unknown as T;
  }
  async delete(id: string): Promise<void> {}
}
```

---

## 🗺️ Roadmap

- [ ] `useReference<T>()` hook for static master lookup data (countries, categories, departments).
- [ ] Built-in `IndexedDbAdapter`.
- [ ] Cross-tab sync via `BroadcastChannel`.
- [ ] Exponential backoff retry strategies.

---

## 📜 License

[MIT](LICENSE) © react-api-state contributors
