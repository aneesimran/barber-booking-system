import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockStripeInstance } = vi.hoisted(() => {
  return {
    mockStripeInstance: {
      customers: {
        list: vi.fn(),
        create: vi.fn(),
      },
      paymentMethods: {
        list: vi.fn(),
      },
      setupIntents: {
        create: vi.fn(),
      },
      paymentIntents: {
        create: vi.fn(),
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

// Import route handlers after mock setup
import { POST as setupIntentPost } from "@/app/api/create-setup-intent/route";
import { POST as chargeNoShowPost } from "@/app/api/admin/charge-no-show/route";

describe("Stripe Vaulting & No-Show Fee Integration", () => {
  let originalFetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ==========================================================================
  // POST /api/create-setup-intent
  // ==========================================================================
  describe("POST /api/create-setup-intent", () => {
    function createRequest(body) {
      return new Request("http://localhost:3000/api/create-setup-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    it("returns 400 if name or email is missing", async () => {
      const res1 = await setupIntentPost(createRequest({ name: "Alice" }));
      expect(res1.status).toBe(400);

      const res2 = await setupIntentPost(createRequest({ email: "alice@example.com" }));
      expect(res2.status).toBe(400);
    });

    it("creates a new customer and SetupIntent if customer does not exist", async () => {
      mockStripeInstance.customers.list.mockResolvedValue({ data: [] });
      mockStripeInstance.customers.create.mockResolvedValue({ id: "cus_new_123" });
      mockStripeInstance.setupIntents.create.mockResolvedValue({
        client_secret: "seti_secret_123",
      });

      const res = await setupIntentPost(createRequest({ name: "Alice", email: "alice@example.com" }));
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.clientSecret).toBe("seti_secret_123");
      expect(data.customerId).toBe("cus_new_123");
      expect(data.savedCard).toBeNull();

      expect(mockStripeInstance.customers.create).toHaveBeenCalledWith({
        name: "Alice",
        email: "alice@example.com",
      });
      expect(mockStripeInstance.setupIntents.create).toHaveBeenCalledWith({
        customer: "cus_new_123",
        payment_method_types: ["card"],
        metadata: {
          customerName: "Alice",
          customerEmail: "alice@example.com",
        },
      });
    });

    it("detects existing customer and returns savedCard details if card is attached", async () => {
      mockStripeInstance.customers.list.mockResolvedValue({
        data: [{ id: "cus_existing_456" }],
      });
      mockStripeInstance.paymentMethods.list.mockResolvedValue({
        data: [
          {
            id: "pm_card_789",
            card: {
              brand: "visa",
              last4: "4242",
              exp_month: 12,
              exp_year: 2028,
            },
          },
        ],
      });
      mockStripeInstance.setupIntents.create.mockResolvedValue({
        client_secret: "seti_secret_456",
      });

      const res = await setupIntentPost(createRequest({ name: "Bob", email: "bob@example.com" }));
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.clientSecret).toBe("seti_secret_456");
      expect(data.customerId).toBe("cus_existing_456");
      expect(data.savedCard).toEqual({
        brand: "visa",
        last4: "4242",
        expMonth: 12,
        expYear: 2028,
      });
    });

    it("returns 500 if Stripe throws an API error", async () => {
      mockStripeInstance.customers.list.mockRejectedValue(new Error("Stripe rate limit"));

      const res = await setupIntentPost(createRequest({ name: "Alice", email: "alice@example.com" }));
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("Failed to create setup intent");
    });
  });

  // ==========================================================================
  // POST /api/admin/charge-no-show
  // ==========================================================================
  describe("POST /api/admin/charge-no-show", () => {
    function createChargeRequest(body, token = "valid_admin_token") {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      return new Request("http://localhost:3000/api/admin/charge-no-show", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    }

    it("returns 401 if authorization header is missing or malformed", async () => {
      const res1 = await chargeNoShowPost(
        new Request("http://localhost:3000/api/admin/charge-no-show", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stripeCustomerId: "cus_123" }),
        })
      );
      expect(res1.status).toBe(401);

      const res2 = await chargeNoShowPost(
        new Request("http://localhost:3000/api/admin/charge-no-show", {
          method: "POST",
          headers: { Authorization: "Basic 123" },
          body: JSON.stringify({ stripeCustomerId: "cus_123" }),
        })
      );
      expect(res2.status).toBe(401);
    });

    it("returns 401 if Firebase token lookup fails", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });

      const res = await chargeNoShowPost(createChargeRequest({ stripeCustomerId: "cus_123" }));
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("Unauthorized: Invalid or expired access token");
    });

    it("returns 403 if authenticated user is not in admin emails list", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          users: [{ email: "regular_user@example.com" }],
        }),
      });

      const res = await chargeNoShowPost(createChargeRequest({ stripeCustomerId: "cus_123" }));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Not an authorized administrator");
    });

    it("returns 400 if stripeCustomerId is missing", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          users: [{ email: "aneesimran@outlook.com" }],
        }),
      });

      const res = await chargeNoShowPost(createChargeRequest({}));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Stripe Customer ID is required to charge the card");
    });

    it("returns 400 if customer has no vaulted payment method", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          users: [{ email: "aneesimran@outlook.com" }],
        }),
      });
      mockStripeInstance.paymentMethods.list.mockResolvedValue({ data: [] });

      const res = await chargeNoShowPost(createChargeRequest({ stripeCustomerId: "cus_123" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("No vaulted payment method found");
    });

    it("returns 402 if card is declined by Stripe", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          users: [{ email: "aneesimran@outlook.com" }],
        }),
      });
      mockStripeInstance.paymentMethods.list.mockResolvedValue({
        data: [{ id: "pm_card_declined" }],
      });

      const cardError = new Error("Your card was declined.");
      cardError.type = "StripeCardError";
      mockStripeInstance.paymentIntents.create.mockRejectedValue(cardError);

      const res = await chargeNoShowPost(
        createChargeRequest({ stripeCustomerId: "cus_123", customerName: "Test User" })
      );
      expect(res.status).toBe(402);
      const data = await res.json();
      expect(data.error).toBe("Card charge failed: Your card was declined.");
    });

    it("successfully charges £5.00 off-session for a no-show", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          users: [{ email: "aneesimran@outlook.com" }],
        }),
      });
      mockStripeInstance.paymentMethods.list.mockResolvedValue({
        data: [{ id: "pm_card_valid" }],
      });
      mockStripeInstance.paymentIntents.create.mockResolvedValue({
        id: "pi_success_123",
      });

      const res = await chargeNoShowPost(
        createChargeRequest({ stripeCustomerId: "cus_123", customerName: "Dave" })
      );
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.chargeId).toBe("pi_success_123");
      expect(data.amountCharged).toBe(5.0);

      expect(mockStripeInstance.paymentIntents.create).toHaveBeenCalledWith({
        amount: 500, // 500 pence = £5.00
        currency: "gbp",
        customer: "cus_123",
        payment_method: "pm_card_valid",
        off_session: true,
        confirm: true,
        description: "No-Show Fee for Dave",
      });
    });
  });
});
