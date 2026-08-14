/**
 * Key of object type T that acts as the identifier field name (e.g. "_id" or "id").
 */
export type IdKey<T> = Extract<keyof T, string>;

/**
 * Types of operations supported by the offline queue.
 */
export type SyncOperationType = "create" | "update" | "delete";

/**
 * Represents a single pending mutation operation.
 */
export interface SyncOperation<T = any> {
  /** Unique operation identifier */
  id: string;
  /** Operation type */
  type: SyncOperationType;
  /** Entity ID target (can be temporary or server ID) */
  entityId: string;
  /** Operation payload for create or update */
  payload?: Partial<T>;
  /** Timestamp when operation was created */
  createdAt: number;
}

/**
 * Shape of persisted state.
 */
export interface StoredState<T> {
  data: T[];
  operations: SyncOperation<T>[];
  timestamp: number;
}

/**
 * Snapshot shape of current internal state.
 */
export interface ApiStateSnapshot<T> {
  data: T[];
  loading: boolean;
  syncing: boolean;
  error: Error | null;
  isOffline: boolean;
  hasPendingChanges: boolean;
}

/**
 * Storage adapter interface for local persistence.
 */
export interface StorageAdapter<T> {
  load(key: string): Promise<StoredState<T> | null>;
  save(key: string, state: StoredState<T>): Promise<void>;
  clear(key: string): Promise<void>;
}

/**
 * Abstract API interface for CRUD operations.
 */
export interface ApiAdapter<T> {
  list(): Promise<T[]>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, changes: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

import type { API } from "./api/API";

export type { API };

/**
 * Endpoint configuration options for customizing REST URLs and HTTP options.
 */
export interface EndpointConfig {
  list?: string;
  create?: string;
  update?: string | ((id: string) => string);
  delete?: string | ((id: string) => string);
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
  fetch?: typeof fetch;
  method?: {
    create?: "PUT" | "POST";
    update?: "PUT" | "PATCH";
  };
  /**
   * Optional transformer function to unwrap or extract data from custom API response envelopes.
   */
  transformResponse?: (response: any) => any;
  /**
   * Custom instance of the API class to use for HTTP requests.
   */
  apiClient?: API;
}

/**
 * Configuration options for `useApiState`.
 */
export interface UseApiStateOptions<T> {
  /**
   * Base REST endpoint string (e.g. "/api/customers") or endpoint configuration object.
   */
  endpoint?: string;

  /**
   * Field name used as unique identifier on entities.
   * @default "_id"
   */
  idField?: IdKey<T>;

  /**
   * Custom storage key for offline persistence.
   * @default auto-generated from endpoint
   */
  storageKey?: string;

  /**
   * Storage adapter instance for persistence.
   * @default LocalStorageAdapter
   */
  storage?: StorageAdapter<T>;

  /**
   * Custom API adapter instance, API client instance, or endpoint config.
   * @default FetchApiAdapter using endpoint / API client
   */
  api?: ApiAdapter<T> | API | EndpointConfig;

  /**
   * Configure HTTP methods for API operations (e.g. create with PUT, update with PUT).
   */
  method?: {
    create?: "PUT" | "POST";
    update?: "PUT" | "PATCH";
  };

  /**
   * Custom fetch implementation to use for default FetchApiAdapter.
   */
  fetch?: typeof fetch;

  /**
   * Headers to include in API requests for default FetchApiAdapter.
   */
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);

  /**
   * Automatically fetch latest data from server when hook initializes.
   * @default true
   */
  autoRefresh?: boolean;

  /**
   * Automatically sync pending offline changes when connection is online.
   * @default true
   */
  autoSync?: boolean;

  /**
   * Field name used to store client-generated temporary IDs on entities (e.g. "tempId" or "_tempId").
   * Sent to backend to enable idempotency and server deduplication (e.g. Mongoose ObjectId generation).
   * @default "tempId"
   */
  tempIdField?: string;

  /**
   * Whether to include tempId in the create request payload sent to the server.
   * @default true
   */
  sendTempId?: boolean;

  /**
   * Custom function to generate temporary IDs for offline entity creation.
   * @default internal generator "local-uuid"
   */
  generateTempId?: () => string;
}

/**
 * Object returned by `useApiState`.
 */
export interface ApiState<T> {
  /**
   * Current collection data (optimistically updated).
   */
  data: T[];

  /**
   * Loading state (true during initial load or refresh).
   */
  loading: boolean;

  /**
   * Syncing state (true while pending operations are being sent to server).
   */
  syncing: boolean;

  /**
   * Error object if the last sync or refresh failed.
   */
  error: Error | null;

  /**
   * Whether the browser/environment is currently offline.
   */
  isOffline: boolean;

  /**
   * Whether there are unsynchronized local changes in the operation queue.
   */
  hasPendingChanges: boolean;

  /**
   * Retrieve an item from current local state by ID.
   */
  get(id: string): T | undefined;

  /**
   * Directly replace current local data state (does not queue sync operations).
   */
  set(data: T[]): void;

  /**
   * Optimistically add item locally and queue a CREATE operation.
   */
  add(data: Partial<T>): Promise<T>;

  /**
   * Optimistically update item locally and queue an UPDATE operation.
   */
  update(id: string, changes: Partial<T>): Promise<T>;

  /**
   * Optimistically remove item locally and queue a DELETE operation.
   */
  delete(id: string): Promise<void>;

  /**
   * Fetch fresh snapshot from server and reconcile with pending local operations.
   */
  refresh(): Promise<void>;

  /**
   * Sync pending operations with the server.
   */
  sync(): Promise<void>;

  /**
   * Clear local state data and operation queue.
   */
  clear(): void;
}
