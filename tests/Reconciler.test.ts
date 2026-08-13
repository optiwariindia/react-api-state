import { describe, expect, it } from "vitest";
import { reconcile } from "../src/core/Reconciler";
import { SyncOperation } from "../src/types";

interface Customer {
  _id: string;
  name: string;
  email?: string;
}

describe("Reconciler Strategy", () => {
  it("should preserve server snapshot when there are no pending operations", () => {
    const server: Customer[] = [
      { _id: "1", name: "John" },
      { _id: "2", name: "Alice" },
    ];
    const ops: SyncOperation<Customer>[] = [];

    const result = reconcile(server, ops, "_id");
    expect(result).toEqual(server);
  });

  it("should append pending CREATE operations on top of server snapshot", () => {
    const server: Customer[] = [{ _id: "1", name: "John" }];
    const ops: SyncOperation<Customer>[] = [
      {
        id: "op-1",
        type: "create",
        entityId: "temp-raj",
        payload: { _id: "temp-raj", name: "Raj" },
        createdAt: 100,
      },
    ];

    const result = reconcile(server, ops, "_id");
    expect(result).toEqual([
      { _id: "1", name: "John" },
      { _id: "temp-raj", name: "Raj" },
    ]);
  });

  it("should apply pending UPDATE operations on existing server items", () => {
    const server: Customer[] = [
      { _id: "1", name: "John", email: "john@old.com" },
      { _id: "2", name: "Alice" },
    ];
    const ops: SyncOperation<Customer>[] = [
      {
        id: "op-1",
        type: "update",
        entityId: "1",
        payload: { name: "Johnny", email: "john@new.com" },
        createdAt: 100,
      },
    ];

    const result = reconcile(server, ops, "_id");
    expect(result).toEqual([
      { _id: "1", name: "Johnny", email: "john@new.com" },
      { _id: "2", name: "Alice" },
    ]);
  });

  it("should filter out server items with pending DELETE operations", () => {
    const server: Customer[] = [
      { _id: "1", name: "John" },
      { _id: "2", name: "Alice" },
    ];
    const ops: SyncOperation<Customer>[] = [
      {
        id: "op-1",
        type: "delete",
        entityId: "2",
        createdAt: 100,
      },
    ];

    const result = reconcile(server, ops, "_id");
    expect(result).toEqual([{ _id: "1", name: "John" }]);
  });

  it("should work correctly with custom idField like 'id'", () => {
    interface User {
      id: string;
      username: string;
    }
    const server: User[] = [{ id: "100", username: "admin" }];
    const ops: SyncOperation<User>[] = [
      {
        id: "op-1",
        type: "create",
        entityId: "temp-user",
        payload: { id: "temp-user", username: "guest" },
        createdAt: 100,
      },
    ];

    const result = reconcile(server, ops, "id");
    expect(result).toEqual([
      { id: "100", username: "admin" },
      { id: "temp-user", username: "guest" },
    ]);
  });
});
