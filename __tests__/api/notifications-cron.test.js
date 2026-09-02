import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST as confirmationPost } from "@/app/api/send-confirmation/route";
import { POST as cancellationPost } from "@/app/api/admin/send-cancellation/route";
import { POST as blastPost } from "@/app/api/admin/send-blast/route";
import { GET as remindersGet } from "@/app/api/cron/send-reminders/route";
import { GET as availableSlotsGet } from "@/app/api/available-slots/route";
import * as appointments from "@/lib/appointments";

vi.mock("@/lib/appointments", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getAvailableSlots: vi.fn(),
  };
});

describe("Notifications, Admin Messaging & Cron Jobs", () => {
  let originalFetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  // ==========================================================================
  // POST /api/send-confirmation
  // ==========================================================================
  describe("POST /api/send-confirmation", () => {
    function createConfirmRequest(body) {
      return new Request("http://localhost:3000/api/send-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    const validBody = {
      email: "customer@example.com",
      name: "Sam",
      barberId: "imran",
      date: "2026-05-18",
      time: "14:20",
      appointmentId: "appt_123",
      managementToken: "token_abc123",
    };

    it("returns 400 if required fields are missing", async () => {
      const res = await confirmationPost(createConfirmRequest({ name: "Sam" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Missing required fields");
    });

    it("skips sending if RESEND_API_KEY is not set", async () => {
      const origKey = process.env.RESEND_API_KEY;
      delete process.env.RESEND_API_KEY;

      const res = await confirmationPost(createConfirmRequest(validBody));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toContain("Email skipped");

      process.env.RESEND_API_KEY = origKey;
    });

    it("successfully sends HTML confirmation email with manage link via Resend API", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "msg_resend_999" }),
      });

      const res = await confirmationPost(createConfirmRequest(validBody));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.id).toBe("msg_resend_999");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.resend.com/emails",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Manage Appointment"),
        })
      );
    });
  });

  // ==========================================================================
  // POST /api/admin/send-cancellation
  // ==========================================================================
  describe("POST /api/admin/send-cancellation", () => {
    function createRequest(body, token = "valid_admin_token") {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      return new Request("http://localhost:3000/api/admin/send-cancellation", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    }

    const cancelPayload = {
      customerName: "Charlie",
      customerPhone: "07123456789",
      customerEmail: "charlie@example.com",
      barberId: "imran",
      date: "2026-05-18",
      time: "15:00",
    };

    it("returns 401/403 for unauthorized requests", async () => {
      const res1 = await cancellationPost(createRequest(cancelPayload, null));
      expect(res1.status).toBe(401);

      // Mock non-admin
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ users: [{ email: "notadmin@example.com" }] }),
      });
      const res2 = await cancellationPost(createRequest(cancelPayload));
      expect(res2.status).toBe(403);
    });

    it("returns 400 if required fields are missing", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ users: [{ email: "aneesimran@outlook.com" }] }),
      });

      const res = await cancellationPost(createRequest({ customerName: "Charlie" }));
      expect(res.status).toBe(400);
    });

    it("sends both SMS and email notifications on cancellation", async () => {
      global.fetch = vi.fn((url) => {
        const urlStr = String(url);
        if (urlStr.includes("identitytoolkit")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ users: [{ email: "aneesimran@outlook.com" }] }),
          });
        }
        if (urlStr.includes("api.twilio.com")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ sid: "SM_mock_sid" }),
          });
        }
        if (urlStr.includes("api.resend.com")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ id: "re_mock_id" }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      const res = await cancellationPost(createRequest(cancelPayload));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.smsSent).toBe(true);
      expect(data.emailSent).toBe(true);
    });
  });

  // ==========================================================================
  // POST /api/admin/send-blast
  // ==========================================================================
  describe("POST /api/admin/send-blast", () => {
    function createBlastRequest(body, token = "valid_admin_token") {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      return new Request("http://localhost:3000/api/admin/send-blast", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    }

    it("returns 400 if message, channels, or recipients are missing", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ users: [{ email: "aneesimran@outlook.com" }] }),
      });

      const res = await blastPost(createBlastRequest({ message: "Hello" }));
      expect(res.status).toBe(400);
    });

    it("batches notifications to multiple recipients across SMS and email", async () => {
      global.fetch = vi.fn((url) => {
        const urlStr = String(url);
        if (urlStr.includes("identitytoolkit")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ users: [{ email: "aneesimran@outlook.com" }] }),
          });
        }
        if (urlStr.includes("api.twilio.com")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ sid: "SM_twilio_sid" }),
          });
        }
        if (urlStr.includes("api.resend.com")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ id: "re_email_id" }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      const blastBody = {
        message: "Shop will be closed this bank holiday Monday.",
        channels: ["sms", "email"],
        recipients: [
          { name: "User 1", phone: "07111111111", email: "user1@example.com" },
          { name: "User 2", phone: "07222222222", email: "user2@example.com" },
        ],
      };

      const res = await blastPost(createBlastRequest(blastBody));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.results.length).toBe(2);
      expect(data.results[0].smsSuccess).toBe(true);
      expect(data.results[0].emailSuccess).toBe(true);
    });
  });

  // ==========================================================================
  // GET /api/available-slots
  // ==========================================================================
  describe("GET /api/available-slots", () => {
    function createRequest(barberId, date) {
      const url = new URL("http://localhost:3000/api/available-slots");
      if (barberId !== undefined) url.searchParams.set("barberId", barberId);
      if (date !== undefined) url.searchParams.set("date", date);
      return { nextUrl: url };
    }

    it("returns 400 if barberId or date is missing", async () => {
      const res1 = await availableSlotsGet(createRequest(undefined, "2026-05-18"));
      expect(res1.status).toBe(400);

      const res2 = await availableSlotsGet(createRequest("imran", undefined));
      expect(res2.status).toBe(400);
    });

    it("returns 400 if date format is invalid", async () => {
      const res = await availableSlotsGet(createRequest("imran", "invalid-date"));
      expect(res.status).toBe(400);
    });

    it("returns available slots with no-cache header", async () => {
      appointments.getAvailableSlots.mockResolvedValue([
        { time: "10:00", available: true },
        { time: "10:20", available: false },
      ]);

      const res = await availableSlotsGet(createRequest("imran", "2026-05-18"));
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0, must-revalidate");

      const data = await res.json();
      expect(data.slots.length).toBe(2);
      expect(data.barberId).toBe("imran");
      expect(data.date).toBe("2026-05-18");
    });
  });

  // ==========================================================================
  // GET /api/cron/send-reminders
  // ==========================================================================
  describe("GET /api/cron/send-reminders", () => {
    function createCronRequest(secret) {
      const url = new URL("http://localhost:3000/api/cron/send-reminders");
      if (secret !== undefined) url.searchParams.set("secret", secret);
      return { nextUrl: url };
    }

    it("returns 401 if secret does not match CRON_SECRET", async () => {
      const res = await remindersGet(createCronRequest("wrong-secret"));
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("scans today's appointments and only triggers for confirmed unreminded slots within 150 minutes", async () => {
      // Freeze time at 10:00 on May 18, 2026
      const fixedTime = new Date(2026, 4, 18, 10, 0, 0);
      vi.useFakeTimers();
      vi.setSystemTime(fixedTime);

      const appointmentsMock = [
        // Slot 1: Starts at 11:30 (90 mins away -> WITHIN 150 min window) -> REMIND
        {
          document: {
            name: "projects/test/databases/(default)/documents/appointments/appt_due",
            fields: {
              status: { stringValue: "confirmed" },
              reminderSent: { booleanValue: false },
              time: { stringValue: "11:30" },
              customerId: { stringValue: "cust_due" },
              barberId: { stringValue: "imran" },
            },
          },
        },
        // Slot 2: Starts at 14:00 (240 mins away -> OUTSIDE 150 min window) -> SKIP
        {
          document: {
            name: "projects/test/databases/(default)/documents/appointments/appt_future",
            fields: {
              status: { stringValue: "confirmed" },
              reminderSent: { booleanValue: false },
              time: { stringValue: "14:00" },
              customerId: { stringValue: "cust_future" },
              barberId: { stringValue: "imran" },
            },
          },
        },
        // Slot 3: Starts at 11:00 (60 mins away) but reminder ALREADY sent -> SKIP
        {
          document: {
            name: "projects/test/databases/(default)/documents/appointments/appt_reminded",
            fields: {
              status: { stringValue: "confirmed" },
              reminderSent: { booleanValue: true },
              time: { stringValue: "11:00" },
              customerId: { stringValue: "cust_done" },
              barberId: { stringValue: "imran" },
            },
          },
        },
        // Slot 4: Starts at 09:30 (in the past) -> SKIP
        {
          document: {
            name: "projects/test/databases/(default)/documents/appointments/appt_past",
            fields: {
              status: { stringValue: "confirmed" },
              reminderSent: { booleanValue: false },
              time: { stringValue: "09:30" },
              customerId: { stringValue: "cust_past" },
              barberId: { stringValue: "imran" },
            },
          },
        },
      ];

      global.fetch = vi.fn((url) => {
        const urlStr = String(url);

        // Run query for appointments
        if (urlStr.includes(":runQuery")) {
          return Promise.resolve({
            ok: true,
            json: async () => appointmentsMock,
          });
        }

        // Fetch customer
        if (urlStr.includes("customers/cust_due")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              fields: {
                name: { stringValue: "Due Customer" },
                phone: { stringValue: "07123456789" },
              },
            }),
          });
        }

        // Twilio SMS
        if (urlStr.includes("api.twilio.com")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ sid: "SM_reminder_sent" }),
          });
        }

        // Firestore PATCH update
        if (urlStr.includes("updateMask.fieldPaths=reminderSent")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({}),
          });
        }

        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      const res = await remindersGet(createCronRequest("test-cron-secret"));
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.sentCount).toBe(1); // Exactly 1 reminder sent!
      expect(data.errors).toEqual([]);

      // Verify Twilio SMS was called
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("api.twilio.com"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("To=07123456789"),
        })
      );

      // Verify Firestore PATCH was called to mark reminderSent: true
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("appointments/appt_due?updateMask.fieldPaths=reminderSent"),
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"reminderSent":{"booleanValue":true}'),
        })
      );
    });
  });
});
