"use client";

import { useState } from "react";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe";
import { getBookedSlots, createOrFindCustomer, createAppointment } from "@/lib/appointments";

const cardStyle = {
  style: {
    base: {
      color: "#ededed",
      fontFamily: "'Inter', sans-serif",
      fontSize: "15px",
      "::placeholder": { color: "#6a6a6a" },
      iconColor: "#c9a84c",
    },
    invalid: { color: "#ef4444", iconColor: "#ef4444" },
  },
};

function CardForm({ customerDetails, bookingData, onSuccess, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [cardError, setCardError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setCardError(null);

    try {
      // 1. Create SetupIntent
      const res = await fetch("/api/create-setup-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: customerDetails.name, email: customerDetails.email }),
      });
      const { clientSecret, customerId, error: apiError } = await res.json();
      if (apiError) throw new Error(apiError);

      // 2. Confirm SetupIntent with card
      const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: elements.getElement(CardElement), billing_details: { name: customerDetails.name, email: customerDetails.email } },
      });

      if (stripeError) {
        setCardError(stripeError.message);
        setProcessing(false);
        return;
      }

      // 3. Confirm booking directly in Firestore (client-side) to avoid server gRPC issues
      const { barberId, date, time } = bookingData;
      
      const bookedSlots = await getBookedSlots(barberId, date);
      if (bookedSlots.includes(time)) {
        throw new Error("This time slot has just been booked. Please start over.");
      }

      const firestoreCustomerId = await createOrFindCustomer({
        name: customerDetails.name,
        email: customerDetails.email,
        phone: customerDetails.phone,
        stripeCustomerId: customerId || null,
      });

      const appointmentId = await createAppointment({
        barberId,
        customerId: firestoreCustomerId,
        date,
        time,
        stripeSetupIntentId: setupIntent.id,
      });

      onSuccess({ success: true, appointmentId, message: "Booking confirmed!" });
    } catch (err) {
      console.error("Payment error:", err);
      setCardError(err.message || "Something went wrong");
      if (onError) onError(err);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="bg-[var(--card-bg)] border border-[var(--glass-border)] rounded-xl p-4 mb-4 focus-within:border-[var(--gold)]/40 transition-colors duration-300">
        <CardElement options={{ ...cardStyle, hidePostalCode: true }} onChange={(e) => { if (e.error) setCardError(e.error.message); else setCardError(null); }} />
      </div>

      {cardError && <p className="text-red-400 text-xs mb-4 text-center">{cardError}</p>}

      <div className="flex items-start gap-2 mb-5 px-1">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" className="mt-0.5 shrink-0"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">Your card will <strong className="text-[var(--text-secondary)]">not be charged now</strong>. We securely store your details for no-show protection, and you will only be charged <strong className="text-[var(--text-secondary)]">£5.00</strong> if there is a no-show. If you need to cancel, please contact us as soon as possible.</p>
      </div>

      <button type="submit" disabled={!stripe || processing} className="btn-gold w-full text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed" id="confirm-booking-btn">
        {processing ? (
          <><div className="w-4 h-4 border-2 border-[#0a0a0a]/30 border-t-[#0a0a0a] rounded-full animate-spin" /> Processing...</>
        ) : (
          <>Confirm Booking</>
        )}
      </button>
    </form>
  );
}

export default function CardCapture({ customerDetails, bookingData, onSuccess, onError }) {
  return (
    <div className="animate-fade-in-up">
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-1 text-center" style={{ fontFamily: "'Playfair Display', serif" }}>Secure Your Booking</h2>
      <p className="text-sm text-[var(--text-muted)] text-center mb-6">Add a card for no-show protection</p>
      <div className="max-w-sm mx-auto">
        <Elements stripe={getStripe()}>
          <CardForm customerDetails={customerDetails} bookingData={bookingData} onSuccess={onSuccess} onError={onError} />
        </Elements>
      </div>
    </div>
  );
}
