import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/confirm-booking/route";
import * as appointments from "@/lib/appointments";

vi.mock("@/lib/appointments", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isSlotBlocked: vi.fn(),
    getBarberScheduleForDate: vi.fn(),
    getBookedSlots: vi.fn(),
    getBlockedSlots: vi.fn(),
    createOrFindCustomer: vi.fn(),
    createAppointment: vi.fn(),
  };
});

describe("POST /api/confirm-booking", () => {
  const validPayload = {
    barberId: "imran",
    date: "2026-05-18", // Monday
    time: "11:00",
    name: "John Smith",
    email: "john@example.com",
    phone: "07123456789",
    stripeSetupIntentId: "seti_123",
    stripeCustomerId: "cus_123",
  };

  function createRequest(body) {
    return new Request("http://localhost:3000/api/confirm-booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock behaviors for a successful flow
    appointments.isSlotBlocked.mockResolvedValue(false);
    appointments.getBarberScheduleForDate.mockResolvedValue({
      barberId: "imran",
      workingHours: {
        mon: { start: "10:00", end: "19:00" },
      },
      lunchBreak: { start: "13:40", end: "14:00" },
    });
    appointments.getBookedSlots.mockResolvedValue([]);
    appointments.getBlockedSlots.mockResolvedValue([]);
    appointments.createOrFindCustomer.mockResolvedValue("cust_doc_123");
    appointments.createAppointment.mockResolvedValue("appt_doc_456");
  });

  describe("Required Fields & Mobile Number Validation", () => {
    it("returns 400 if any required field is missing", async () => {
      const requiredFields = ["barberId", "date", "time", "name", "email", "phone"];

      for (const field of requiredFields) {
        const payload = { ...validPayload };
        delete payload[field];

        const res = await POST(createRequest(payload));
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toBe("All fields are required");
      }
    });

    it("returns 400 for invalid UK mobile numbers", async () => {
      const invalidPhones = [
        "01211234567", // Landline
        "071234567", // Too short (8 digits after 07)
        "0712345678901", // Too long
        "+14155552671", // US number
        "abcdefghijk", // Non-digits
      ];

      for (const phone of invalidPhones) {
        const res = await POST(createRequest({ ...validPayload, phone }));
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toBe("Invalid UK mobile number");
      }
    });

    it("accepts valid UK mobile numbers with +44 prefix or spaces", async () => {
      const validPhones = [
        "07123456789",
        "+447123456789",
        "07123 456 789",
        "+44 7123 456 789",
      ];

      for (const phone of validPhones) {
        const res = await POST(createRequest({ ...validPayload, phone }));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
      }
    });
  });

  describe("Availability & Conflict Prevention", () => {
    it("returns 409 if the slot is directly blocked via isSlotBlocked", async () => {
      appointments.isSlotBlocked.mockResolvedValue(true);

      const res = await POST(createRequest(validPayload));
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("This time slot is no longer available. Please select another.");
      expect(appointments.createAppointment).not.toHaveBeenCalled();
    });

    it("returns 409 if the slot is outside working hours for this barber", async () => {
      const res = await POST(createRequest({ ...validPayload, time: "09:00" })); // Opens at 10:00
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("This time slot is not within working hours. Please select another.");
      expect(appointments.createAppointment).not.toHaveBeenCalled();
    });

    it("returns 409 if slot overlaps with barber's lunch break", async () => {
      const res = await POST(createRequest({ ...validPayload, time: "13:40" })); // Imran lunch
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("This time slot is not within working hours. Please select another.");
    });

    it("returns 409 if slot has just been booked by another customer", async () => {
      appointments.getBookedSlots.mockResolvedValue(["11:00"]);

      const res = await POST(createRequest(validPayload));
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("This time slot has just been booked. Please select another.");
      expect(appointments.createAppointment).not.toHaveBeenCalled();
    });

    it("returns 409 if slot is in blockedSlots collection", async () => {
      appointments.getBlockedSlots.mockResolvedValue(["11:00"]);

      const res = await POST(createRequest(validPayload));
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("This time slot is no longer available. Please select another.");
      expect(appointments.createAppointment).not.toHaveBeenCalled();
    });
  });

  describe("Successful Booking Execution", () => {
    it("creates customer and appointment when all checks pass", async () => {
      const res = await POST(createRequest(validPayload));
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.appointmentId).toBe("appt_doc_456");
      expect(data.message).toBe("Booking confirmed!");

      expect(appointments.createOrFindCustomer).toHaveBeenCalledWith({
        name: validPayload.name,
        email: validPayload.email,
        phone: validPayload.phone,
        stripeCustomerId: validPayload.stripeCustomerId,
      });

      expect(appointments.createAppointment).toHaveBeenCalledWith({
        barberId: validPayload.barberId,
        customerId: "cust_doc_123",
        date: validPayload.date,
        time: validPayload.time,
        stripeSetupIntentId: validPayload.stripeSetupIntentId,
      });
    });

    it("handles null stripe details gracefully", async () => {
      const payloadWithoutStripe = {
        ...validPayload,
        stripeSetupIntentId: null,
        stripeCustomerId: null,
      };

      const res = await POST(createRequest(payloadWithoutStripe));
      expect(res.status).toBe(200);

      expect(appointments.createOrFindCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ stripeCustomerId: null })
      );
      expect(appointments.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ stripeSetupIntentId: null })
      );
    });
  });

  describe("Error Handling", () => {
    it("returns 500 when an unexpected database exception occurs", async () => {
      appointments.getBookedSlots.mockRejectedValue(new Error("Firestore connection lost"));

      const res = await POST(createRequest(validPayload));
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("Failed to confirm booking. Please try again.");
    });
  });
});
