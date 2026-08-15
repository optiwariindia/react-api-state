import { useCallback, useMemo, useSyncExternalStore } from "react";
import { getOrCreateStateManager } from "./core/ApiStateManager";
import { ApiState, UseApiStateOptions } from "./types";

/**
 * Custom React hook for API-backed state with local-first persistence and synchronization.
 *
 * @example
 * ```tsx
 * interface Customer {
 *   _id: string;
 *   name: string;
 *   email: string;
 * }

 * const customers = useApiState<Customer>("/api/customers");
 * ```
 */
export function useApiState<T extends Record<string, any>, S = any>(
  endpointOrOptions: string | UseApiStateOptions<T, S>
): ApiState<T, S> {
  const options: UseApiStateOptions<T, S> =
    typeof endpointOrOptions === "string"
      ? { endpoint: endpointOrOptions }
      : endpointOrOptions;

  const manager = useMemo(() => {
    return getOrCreateStateManager<T, S>(options);
  }, [options.storageKey, options.endpoint]);

  const snapshot = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    manager.getSnapshot
  );

  const get = useCallback((id: string) => manager.get(id), [manager]);
  const set = useCallback((data: T[]) => manager.set(data), [manager]);
  const add = useCallback((data: Partial<T>) => manager.add(data), [manager]);
  const update = useCallback(
    (id: string, changes: Partial<T>) => manager.update(id, changes),
    [manager]
  );
  const deleteItem = useCallback((id: string) => manager.delete(id), [manager]);
  const search = useCallback((params?: S) => manager.search(params), [manager]);
  const refresh = useCallback((params?: S) => manager.refresh(params), [manager]);
  const sync = useCallback(() => manager.sync(), [manager]);
  const clear = useCallback(() => manager.clear(), [manager]);

  return {
    data: snapshot.data,
    searchParams: manager.getSearchParams(),
    loading: snapshot.loading,
    syncing: snapshot.syncing,
    error: snapshot.error,
    isOffline: snapshot.isOffline,
    hasPendingChanges: snapshot.hasPendingChanges,

    get,
    set,
    add,
    update,
    delete: deleteItem,

    search,
    refresh,
    sync,
    clear,
  };
}
