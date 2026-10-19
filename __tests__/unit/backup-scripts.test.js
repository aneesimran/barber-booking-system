import { describe, it, expect } from "vitest";
import { serializeFirestoreData } from "../../scripts/backup-firestore.mjs";
import { deserializeFirestoreData } from "../../scripts/restore-firestore.mjs";

describe("Backup & Restore Data Engine", () => {
  it("serializes primitives and nested structures correctly", () => {
    const input = {
      name: "Arthur Dent",
      duration: 20,
      active: true,
      tags: ["vip", "haircut"],
      meta: { barberId: "imran" },
    };

    const serialized = serializeFirestoreData(input);
    expect(serialized).toEqual(input);
  });

  it("serializes Firestore Timestamp objects into preserved _type structure", () => {
    const fakeTimestamp = {
      seconds: 1729368000,
      nanoseconds: 123000000,
      toDate: () => new Date("2026-10-19T20:00:00.123Z"),
    };

    const docData = {
      id: "appt_1",
      createdAt: fakeTimestamp,
    };

    const serialized = serializeFirestoreData(docData);
    expect(serialized.createdAt._type).toBe("Timestamp");
    expect(serialized.createdAt.seconds).toBe(1729368000);
    expect(serialized.createdAt.iso).toBe("2026-10-19T20:00:00.123Z");
  });

  it("deserializes preserved Timestamp structures back into Firestore Timestamp objects", () => {
    const serialized = {
      id: "appt_1",
      createdAt: {
        _type: "Timestamp",
        seconds: 1729368000,
        nanoseconds: 123000000,
        iso: "2026-10-19T20:00:00.123Z",
      },
    };

    const deserialized = deserializeFirestoreData(serialized);
    expect(deserialized.createdAt.seconds).toBe(1729368000);
    expect(deserialized.createdAt.nanoseconds).toBe(123000000);
    expect(typeof deserialized.createdAt.toDate).toBe("function");
  });

  it("handles null, undefined, and empty objects gracefully", () => {
    expect(serializeFirestoreData(null)).toBeNull();
    expect(serializeFirestoreData(undefined)).toBeUndefined();
    expect(deserializeFirestoreData(null)).toBeNull();
    expect(deserializeFirestoreData(undefined)).toBeUndefined();
  });
});
