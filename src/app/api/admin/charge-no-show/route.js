import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-12-18.acacia",
});

/**
 * POST /api/admin/charge-no-show
 * Charges a vaulted customer card £5 for a no-show.
 * Body: { stripeCustomerId, customerName }
 */
export async function POST(request) {
  try {
    // 1. Verify Authorization Token
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return Response.json(
        { error: "Unauthorized: Missing authorization header token" },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    
    // Call Firebase Auth REST endpoint to inspect token
    const authRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      }
    );

    if (!authRes.ok) {
      return Response.json(
        { error: "Unauthorized: Invalid or expired access token" },
        { status: 401 }
      );
    }

    const authData = await authRes.json();
    const email = authData.users?.[0]?.email;
    const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
      .split(",")
      .map(e => e.trim().toLowerCase());

    if (!email || !adminEmails.includes(email.toLowerCase())) {
      return Response.json(
        { error: "Forbidden: Not an authorized administrator" },
        { status: 403 }
      );
    }

    const { stripeCustomerId, customerName } = await request.json();

    if (!stripeCustomerId) {
      return Response.json(
        { error: "Stripe Customer ID is required to charge the card" },
        { status: 400 }
      );
    }

    // 1. List the payment methods for this customer
    const paymentMethods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: "card",
    });

    if (paymentMethods.data.length === 0) {
      return Response.json(
        { error: "No vaulted payment method found for this customer. A card must be attached to charge a no-show fee." },
        { status: 400 }
      );
    }

    const paymentMethodId = paymentMethods.data[0].id;

    // 2. Charge £5.00 off-session
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 500, // £5.00 in pence (£5)
      currency: "gbp",
      customer: stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description: `No-Show Fee for ${customerName || "Customer"}`,
    });

    return Response.json({
      success: true,
      chargeId: paymentIntent.id,
      amountCharged: 5.00,
    });
  } catch (error) {
    console.error("No-show charge error:", error);
    
    // Stripe specific card errors (e.g. card declined)
    if (error.type === "StripeCardError" || error.code === "authentication_required") {
      return Response.json(
        { error: `Card charge failed: ${error.message || "Declined"}` },
        { status: 402 }
      );
    }

    return Response.json(
      { error: error.message || "Failed to process charge" },
      { status: 500 }
    );
  }
}
