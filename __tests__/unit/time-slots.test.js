import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatLocalDate,
  getBlockedSlotId,
  generateTimeSlots,
  getAvailableSlots,
  getBarberScheduleForDate,
} from "@/lib/appointments";
import { barbers } from "@/config/barbers";

describe("Time Slots & Scheduling Engine", () => {
  const imranBarber = barbers.find((b) => b.id === "imran");
  const aliBarber = barbers.find((b) => b.id === "ali");

  describe("formatLocalDate", () => {
    it("formats local date as YYYY-MM-DD regardless of time of day", () => {
      const d = new Date(2026, 4, 15, 0, 0, 0); // May 15, 2026 local midnight
      expect(formatLocalDate(d)).toBe("2026-05-15");

      const d2 = new Date(2026, 11, 31, 23, 59, 59); // Dec 31, 2026 late night
      expect(formatLocalDate(d2)).toBe("2026-12-31");
    });
  });

  describe("getBlockedSlotId", () => {
    it("generates deterministic document ID matching barberId_date_time", () => {
      expect(getBlockedSlotId("imran", "2026-09-03", "12:00")).toBe("imran_2026-09-03_12:00");
      expect(getBlockedSlotId("ali", "2026-10-10", "14:20")).toBe("ali_2026-10-10_14:20");
    });
  });

  describe("generateTimeSlots - Regular Days & Days Off", () => {
    it("generates 20-minute slots from 10:00 to 18:40 on a regular Monday for Imran", () => {
      // 2026-05-04 is a Monday
      const monday = new Date(2026, 4, 4);
      const schedule = {
        barberId: "imran",
        workingHours: imranBarber.workingHours,
        lunchBreak: imranBarber.lunchBreak,
      };

      const slots = generateTimeSlots(schedule, monday);
      expect(slots[0]).toBe("10:00");
      expect(slots[1]).toBe("10:20");
      expect(slots[slots.length - 1]).toBe("18:40");

      // Imran lunch break is 13:40 - 14:00
      expect(slots).toContain("13:20");
      expect(slots).not.toContain("13:40");
      expect(slots).toContain("14:00");
    });

    it("returns empty array for Imran on Tuesday (closed day)", () => {
      // 2026-05-05 is a Tuesday
      const tuesday = new Date(2026, 4, 5);
      const schedule = {
        barberId: "imran",
        workingHours: imranBarber.workingHours,
        lunchBreak: imranBarber.lunchBreak,
      };

      const slots = generateTimeSlots(schedule, tuesday);
      expect(slots).toEqual([]);
    });

    it("generates slots for Ali on Tuesday but returns empty array on Wednesday (closed day)", () => {
      // 2026-05-05 is a Tuesday (Ali works)
      const tuesday = new Date(2026, 4, 5);
      // 2026-05-06 is a Wednesday (Ali closed)
      const wednesday = new Date(2026, 4, 6);

      const schedule = {
        barberId: "ali",
        workingHours: aliBarber.workingHours,
        lunchBreak: aliBarber.lunchBreak,
      };

      const tueSlots = generateTimeSlots(schedule, tuesday);
      expect(tueSlots.length).toBeGreaterThan(0);
      expect(tueSlots[0]).toBe("10:00");
      // Ali lunch break is 14:00 - 14:20
      expect(tueSlots).toContain("13:40");
      expect(tueSlots).not.toContain("14:00");
      expect(tueSlots).toContain("14:20");

      const wedSlots = generateTimeSlots(schedule, wednesday);
      expect(wedSlots).toEqual([]);
    });

    it("returns empty array for both barbers on Sunday", () => {
      // 2026-05-10 is a Sunday
      const sunday = new Date(2026, 4, 10);
      const imranSlots = generateTimeSlots(
        { barberId: "imran", workingHours: imranBarber.workingHours, lunchBreak: imranBarber.lunchBreak },
        sunday
      );
      const aliSlots = generateTimeSlots(
        { barberId: "ali", workingHours: aliBarber.workingHours, lunchBreak: aliBarber.lunchBreak },
        sunday
      );

      expect(imranSlots).toEqual([]);
      expect(aliSlots).toEqual([]);
    });
  });

  describe("generateTimeSlots - Friday Special Rules & Closure", () => {
    it("excludes slots between 12:20 and 14:00 on Fridays for Imran", () => {
      // 2026-05-08 is a Friday
      const friday = new Date(2026, 4, 8);
      const schedule = {
        barberId: "imran",
        workingHours: imranBarber.workingHours,
        lunchBreak: imranBarber.lunchBreak,
      };

      const slots = generateTimeSlots(schedule, friday);

      expect(slots).toContain("12:00"); // ends at 12:20, valid
      expect(slots).not.toContain("12:20");
      expect(slots).not.toContain("12:40");
      expect(slots).not.toContain("13:00");
      expect(slots).not.toContain("13:20");
      expect(slots).not.toContain("13:40");
      expect(slots).toContain("14:00"); // resumes at 14:00
    });

    it("handles Ali's Friday rule: skips 12:20-14:00 closure but preserves 14:00 slot (isAliFriday exemption)", () => {
      // 2026-05-08 is a Friday
      const friday = new Date(2026, 4, 8);
      const schedule = {
        barberId: "ali",
        workingHours: aliBarber.workingHours,
        lunchBreak: aliBarber.lunchBreak,
      };

      const slots = generateTimeSlots(schedule, friday);

      // Friday prayer closure excluded
      expect(slots).toContain("12:00");
      expect(slots).not.toContain("12:20");
      expect(slots).not.toContain("12:40");
      expect(slots).not.toContain("13:00");
      expect(slots).not.toContain("13:20");
      expect(slots).not.toContain("13:40");

      // Ali does not take 14:00-14:20 lunch break on Friday
      expect(slots).toContain("14:00");
      expect(slots).toContain("14:20");
    });
  });

  describe("generateTimeSlots - Date Overrides", () => {
    it("respects custom working hours on a specific date", () => {
      const customDate = new Date(2026, 4, 4); // Monday
      const customSchedule = {
        barberId: "imran",
        workingHours: {
          mon: { start: "11:00", end: "15:00" },
        },
        lunchBreak: null,
      };

      const slots = generateTimeSlots(customSchedule, customDate);
      expect(slots[0]).toBe("11:00");
      expect(slots[slots.length - 1]).toBe("14:40"); // 14:40 + 20 = 15:00
      expect(slots).not.toContain("10:40");
      expect(slots).not.toContain("15:00");
    });

    it("respects day-off override for an otherwise working day", () => {
      const monday = new Date(2026, 4, 4);
      const schedule = {
        barberId: "imran",
        workingHours: { mon: null },
        lunchBreak: null,
      };

      const slots = generateTimeSlots(schedule, monday);
      expect(slots).toEqual([]);
    });

    it("respects custom lunch break override", () => {
      const monday = new Date(2026, 4, 4);
      const schedule = {
        barberId: "imran",
        workingHours: { mon: { start: "10:00", end: "16:00" } },
        lunchBreak: { start: "12:00", end: "13:00" },
      };

      const slots = generateTimeSlots(schedule, monday);
      expect(slots).toContain("11:40");
      expect(slots).not.toContain("12:00");
      expect(slots).not.toContain("12:20");
      expect(slots).not.toContain("12:40");
      expect(slots).toContain("13:00");
    });
  });

  describe("getAvailableSlots - Availability and Filtering", () => {
    let originalFetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
      vi.useRealTimers();
    });

    it("filters out booked and blocked slots for a future date", async () => {
      const testDate = new Date(2026, 4, 18); // Monday May 18, 2026
      const dateString = "2026-05-18";

      // Mock Firestore REST responses
      global.fetch = vi.fn((url, options) => {
        const urlStr = String(url);

        // Schedule lookup (return 404 to fall back to static config)
        if (urlStr.includes("barberSchedules") || urlStr.includes("dateSchedules")) {
          return Promise.resolve({
            ok: false,
            status: 404,
            statusText: "Not Found",
          });
        }

        // RunQuery: appointments or blockedSlots
        if (urlStr.includes(":runQuery")) {
          const body = JSON.parse(options.body);
          const colId = body.structuredQuery.from[0].collectionId;

          if (colId === "appointments") {
            // "10:20" is confirmed booked
            return Promise.resolve({
              ok: true,
              json: async () => [
                {
                  document: {
                    name: "projects/test/databases/(default)/documents/appointments/appt1",
                    fields: {
                      time: { stringValue: "10:20" },
                      status: { stringValue: "confirmed" },
                    },
                  },
                },
              ],
            });
          }

          if (colId === "blockedSlots") {
            // "11:00" is blocked
            return Promise.resolve({
              ok: true,
              json: async () => [
                {
                  document: {
                    name: "projects/test/databases/(default)/documents/blockedSlots/block1",
                    fields: {
                      time: { stringValue: "11:00" },
                    },
                  },
                },
              ],
            });
          }
        }

        return Promise.resolve({ ok: true, json: async () => [] });
      });

      const slots = await getAvailableSlots("imran", testDate);

      const slot1000 = slots.find((s) => s.time === "10:00");
      const slot1020 = slots.find((s) => s.time === "10:20");
      const slot1100 = slots.find((s) => s.time === "11:00");

      expect(slot1000.available).toBe(true);
      expect(slot1020.available).toBe(false); // Booked
      expect(slot1100.available).toBe(false); // Blocked
    });

    it("marks slots within the next 1 hour as unavailable if date is today", async () => {
      // Freeze time at 11:15 on May 18, 2026
      const fixedNow = new Date(2026, 4, 18, 11, 15, 0);
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);

      const today = new Date(2026, 4, 18);

      global.fetch = vi.fn((url) => {
        const urlStr = String(url);
        if (urlStr.includes("barberSchedules") || urlStr.includes("dateSchedules")) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });

      const slots = await getAvailableSlots("imran", today);

      // Now is 11:15. One hour from now is 12:15.
      // 10:00, 10:20, 10:40, 11:00 are in the past -> unavailable
      // 11:20, 11:40, 12:00 are within the 1-hour window (<= 12:15) -> unavailable
      // 12:20 onwards (> 12:15) -> available
      const slot1040 = slots.find((s) => s.time === "10:40");
      const slot1120 = slots.find((s) => s.time === "11:20");
      const slot1200 = slots.find((s) => s.time === "12:00");
      const slot1220 = slots.find((s) => s.time === "12:20");

      expect(slot1040.available).toBe(false);
      expect(slot1120.available).toBe(false);
      expect(slot1200.available).toBe(false);
      expect(slot1220.available).toBe(true);
    });
  });
});
