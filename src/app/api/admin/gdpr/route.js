import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-12-18.acacia",
});

/**
 * Helper: Verify Firebase Admin Authorization Token
 */
async function verifyAdminRequest(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      authorized: false,
      response: Response.json(
        { error: "Unauthorized: Missing authorization header token" },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.substring(7);
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  const authRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    }
  );

  if (!authRes.ok) {
    return {
      authorized: false,
      response: Response.json(
        { error: "Unauthorized: Invalid or expired access token" },
        { status: 401 }
      ),
    };
  }

  const authData = await authRes.json();
  const email = authData.users?.[0]?.email;
  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!email || !adminEmails.includes(email.toLowerCase())) {
    return {
      authorized: false,
      response: Response.json(
        { error: "Forbidden: Not an authorized administrator" },
        { status: 403 }
      ),
    };
  }

  return { authorized: true, adminEmail: email };
}

/**
 * GET /api/admin/gdpr?stripeCustomerId=...&email=...
 * Inspects personal data and vaulted payment methods stored in Stripe for a customer
 * (used for UK GDPR Subject Access Requests & Data Portability exports).
 */
export async function GET(request) {
  try {
    const authCheck = await verifyAdminRequest(request);
    if (!authCheck.authorized) return authCheck.response;

    const { searchParams } = new URL(request.url);
    const stripeCustomerId = searchParams.get("stripeCustomerId");
    const email = searchParams.get("email");

    if (!stripeCustomerId && !email) {
      return Response.json(
        { error: "Either stripeCustomerId or email is required" },
        { status: 400 }
      );
    }

    const foundCustomers = new Map();

    // 1. Lookup by explicit stripeCustomerId if provided
    if (stripeCustomerId) {
      try {
        const cust = await stripe.customers.retrieve(stripeCustomerId);
        if (cust && !cust.deleted) {
          foundCustomers.set(cust.id, cust);
        }
      } catch (err) {
        // Ignore 404 / resource_missing if customer was already deleted in Stripe
        if (err.code !== "resource_missing") {
          console.warn("Stripe customer retrieve warning:", err.message);
        }
      }
    }

    // 2. Also lookup by email in Stripe to catch any duplicate/legacy Stripe customer records
    if (email) {
      const listRes = await stripe.customers.list({ email, limit: 10 });
      for (const cust of listRes.data) {
        if (!cust.deleted) {
          foundCustomers.set(cust.id, cust);
        }
      }
    }

    const stripeRecords = [];
    for (const cust of foundCustomers.values()) {
      const paymentMethodsRes = await stripe.paymentMethods.list({
        customer: cust.id,
        type: "card",
      });

      const cards = paymentMethodsRes.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand || "unknown",
        last4: pm.card?.last4 || "****",
        expMonth: pm.card?.exp_month || null,
        expYear: pm.card?.exp_year || null,
        created: pm.created ? new Date(pm.created * 1000).toISOString() : null,
      }));

      stripeRecords.push({
        id: cust.id,
        name: cust.name || null,
        email: cust.email || null,
        phone: cust.phone || null,
        created: cust.created ? new Date(cust.created * 1000).toISOString() : null,
        cards,
      });
    }

    return Response.json({
      success: true,
      stripeRecords,
    });
  } catch (error) {
    console.error("GDPR GET error:", error);
    return Response.json(
      { error: error.message || "Failed to fetch Stripe GDPR data" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/gdpr
 * Executes UK GDPR Right to Erasure on Stripe customer profile(s) and vaulted payment methods.
 * Body: { stripeCustomerId, email }
 */
export async function POST(request) {
  try {
    const authCheck = await verifyAdminRequest(request);
    if (!authCheck.authorized) return authCheck.response;

    const { stripeCustomerId, email } = await request.json();

    if (!stripeCustomerId && !email) {
      return Response.json(
        { error: "Either stripeCustomerId or email is required for Stripe erasure" },
        { status: 400 }
      );
    }

    const customerIdsToDelete = new Set();
    if (stripeCustomerId) {
      customerIdsToDelete.add(stripeCustomerId);
    }

    // Find any Stripe customer records matching the email address
    if (email) {
      const existingCustomers = await stripe.customers.list({
        email,
        limit: 20,
      });
      for (const cust of existingCustomers.data) {
        if (!cust.deleted) {
          customerIdsToDelete.add(cust.id);
        }
      }
    }

    const deletedStripeCustomerIds = [];
    const errors = [];

    for (const id of customerIdsToDelete) {
      try {
        const delRes = await stripe.customers.del(id);
        if (delRes.deleted) {
          deletedStripeCustomerIds.push(id);
        }
      } catch (err) {
        // If already deleted or not found in Stripe, treat as benign
        if (err.code === "resource_missing") {
          continue;
        }
        console.error(`Failed to delete Stripe customer ${id}:`, err);
        errors.push({ id, error: err.message });
      }
    }

    if (errors.length > 0 && deletedStripeCustomerIds.length === 0) {
      return Response.json(
        {
          error: `Stripe erasure encountered errors: ${errors.map((e) => e.error).join(", ")}`,
          errors,
        },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      deletedStripeCustomerIds,
      errors,
    });
  } catch (error) {
    console.error("GDPR POST erasure error:", error);
    return Response.json(
      { error: error.message || "Failed to erase Stripe customer data" },
      { status: 500 }
    );
  }
}

