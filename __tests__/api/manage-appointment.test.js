import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET as manageGet } from "@/app/api/manage-appointment/route";
import { POST as cancelPost } from "@/app/api/manage-appointment/cancel/route";
import { POST as reschedulePost } from "@/app/api/manage-appointment/reschedule/route";
import * as appointments from "@/lib/appointments";

vi.mock("@/lib/appointments", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getAppointmentByIdRest: vi.fn(),
    getCustomerByIdRest: vi.fn(),
    updateAppointmentRest: vi.fn(),
    isSlotBlocked: vi.fn(),
    getBookedSlots: vi.fn(),
    getBlockedSlots: vi.fn(),
    getBarberScheduleForDate: vi.fn(),
  };
});

describe("Manage Appointment Endpoints", () => {
  const MOCK_TOKEN = "valid-management-token-1234567890";
  let originalFetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email_123" }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  // ==========================================================================
  // GET /api/manage-appointment
  // ==========================================================================
  describe("GET /api/manage-appointment", () => {
    function createGetRequest(id, token) {
      const url = new URL("http://localhost:3000/api/manage-appointment");
      if (id !== undefined) url.searchParams.set("id", id);
      if (token !== undefined) url.searchParams.set("token", token);
      return { nextUrl: url };
    }

    it("returns 400 if id or token is missing", async () => {
      const res1 = await manageGet(createGetRequest(undefined, MOCK_TOKEN));
      expect(res1.status).toBe(400);

      const res2 = await manageGet(createGetRequest("appt1", undefined));
      expect(res2.status).toBe(400);
    });

    it("returns 404 if appointment does not exist", async () => {
      appointments.getAppointmentByIdRest.mockResolvedValue(null);

      const res = await manageGet(createGetRequest("appt1", MOCK_TOKEN));
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Appointment not found");
    });

    it("returns 403 if management token does not match", async () => {
      appointments.getAppointmentByIdRest.mockResolvedValue({
        id: "appt1",
        managementToken: "different-token",
      });

      const res = await manageGet(createGetRequest("appt1", MOCK_TOKEN));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("Invalid management token");
    });

    it("returns appointment details with canModify=true if > 1 hour away", async () => {
      // Freeze time at 10:00 on May 18, 2026
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 4, 18, 10, 0, 0));

      appointments.getAppointmentByIdRest.mockResolvedValue({
        id: "appt1",
        barberId: "imran",
        customerId: "cust1",
        date: "2026-05-18",
        time: "14:00", // 4 hours away
        duration: 20,
        status: "confirmed",
        managementToken: MOCK_TOKEN,
      });
      appointments.getCustomerByIdRest.mockResolvedValue({
        id: "cust1",
        name: "Alice Smith",
      });

      const res = await manageGet(createGetRequest("appt1", MOCK_TOKEN));
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.canModify).toBe(true);
      expect(data.reason).toBeNull();
      expect(data.appointment.barberName).toBe("Imran (Anees)");
      expect(data.appointment.customerName).toBe("Alice Smith");
      // Must not expose managementToken in response
      expect(data.appointment.managementToken).toBeUndefined();
    });

    it("returns canModify=false if appointment is less than 1 hour away", async () => {
      // Freeze time at 13:30 on May 18, 2026
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 4, 18, 13, 30, 0));

      appointments.getAppointmentByIdRest.mockResolvedValue({
        id: "appt1",
        barberId: "imran",
        customerId: "cust1",
        date: "2026-05-18",
        time: "14:00", // Only 30 minutes away
        status: "confirmed",
        managementToken: MOCK_TOKEN,
      });

      const res = await manageGet(createGetRequest("appt1", MOCK_TOKEN));
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.canModify).toBe(false);
      expect(data.reason).toBe("Appointment is less than 1 hour away");
    });

    it("returns canModify=false if appointment is cancelled", async () => {
      appointments.getAppointmentByIdRest.mockResolvedValue({
        id: "appt1",
        barberId: "imran",
        customerId: "cust1",
        date: "2026-05-18",
        time: "16:00",
        status: "cancelled",
        managementToken: MOCK_TOKEN,
      });

      const res = await manageGet(createGetRequest("appt1", MOCK_TOKEN));
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.canModify).toBe(false);
      expect(data.reason).toBe("Appointment is cancelled");
    });
  });

  // ==========================================================================
  // POST /api/manage-appointment/cancel
  // ==========================================================================
  describe("POST /api/manage-appointment/cancel", () => {
    function createCancelRequest(body) {
      return new Request("http://localhost:3000/api/manage-appointment/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    it("returns 400 if appointmentId or token is missing", async () => {
      const res = await cancelPost(createCancelRequest({ appointmentId: "appt1" }));
      expect(res.status).toBe(400);
    });

    it("returns 404 if appointment is not found", async () => {
      appointments.getAppointmentByIdRest.mockResolvedValue(null);
      const res = await cancelPost(createCancelRequest({ appointmentId: "appt1", token: MOCK_TOKEN }));
      expect(res.status).toBe(404);
    });

    it("returns 403 if token does not match", async () => {
      appointments.getAppointmentByIdRest.mockResolvedValue({
        id: "appt1",
        managementToken: "different-token",
      });
      const res = await cancelPost(createCancelRequest({ appointmentId: "appt1", token: MOCK_TOKEN }));
      expect(res.status).toBe(403);
    });

    it("returns 409 if appointment is already cancelled", async () => {
      appointments.getAppointmentByIdRest.mockResolvedValue({
        id: "appt1",
        status: "cancelled",
        managementToken: MOCK_TOKEN,
      });
      const res = await cancelPost(createCancelRequest({ appointmentId: "appt1", token: MOCK_TOKEN }));
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("Appointment is already cancelled");
    });

    it("returns 400 if cancellation is requested less than 1 hour before scheduled time", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 4, 18, 13, 15, 0)); // 13:15

      appointments.getAppointmentByIdRest.mockResolvedValue({
        id: "appt1",
        date: "2026-05-18",
        time: "14:00", // 45 mins away (<= 60 mins)
        status: "confirmed",
        managementToken: MOCK_TOKEN,
      });

      const res = await cancelPost(createCancelRequest({ appointmentId: "appt1", token: MOCK_TOKEN }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("at least 1 hour before");
      expect(appointments.updateAppointmentRest).not.toHaveBeenCalled();
    });

    it("successfully cancels appointment when >= 1 hour away and token is valid", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 4, 18, 10, 0, 0)); // 10:00

      appointments.getAppointmentByIdRest.mockResolvedValue({
        id: "appt1",
        date: "2026-05-18",
        time: "14:00", // 4 hours away
        status: "confirmed",
        managementToken: MOCK_TOKEN,
      });
      appointments.updateAppointmentRest.mockResolvedValue(true);

      const res = await cancelPost(createCancelRequest({ appointmentId: "appt1", token: MOCK_TOKEN }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      expect(appointments.updateAppointmentRest).toHaveBeenCalledWith(
        "appt1",
        expect.objectContaining({
          status: "cancelled",
          managementToken: MOCK_TOKEN,
        })
      );
    });
  });

  // ==========================================================================
  // POST /api/manage-appointment/reschedule
  // ==========================================================================
  describe("POST /api/manage-appointment/reschedule", () => {
    const validRescheduleBody = {
      appointmentId: "appt1",
      token: MOCK_TOKEN,
      newDate: "2026-05-20", // Wednesday
      newTime: "11:00",
    };

    function createRescheduleRequest(body) {
      return new Request("http://localhost:3000/api/manage-appointment/reschedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          host: "barber-booking-system.test",
        },
        body: JSON.stringify(body),
      });
    }

    beforeEach(() => {
      // Set current time to May 18, 2026 at 09:00 AM
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 4, 18, 9, 0, 0));

      appointments.getAppointmentByIdRest.mockResolvedValue({
        id: "appt1",
        barberId: "imran",
        customerId: "cust1",
        date: "2026-05-18",
        time: "14:00", // 5 hours away
        status: "confirmed",
        managementToken: MOCK_TOKEN,
      });
      appointments.getBarberScheduleForDate.mockResolvedValue({
        barberId: "imran",
        workingHours: {
          wed: { start: "10:00", end: "19:00" },
        },
        lunchBreak: { start: "13:40", end: "14:00" },
      });
      appointments.isSlotBlocked.mockResolvedValue(false);
      appointments.getBookedSlots.mockResolvedValue([]);
      appointments.getBlockedSlots.mockResolvedValue([]);
      appointments.updateAppointmentRest.mockResolvedValue(true);
      appointments.getCustomerByIdRest.mockResolvedValue({
        id: "cust1",
        name: "Alice",
        email: "alice@example.com",
      });
    });

    it("returns 400 for missing fields or bad date/time format", async () => {
      const res1 = await reschedulePost(createRescheduleRequest({ ...validRescheduleBody, newDate: "" }));
      expect(res1.status).toBe(400);

      const res2 = await reschedulePost(createRescheduleRequest({ ...validRescheduleBody, newDate: "20-05-2026" }));
      expect(res2.status).toBe(400);
      expect((await res2.json()).error).toContain("Invalid date format");

      const res3 = await reschedulePost(createRescheduleRequest({ ...validRescheduleBody, newTime: "11" }));
      expect(res3.status).toBe(400);
      expect((await res3.json()).error).toContain("Invalid time format");
    });

    it("returns 400 if current appointment is less than 1 hour away", async () => {
      // Current time: 13:15, appointment is at 14:00
      vi.setSystemTime(new Date(2026, 4, 18, 13, 15, 0));

      const res = await reschedulePost(createRescheduleRequest(validRescheduleBody));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("at least 1 hour before");
    });

    it("returns 400 if new date is in the past", async () => {
      const pastBody = { ...validRescheduleBody, newDate: "2026-05-17" }; // Yesterday
      const res = await reschedulePost(createRescheduleRequest(pastBody));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Cannot reschedule to a date in the past");
    });

    it("returns 400 if new slot is less than 1 hour from now on same day", async () => {
      // Set now to 10:00, target slot 10:40 (40 mins away)
      vi.setSystemTime(new Date(2026, 4, 18, 10, 0, 0));
      appointments.getBarberScheduleForDate.mockResolvedValue({
        barberId: "imran",
        workingHours: { mon: { start: "10:00", end: "19:00" } },
        lunchBreak: null,
      });

      const todayBody = { ...validRescheduleBody, newDate: "2026-05-18", newTime: "10:40" };
      const res = await reschedulePost(createRescheduleRequest(todayBody));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("New time must be at least 1 hour from now");
    });

    it("returns 400 if new time is outside barber working hours", async () => {
      const invalidSlotBody = { ...validRescheduleBody, newTime: "08:00" };
      const res = await reschedulePost(createRescheduleRequest(invalidSlotBody));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("The selected time is not a valid slot for this barber");
    });

    it("returns 409 if new slot is blocked", async () => {
      appointments.isSlotBlocked.mockResolvedValue(true);

      const res = await reschedulePost(createRescheduleRequest(validRescheduleBody));
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("The selected time slot is no longer available");
    });

    it("returns 409 if new slot is booked by someone else", async () => {
      appointments.getBookedSlots.mockResolvedValue(["11:00"]);

      const res = await reschedulePost(createRescheduleRequest(validRescheduleBody));
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("The selected time slot is no longer available");
    });

    it("handles same-day reschedule without current appointment blocking itself", async () => {
      // Moving from 14:00 to 16:00 on the same date 2026-05-18
      appointments.getBarberScheduleForDate.mockResolvedValue({
        barberId: "imran",
        workingHours: { mon: { start: "10:00", end: "19:00" } },
        lunchBreak: null,
      });

      // Existing booked slots on that day include current appointment (14:00)
      appointments.getBookedSlots.mockResolvedValue(["14:00"]);

      const sameDayBody = {
        ...validRescheduleBody,
        newDate: "2026-05-18",
        newTime: "16:00",
      };

      const res = await reschedulePost(createRescheduleRequest(sameDayBody));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.newDate).toBe("2026-05-18");
      expect(data.newTime).toBe("16:00");
    });

    it("successfully reschedules, updates Firestore, and dispatches confirmation email", async () => {
      const res = await reschedulePost(createRescheduleRequest(validRescheduleBody));
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.newDate).toBe("2026-05-20");
      expect(data.newTime).toBe("11:00");

      expect(appointments.updateAppointmentRest).toHaveBeenCalledWith(
        "appt1",
        expect.objectContaining({
          date: "2026-05-20",
          time: "11:00",
          previousDate: "2026-05-18",
          previousTime: "14:00",
          managementToken: MOCK_TOKEN,
        })
      );

      // Verify email dispatched via Resend fetch
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.resend.com/emails",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: expect.stringContaining("re_test_mock_resend_key"),
          }),
        })
      );
    });
  });
});
