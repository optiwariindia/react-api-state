import { SyncOperation, SyncOperationType } from "../types";

/**
 * Coalesces a new operation into an existing list of operations.
 */
export function coalesceOperations<T>(
  existingOps: SyncOperation<T>[],
  newOp: SyncOperation<T>
): SyncOperation<T>[] {
  const entityOps = existingOps.filter((op) => op.entityId === newOp.entityId);

  if (entityOps.length === 0) {
    return [...existingOps, newOp];
  }

  const lastEntityOp = entityOps[entityOps.length - 1];

  if (newOp.type === "update") {
    if (lastEntityOp.type === "create") {
      // Rule 2: CREATE + UPDATE -> single CREATE with merged payload
      return existingOps.map((op) => {
        if (op.id === lastEntityOp.id) {
          return {
            ...op,
            payload: {
              ...op.payload,
              ...newOp.payload,
            },
          };
        }
        return op;
      });
    }

    if (lastEntityOp.type === "update") {
      // Rule 1: UPDATE + UPDATE -> single UPDATE with merged payload
      return existingOps.map((op) => {
        if (op.id === lastEntityOp.id) {
          return {
            ...op,
            payload: {
              ...op.payload,
              ...newOp.payload,
            },
          };
        }
        return op;
      });
    }
  }

  if (newOp.type === "delete") {
    const hasCreate = entityOps.some((op) => op.type === "create");
    if (hasCreate) {
      // Rule 3: CREATE + DELETE -> cancel both operations (remove entity ops entirely)
      return existingOps.filter((op) => op.entityId !== newOp.entityId);
    }

    // Rule 4: UPDATE + DELETE -> replace UPDATE(s) with single DELETE
    const filteredOps = existingOps.filter((op) => op.entityId !== newOp.entityId);
    return [...filteredOps, newOp];
  }

  // Fallback: append operation if no special coalescing matches
  return [...existingOps, newOp];
}

export class OperationQueue<T> {
  private queue: SyncOperation<T>[] = [];

  constructor(initial: SyncOperation<T>[] = []) {
    this.queue = [...initial];
  }

  get operations(): SyncOperation<T>[] {
    return [...this.queue];
  }

  get length(): number {
    return this.queue.length;
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  add(type: SyncOperationType, entityId: string, payload?: Partial<T>): SyncOperation<T> {
    const op: SyncOperation<T> = {
      id: `op-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type,
      entityId,
      payload,
      createdAt: Date.now(),
    };

    this.queue = coalesceOperations(this.queue, op);
    return op;
  }

  setOperations(ops: SyncOperation<T>[]): void {
    this.queue = [...ops];
  }

  remove(opId: string): void {
    this.queue = this.queue.filter((op) => op.id !== opId);
  }

  clear(): void {
    this.queue = [];
  }

  /**
   * Replaces a temporary entity ID with a real server ID across all remaining queue operations.
   */
  replaceEntityId(tempId: string, realId: string, idField: string): void {
    this.queue = this.queue.map((op) => {
      let updated = { ...op };

      if (updated.entityId === tempId) {
        updated.entityId = realId;
      }

      if (updated.payload && typeof updated.payload === "object") {
        const payloadObj = { ...updated.payload } as any;
        if (payloadObj[idField] === tempId) {
          payloadObj[idField] = realId;
        }
        updated.payload = payloadObj;
      }

      return updated;
    });
  }
}
