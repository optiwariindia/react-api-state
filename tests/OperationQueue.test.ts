import { describe, expect, it } from "vitest";
import { OperationQueue } from "../src/core/OperationQueue";

interface TestCustomer {
  _id: string;
  name: string;
  email?: string;
  age?: number;
}

describe("OperationQueue & Coalescing", () => {
  it("should append independent operations for different entities", () => {
    const queue = new OperationQueue<TestCustomer>();
    queue.add("create", "1", { _id: "1", name: "Alice" });
    queue.add("create", "2", { _id: "2", name: "Bob" });

    expect(queue.length).toBe(2);
    expect(queue.operations[0].entityId).toBe("1");
    expect(queue.operations[1].entityId).toBe("2");
  });

  it("should coalesce multiple UPDATE operations for the same entity into one merged UPDATE", () => {
    const queue = new OperationQueue<TestCustomer>();
    queue.add("update", "1", { name: "Joh" });
    queue.add("update", "1", { name: "John" });
    queue.add("update", "1", { email: "john@example.com" });

    expect(queue.length).toBe(1);
    expect(queue.operations[0].type).toBe("update");
    expect(queue.operations[0].payload).toEqual({
      name: "John",
      email: "john@example.com",
    });
  });

  it("should coalesce CREATE followed by UPDATE into a single CREATE with latest state", () => {
    const queue = new OperationQueue<TestCustomer>();
    queue.add("create", "temp-1", { _id: "temp-1", name: "John" });
    queue.add("update", "temp-1", { name: "John Doe", email: "john@example.com" });

    expect(queue.length).toBe(1);
    expect(queue.operations[0].type).toBe("create");
    expect(queue.operations[0].payload).toEqual({
      _id: "temp-1",
      name: "John Doe",
      email: "john@example.com",
    });
  });

  it("should cancel both CREATE and DELETE operations when created and deleted locally before sync", () => {
    const queue = new OperationQueue<TestCustomer>();
    queue.add("create", "temp-1", { _id: "temp-1", name: "John" });
    queue.add("update", "temp-1", { age: 30 });
    queue.add("delete", "temp-1");

    expect(queue.length).toBe(0);
    expect(queue.isEmpty()).toBe(true);
  });

  it("should retain only DELETE when UPDATE is followed by DELETE", () => {
    const queue = new OperationQueue<TestCustomer>();
    queue.add("update", "1", { name: "John" });
    queue.add("update", "1", { email: "john@example.com" });
    queue.add("delete", "1");

    expect(queue.length).toBe(1);
    expect(queue.operations[0].type).toBe("delete");
    expect(queue.operations[0].entityId).toBe("1");
  });

  it("should replace temporary IDs across entityId and payload", () => {
    const queue = new OperationQueue<TestCustomer>();
    queue.add("update", "temp-100", { name: "Updated Temp" });

    queue.replaceEntityId("temp-100", "real-999", "_id");

    expect(queue.operations[0].entityId).toBe("real-999");
  });

  it("should handle remove and clear operations", () => {
    const queue = new OperationQueue<TestCustomer>();
    const op1 = queue.add("create", "1", { _id: "1", name: "A" });
    const op2 = queue.add("create", "2", { _id: "2", name: "B" });

    expect(queue.length).toBe(2);

    queue.remove(op1.id);
    expect(queue.length).toBe(1);
    expect(queue.operations[0].id).toBe(op2.id);

    queue.clear();
    expect(queue.length).toBe(0);
  });
});
