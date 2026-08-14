import { IdKey, SyncOperation } from "../types";

/**
 * Reconciles a fresh server snapshot with local pending sync operations.
 *
 * Formula:
 * server snapshot + pending operations => reconstructed local state
 *
 * Unsynchronized local changes (CREATE, UPDATE, DELETE) are replayed on top
 * of the server snapshot so that pending mutations are never destroyed by refresh.
 *
 * Supports matching server items by both primary `idField` (e.g. "_id") and client `tempIdField` (e.g. "tempId").
 */
export function reconcile<T extends Record<string, any>>(
  serverSnapshot: T[],
  pendingOperations: SyncOperation<T>[],
  idField: IdKey<T>,
  tempIdField: string = "tempId"
): T[] {
  const itemMap = new Map<string, T>();
  const tempIdToRealIdMap = new Map<string, string>();

  // 1. Populate map with server snapshot items
  for (const item of serverSnapshot) {
    if (item && item[idField] !== undefined && item[idField] !== null) {
      const id = String(item[idField]);
      itemMap.set(id, { ...item });

      if (tempIdField && item[tempIdField]) {
        tempIdToRealIdMap.set(String(item[tempIdField]), id);
      }
    }
  }

  // 2. Replay pending operations in chronological order
  for (const op of pendingOperations) {
    const entityId = String(op.entityId);
    const resolvedId = tempIdToRealIdMap.get(entityId) || entityId;

    switch (op.type) {
      case "create": {
        const existing = itemMap.get(resolvedId);
        const newItem = {
          [idField]: resolvedId,
          ...(op.payload || {}),
        } as unknown as T;

        if (existing) {
          itemMap.set(resolvedId, { ...existing, ...newItem });
        } else {
          itemMap.set(resolvedId, newItem);
        }
        break;
      }

      case "update": {
        const existing = itemMap.get(resolvedId);
        if (existing) {
          itemMap.set(resolvedId, {
            ...existing,
            ...(op.payload || {}),
          });
        }
        break;
      }

      case "delete": {
        itemMap.delete(resolvedId);
        break;
      }
    }
  }

  return Array.from(itemMap.values());
}
