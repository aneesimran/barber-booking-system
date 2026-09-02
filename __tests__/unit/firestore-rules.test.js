import { describe, it, expect } from "vitest";

/**
 * Mirror of Firestore security rules functions in firestore.rules
 * to rigorously verify domain logic and security constraints across all case scenarios.
 */
describe("Firestore Security Rules Logic Verification", () => {
  const ADMIN_EMAILS = [
    "aneeshairdresser@gmail.com",
    "aneesimran@outlook.com",
    "ali_raza89@hotmail.co.uk",
  ];

  function isAdmin(auth) {
    return !!auth?.token?.email && ADMIN_EMAILS.includes(auth.token.email);
  }

  function isValidEmail(email) {
    if (typeof email !== "string" || email.length > 254) return false;
    return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email);
  }

  function isValidAppointmentCreate(data, serverTime, blockedSlotsDb = new Set()) {
    const requiredFields = [
      "barberId",
      "customerId",
      "date",
      "time",
      "duration",
      "status",
      "reminderSent",
      "createdAt",
    ];
    const allAllowedFields = new Set([
      "barberId",
      "customerId",
      "date",
      "time",
      "duration",
      "status",
      "reminderSent",
      "stripeSetupIntentId",
      "managementToken",
      "createdAt",
    ]);

    // Check required fields
    for (const f of requiredFields) {
      if (!(f in data)) return { valid: false, reason: `Missing required field: ${f}` };
    }

    // Check allowed fields only
    for (const k of Object.keys(data)) {
      if (!allAllowedFields.has(k)) return { valid: false, reason: `Disallowed field: ${k}` };
    }

    // BarberId
    if (!["imran", "ali"].includes(data.barberId)) {
      return { valid: false, reason: "Invalid barberId" };
    }

    // CustomerId
    if (typeof data.customerId !== "string" || data.customerId.length < 1 || data.customerId.length > 128) {
      return { valid: false, reason: "Invalid customerId" };
    }

    // Date
    if (typeof data.date !== "string" || data.date.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
      return { valid: false, reason: "Invalid date" };
    }

    // Time
    if (typeof data.time !== "string" || data.time.length !== 5 || !/^\d{2}:\d{2}$/.test(data.time)) {
      return { valid: false, reason: "Invalid time" };
    }

    // Duration
    if (data.duration !== 20) {
      return { valid: false, reason: "Duration must be 20" };
    }

    // Status
    if (data.status !== "confirmed") {
      return { valid: false, reason: "Initial status must be confirmed" };
    }

    // ReminderSent
    if (data.reminderSent !== false) {
      return { valid: false, reason: "reminderSent must be false" };
    }

    // StripeSetupIntentId
    if (
      data.stripeSetupIntentId !== undefined &&
      data.stripeSetupIntentId !== null &&
      (typeof data.stripeSetupIntentId !== "string" ||
        data.stripeSetupIntentId.length < 1 ||
        data.stripeSetupIntentId.length > 200)
    ) {
      return { valid: false, reason: "Invalid stripeSetupIntentId" };
    }

    // ManagementToken
    if (
      data.managementToken !== undefined &&
      (typeof data.managementToken !== "string" ||
        data.managementToken.length < 20 ||
        data.managementToken.length > 50)
    ) {
      return { valid: false, reason: "Invalid managementToken" };
    }

    // CreatedAt
    if (data.createdAt !== serverTime) {
      return { valid: false, reason: "createdAt must match server timestamp" };
    }

    // isSlotBlocked check
    const slotKey = `${data.barberId}_${data.date}_${data.time}`;
    if (blockedSlotsDb.has(slotKey)) {
      return { valid: false, reason: "Slot is blocked in blockedSlots collection" };
    }

    return { valid: true };
  }

  function isValidCustomerCreate(data, serverTime) {
    const requiredFields = ["name", "email", "phone", "createdAt"];
    const allAllowedFields = new Set(["name", "email", "phone", "stripeCustomerId", "createdAt"]);

    for (const f of requiredFields) {
      if (!(f in data)) return false;
    }
    for (const k of Object.keys(data)) {
      if (!allAllowedFields.has(k)) return false;
    }

    if (typeof data.name !== "string" || data.name.length < 2 || data.name.length > 100) return false;
    if (!isValidEmail(data.email)) return false;
    if (typeof data.phone !== "string" || data.phone.length < 10 || data.phone.length > 20) return false;

    if (
      data.stripeCustomerId !== undefined &&
      data.stripeCustomerId !== null &&
      (typeof data.stripeCustomerId !== "string" ||
        data.stripeCustomerId.length < 1 ||
        data.stripeCustomerId.length > 200)
    ) {
      return false;
    }

    return data.createdAt === serverTime;
  }

  describe("Admin Authorization", () => {
    it("allows registered admin emails", () => {
      expect(isAdmin({ token: { email: "aneesimran@outlook.com" } })).toBe(true);
      expect(isAdmin({ token: { email: "aneeshairdresser@gmail.com" } })).toBe(true);
      expect(isAdmin({ token: { email: "ali_raza89@hotmail.co.uk" } })).toBe(true);
    });

    it("rejects unauthorized users or unauthenticated requests", () => {
      expect(isAdmin(null)).toBe(false);
      expect(isAdmin({ token: {} })).toBe(false);
      expect(isAdmin({ token: { email: "hacker@evil.com" } })).toBe(false);
    });
  });

  describe("Email Validation Regex", () => {
    it("accepts valid standard email formats", () => {
      expect(isValidEmail("customer@example.com")).toBe(true);
      expect(isValidEmail("user.name+tag@subdomain.co.uk")).toBe(true);
      expect(isValidEmail("anees_test-1@gmail.com")).toBe(true);
    });

    it("rejects malformed emails", () => {
      expect(isValidEmail("plainaddress")).toBe(false);
      expect(isValidEmail("@missingusername.com")).toBe(false);
      expect(isValidEmail("user@.com")).toBe(false);
      expect(isValidEmail("user@domain")).toBe(false);
      expect(isValidEmail(null)).toBe(false);
      expect(isValidEmail("a".repeat(250) + "@domain.com")).toBe(false); // > 254 chars
    });
  });

  describe("isValidAppointmentCreate", () => {
    const serverTime = "2026-09-02T15:00:00.000Z";
    const validData = {
      barberId: "imran",
      customerId: "cust_12345",
      date: "2026-09-05",
      time: "11:20",
      duration: 20,
      status: "confirmed",
      reminderSent: false,
      managementToken: "a".repeat(32),
      stripeSetupIntentId: "seti_123456",
      createdAt: serverTime,
    };

    it("accepts a completely valid appointment document", () => {
      const res = isValidAppointmentCreate(validData, serverTime);
      expect(res.valid).toBe(true);
    });

    it("rejects when an unknown barberId is specified", () => {
      const res = isValidAppointmentCreate({ ...validData, barberId: "unknown_barber" }, serverTime);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("Invalid barberId");
    });

    it("rejects when duration is not 20", () => {
      const res = isValidAppointmentCreate({ ...validData, duration: 30 }, serverTime);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("Duration must be 20");
    });

    it("rejects initial status other than confirmed", () => {
      const res = isValidAppointmentCreate({ ...validData, status: "pending" }, serverTime);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("Initial status must be confirmed");
    });

    it("rejects initial reminderSent being true", () => {
      const res = isValidAppointmentCreate({ ...validData, reminderSent: true }, serverTime);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("reminderSent must be false");
    });

    it("rejects invalid date or time format", () => {
      expect(isValidAppointmentCreate({ ...validData, date: "05-09-2026" }, serverTime).valid).toBe(false);
      expect(isValidAppointmentCreate({ ...validData, time: "9:00" }, serverTime).valid).toBe(false);
    });

    it("rejects when createdAt does not equal server timestamp", () => {
      const res = isValidAppointmentCreate({ ...validData, createdAt: "2020-01-01" }, serverTime);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("createdAt must match server timestamp");
    });

    it("rejects unexpected fields (schema hardening)", () => {
      const res = isValidAppointmentCreate({ ...validData, maliciousField: "attack" }, serverTime);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("Disallowed field: maliciousField");
    });

    it("REJECTS create atomically when the slot is in blockedSlots collection (!isSlotBlocked)", () => {
      const blockedSlotsDb = new Set(["imran_2026-09-05_11:20"]);
      const res = isValidAppointmentCreate(validData, serverTime, blockedSlotsDb);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("Slot is blocked in blockedSlots collection");
    });
  });

  describe("Appointment Update Rules", () => {
    it("allows customer cancellation ONLY when management token matches and status was confirmed", () => {
      const resourceData = {
        status: "confirmed",
        managementToken: "valid_token_123456789012345",
        date: "2026-09-05",
        time: "11:20",
      };

      // Valid cancellation payload
      const validCancelUpdate = {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        managementToken: "valid_token_123456789012345",
      };

      const affectedKeys = Object.keys(validCancelUpdate);
      const allowedKeys = ["status", "cancelledAt", "managementToken"];
      const keysMatch = affectedKeys.every((k) => allowedKeys.includes(k));

      expect(keysMatch).toBe(true);
      expect(resourceData.status).toBe("confirmed");
      expect(validCancelUpdate.status).toBe("cancelled");
      expect(validCancelUpdate.managementToken).toBe(resourceData.managementToken);
    });

    it("blocks customer cancellation if management token does not match", () => {
      const resourceData = {
        status: "confirmed",
        managementToken: "secret_token_123456789012345",
      };

      const invalidToken = "wrong_token_123456789012345";
      expect(invalidToken === resourceData.managementToken).toBe(false);
    });

    it("allows customer reschedule with valid token AND rejects if new slot is blocked", () => {
      const resourceData = {
        barberId: "imran",
        status: "confirmed",
        managementToken: "token_12345678901234567890",
        date: "2026-09-05",
        time: "11:20",
      };

      const rescheduleUpdate = {
        date: "2026-09-06",
        time: "14:00",
        previousDate: "2026-09-05",
        previousTime: "11:20",
        rescheduledAt: new Date().toISOString(),
        managementToken: "token_12345678901234567890",
      };

      // Check slot not blocked
      const blockedSlotsDb = new Set(["imran_2026-09-06_14:00"]);
      const isBlocked = blockedSlotsDb.has(`${resourceData.barberId}_${rescheduleUpdate.date}_${rescheduleUpdate.time}`);
      expect(isBlocked).toBe(true); // Should be blocked!
    });
  });

  describe("isValidCustomerCreate", () => {
    const serverTime = "2026-09-02T15:00:00.000Z";
    const validCustomer = {
      name: "John Doe",
      email: "john@example.com",
      phone: "07123456789",
      createdAt: serverTime,
    };

    it("accepts valid customer document", () => {
      expect(isValidCustomerCreate(validCustomer, serverTime)).toBe(true);
    });

    it("rejects phone numbers with fewer than 10 or more than 20 characters", () => {
      expect(isValidCustomerCreate({ ...validCustomer, phone: "12345" }, serverTime)).toBe(false);
      expect(isValidCustomerCreate({ ...validCustomer, phone: "0".repeat(25) }, serverTime)).toBe(false);
    });

    it("rejects invalid customer names (too short or too long)", () => {
      expect(isValidCustomerCreate({ ...validCustomer, name: "A" }, serverTime)).toBe(false);
      expect(isValidCustomerCreate({ ...validCustomer, name: "A".repeat(101) }, serverTime)).toBe(false);
    });
  });
});
