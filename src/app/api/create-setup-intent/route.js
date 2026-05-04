import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-12-18.acacia",
});

/**
 * POST /api/create-setup-intent
 * Creates a Stripe Customer + SetupIntent for card vaulting.
 * Body: { name, email }
 * Returns: { clientSecret, customerId }
 */
export async function POST(request) {
  try {
    const { name, email } = await request.json();

    if (!name || !email) {
      return Response.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    // Check if a Stripe customer already exists for this email
    const existingCustomers = await stripe.customers.list({
      email,
      limit: 1,
    });

    let customer;
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      // Create a new Stripe customer
      customer = await stripe.customers.create({
        name,
        email,
      });
    }

    // Create a SetupIntent (not a PaymentIntent — no charge)
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ["card"],
      metadata: {
        customerName: name,
        customerEmail: email,
      },
    });

    return Response.json({
      clientSecret: setupIntent.client_secret,
      customerId: customer.id,
    });
  } catch (error) {
    console.error("Stripe SetupIntent error:", error);
    return Response.json(
      { error: "Failed to create setup intent" },
      { status: 500 }
    );
  }
}
