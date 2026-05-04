import { loadStripe } from "@stripe/stripe-js";

/**
 * Singleton Stripe.js promise — loads the Stripe client SDK once.
 * Uses the publishable key from environment variables.
 */
let stripePromise = null;

export function getStripe() {
  if (!stripePromise) {
    stripePromise = loadStripe(
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""
    );
  }
  return stripePromise;
}
