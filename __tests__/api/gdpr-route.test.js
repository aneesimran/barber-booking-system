import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockStripeInstance } = vi.hoisted(() => {
  return {
    mockStripeInstance: {
      customers: {
        retrieve: vi.fn(),
        list: vi.fn(),
        del: vi.fn(),
      },
      paymentMethods: {
        list: vi.fn(),
      },
    },
  };
});

vi.mock("stripe", () => {
  return {
    default: class MockStripe {
      constructor() {
        return mockStripeInstance;
      }
    },
  };
});

import { GET as gdprGet, POST as gdprPost } from "@/app/api/admin/gdpr/route";

describe("GDPR Admin API (/api/admin/gdpr)", () => {
  let originalFetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockAdminAuth(email = "aneesimran@outlook.com") {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        users: [{ email }],
      }),
    });
  }

  describe("GET /api/admin/gdpr (Subject Access & Stripe Footprint)", () => {
    it("returns 401 if authorization token is missing", async () => {
      const req = new Request("http://localhost:3000/api/admin/gdpr?email=test@example.com");
      const res = await gdprGet(req);
      expect(res.status).toBe(401);
    });

    it("returns 403 if authenticated user is not an admin", async () => {
      mockAdminAuth("not_an_admin@example.com");
      const req = new Request("http://localhost:3000/api/admin/gdpr?email=test@example.com", {
        headers: { Authorization: "Bearer valid_token" },
      });
      const res = await gdprGet(req);
      expect(res.status).toBe(403);
    });

    it("returns 400 if neither stripeCustomerId nor email is provided", async () => {
      mockAdminAuth();
      const req = new Request("http://localhost:3000/api/admin/gdpr", {
        headers: { Authorization: "Bearer valid_token" },
      });
      const res = await gdprGet(req);
      expect(res.status).toBe(400);
    });

    it("retrieves Stripe customer and vaulted card details for SAR export", async () => {
      mockAdminAuth();
      mockStripeInstance.customers.retrieve.mockResolvedValue({
        id: "cus_gdpr_123",
        name: "John Smith",
        email: "john@example.com",
        phone: "07700900123",
        created: 1720000000,
      });
      mockStripeInstance.customers.list.mockResolvedValue({
        data: [
          {
            id: "cus_gdpr_123",
            name: "John Smith",
            email: "john@example.com",
            phone: "07700900123",
            created: 1720000000,
          },
        ],
      });
      mockStripeInstance.paymentMethods.list.mockResolvedValue({
        data: [
          {
            id: "pm_123",
            created: 1720000050,
            card: {
              brand: "visa",
              last4: "4242",
              exp_month: 8,
              exp_year: 2029,
            },
          },
        ],
      });

      const req = new Request(
        "http://localhost:3000/api/admin/gdpr?stripeCustomerId=cus_gdpr_123&email=john@example.com",
        {
          headers: { Authorization: "Bearer valid_token" },
        }
      );
      const res = await gdprGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.stripeRecords).toHaveLength(1);
      expect(data.stripeRecords[0].id).toBe("cus_gdpr_123");
      expect(data.stripeRecords[0].cards).toEqual([
        expect.objectContaining({
          id: "pm_123",
          brand: "visa",
          last4: "4242",
          expMonth: 8,
          expYear: 2029,
        }),
      ]);
    });
  });

  describe("POST /api/admin/gdpr (Right to Erasure)", () => {
    it("returns 401 if authorization token is missing", async () => {
      const req = new Request("http://localhost:3000/api/admin/gdpr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stripeCustomerId: "cus_123" }),
      });
      const res = await gdprPost(req);
      expect(res.status).toBe(401);
    });

    it("deletes Stripe customer records by ID and email lookup", async () => {
      mockAdminAuth();
      mockStripeInstance.customers.list.mockResolvedValue({
        data: [{ id: "cus_123" }, { id: "cus_duplicate_456" }],
      });
      mockStripeInstance.customers.del.mockResolvedValue({ deleted: true });

      const req = new Request("http://localhost:3000/api/admin/gdpr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid_token",
        },
        body: JSON.stringify({
          stripeCustomerId: "cus_123",
          email: "erase_me@example.com",
        }),
      });

      const res = await gdprPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.deletedStripeCustomerIds).toEqual(["cus_123", "cus_duplicate_456"]);
      expect(mockStripeInstance.customers.del).toHaveBeenCalledTimes(2);
    });

    it("gracefully ignores already-deleted (resource_missing) Stripe customers", async () => {
      mockAdminAuth();
      mockStripeInstance.customers.list.mockResolvedValue({ data: [] });
      const missingErr = new Error("No such customer: 'cus_gone'");
      missingErr.code = "resource_missing";
      mockStripeInstance.customers.del.mockRejectedValue(missingErr);

      const req = new Request("http://localhost:3000/api/admin/gdpr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid_token",
        },
        body: JSON.stringify({
          stripeCustomerId: "cus_gone",
          email: "gone@example.com",
        }),
      });

      const res = await gdprPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.deletedStripeCustomerIds).toEqual([]);
    });
  });
});

