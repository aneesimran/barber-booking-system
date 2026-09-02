import { describe, it, expect, vi } from "vitest";

describe("Admin UI Deduplication & Legacy Cleanup Logic", () => {
  describe("Dashboard Blocked Slots Real-time Deduplication", () => {
    function processBlockedDocs(docs) {
      const blockedBySlot = new Map();
      const legacyDocsToDelete = [];

      docs.forEach((docSnap) => {
        const b = docSnap.data;
        if (!b.barberId || !b.time) return;
        const detId = `${b.barberId}_${b.date}_${b.time}`;
        const slotKey = `${b.barberId}_${b.time}`;

        // Prefer deterministic doc ID, or keep first encountered
        if (!blockedBySlot.has(slotKey) || docSnap.id === detId) {
          blockedBySlot.set(slotKey, {
            id: docSnap.id,
            barberId: b.barberId,
            date: b.date,
            time: b.time,
            reason: b.reason || "Manual Block",
            isBlockedSlot: true,
          });
        }

        // Track legacy random-ID docs to clean them up
        if (docSnap.id !== detId) {
          legacyDocsToDelete.push({ id: docSnap.id, detId });
        }
      });

      return {
        uniqueSlots: Array.from(blockedBySlot.values()),
        legacyDocsToDelete,
      };
    }

    it("deduplicates slots when both deterministic and legacy random-ID documents coexist", () => {
      const mockDocs = [
        // Legacy document with random ID
        {
          id: "jWvvbiv9AWcQWLMmrHGJ",
          data: { barberId: "imran", date: "2026-09-02", time: "10:00", reason: "Lunch" },
        },
        // Deterministic document with predictable ID
        {
          id: "imran_2026-09-02_10:00",
          data: { barberId: "imran", date: "2026-09-02", time: "10:00", reason: "Lunch" },
        },
        // Distinct slot for Ali
        {
          id: "ali_2026-09-02_11:20",
          data: { barberId: "ali", date: "2026-09-02", time: "11:20" },
        },
      ];

      const { uniqueSlots, legacyDocsToDelete } = processBlockedDocs(mockDocs);

      // Must produce exactly 2 slots, not 3
      expect(uniqueSlots.length).toBe(2);

      const imranSlot = uniqueSlots.find((s) => s.barberId === "imran" && s.time === "10:00");
      expect(imranSlot).toBeDefined();
      // Should prefer deterministic document ID
      expect(imranSlot.id).toBe("imran_2026-09-02_10:00");

      // Should identify legacy doc for deletion
      expect(legacyDocsToDelete).toEqual([
        { id: "jWvvbiv9AWcQWLMmrHGJ", detId: "imran_2026-09-02_10:00" },
      ]);
    });

    it("handles multiple legacy duplicates for the same slot gracefully", () => {
      const mockDocs = [
        { id: "legacy1", data: { barberId: "ali", date: "2026-09-02", time: "14:00" } },
        { id: "legacy2", data: { barberId: "ali", date: "2026-09-02", time: "14:00" } },
        { id: "ali_2026-09-02_14:00", data: { barberId: "ali", date: "2026-09-02", time: "14:00" } },
      ];

      const { uniqueSlots, legacyDocsToDelete } = processBlockedDocs(mockDocs);

      expect(uniqueSlots.length).toBe(1);
      expect(uniqueSlots[0].id).toBe("ali_2026-09-02_14:00");
      expect(legacyDocsToDelete.length).toBe(2);
      expect(legacyDocsToDelete.map((d) => d.id)).toEqual(["legacy1", "legacy2"]);
    });
  });

  describe("Blocked Slots Page Auto-Migration & Purge", () => {
    it("identifies all documents (deterministic and legacy) targeting a slot when unblocking", () => {
      const allDocsInFirestore = [
        { id: "legacyDocA", barberId: "imran", date: "2026-09-02", time: "11:00" },
        { id: "imran_2026-09-02_11:00", barberId: "imran", date: "2026-09-02", time: "11:00" },
        { id: "imran_2026-09-02_11:20", barberId: "imran", date: "2026-09-02", time: "11:20" },
      ];

      function findDocsToDeleteForUnblock(barberId, date, time) {
        return allDocsInFirestore.filter(
          (doc) => doc.barberId === barberId && doc.date === date && doc.time === time
        );
      }

      const targets = findDocsToDeleteForUnblock("imran", "2026-09-02", "11:00");
      expect(targets.map((t) => t.id)).toEqual(["legacyDocA", "imran_2026-09-02_11:00"]);
    });
  });

  describe("Reports Metric Aggregation Deduplication", () => {
    function aggregateBlockedReports(docs) {
      const stats = {
        imran: { blocked: 0 },
        ali: { blocked: 0 },
        total: { blocked: 0 },
      };

      const countedBlockedSlots = new Set();
      docs.forEach((doc) => {
        const data = doc.data;
        const bId = data.barberId;
        if (!bId || !data.date || !data.time) return;
        const slotKey = `${bId}_${data.date}_${data.time}`;
        if (countedBlockedSlots.has(slotKey)) return;
        countedBlockedSlots.add(slotKey);

        if (stats[bId]) {
          stats[bId].blocked++;
          stats["total"].blocked++;
        }
      });

      return stats;
    }

    it("prevents double-counting duplicate blocked slots in report totals", () => {
      const mockReportDocs = [
        // Imran 10:00 has 2 documents (legacy + deterministic)
        { data: { barberId: "imran", date: "2026-09-02", time: "10:00" } },
        { data: { barberId: "imran", date: "2026-09-02", time: "10:00" } },
        // Imran 10:20 has 1 document
        { data: { barberId: "imran", date: "2026-09-02", time: "10:20" } },
        // Ali 12:00 has 2 documents
        { data: { barberId: "ali", date: "2026-09-02", time: "12:00" } },
        { data: { barberId: "ali", date: "2026-09-02", time: "12:00" } },
      ];

      const stats = aggregateBlockedReports(mockReportDocs);

      // Imran has 2 unique slots blocked (10:00 and 10:20)
      expect(stats.imran.blocked).toBe(2);

      // Ali has 1 unique slot blocked (12:00)
      expect(stats.ali.blocked).toBe(1);

      // Global total should be 3, NOT 5
      expect(stats.total.blocked).toBe(3);
    });
  });
});
