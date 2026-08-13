import { IdKey, SyncOperation } from "../types";

/**
 * Reconciles a fresh server snapshot with local pending sync operations.
 *
 * Formula:
 * server snapshot + pending operations => reconstructed local state
 *
 * Unsynchronized local changes (CREATE, UPDATE, DELETE) are replayed on top
 * of the server snapshot so that pending mutations are never destroyed by refresh.
 */
export function reconcile<T extends Record<string, any>>(
  serverSnapshot: T[],
  pendingOperations: SyncOperation<T>[],
  idField: IdKey<T>
): T[] {
  const itemMap = new Map<string, T>();

  // 1. Populate map with server snapshot items
  for (const item of serverSnapshot) {
    if (item && item[idField] !== undefined && item[idField] !== null) {
      const id = String(item[idField]);
      itemMap.set(id, { ...item });
    }
  }

  // 2. Replay pending operations in chronological order
  for (const op of pendingOperations) {
    const entityId = String(op.entityId);

    switch (op.type) {
      case "create": {
        const existing = itemMap.get(entityId);
        const newItem = {
          [idField]: entityId,
          ...(op.payload || {}),
        } as unknown as T;

        if (existing) {
          itemMap.set(entityId, { ...existing, ...newItem });
        } else {
          itemMap.set(entityId, newItem);
        }
        break;
      }

      case "update": {
        const existing = itemMap.get(entityId);
        if (existing) {
          itemMap.set(entityId, {
            ...existing,
            ...(op.payload || {}),
          });
        }
        break;
      }

      case "delete": {
        itemMap.delete(entityId);
        break;
      }
    }
  }

  return Array.from(itemMap.values());
}
