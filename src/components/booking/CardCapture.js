"use client";

import { useState, useEffect } from "react";
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
  
  const [loadingIntent, setLoadingIntent] = useState(true);
  const [clientSecret, setClientSecret] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [savedCard, setSavedCard] = useState(null);
  const [useSavedCard, setUseSavedCard] = useState(true);

  const [processing, setProcessing] = useState(false);
  const [cardError, setCardError] = useState(null);

  useEffect(() => {
    const initSetupIntent = async () => {
      try {
        const res = await fetch("/api/create-setup-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: customerDetails.name, email: customerDetails.email }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setClientSecret(data.clientSecret);
        setCustomerId(data.customerId);
        setSavedCard(data.savedCard);
        setUseSavedCard(!!data.savedCard);
      } catch (err) {
        console.error("Error creating setup intent:", err);
        setCardError("Failed to initialize secure payment container.");
      } finally {
        setLoadingIntent(false);
      }
    };
    initSetupIntent();
  }, [customerDetails]);

  const handleConfirmWithSavedCard = async (e) => {
    e.preventDefault();
    setProcessing(true);
    setCardError(null);

    try {
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
        stripeSetupIntentId: "vaulted_payment_method",
      });

      onSuccess({ success: true, appointmentId, message: "Booking confirmed using your saved card!" });
    } catch (err) {
      console.error("Saved card confirmation error:", err);
      setCardError(err.message || "Something went wrong");
      if (onError) onError(err);
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmitNewCard = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || !clientSecret) return;

    setProcessing(true);
    setCardError(null);

    try {
      // Confirm SetupIntent with card
      const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { 
          card: elements.getElement(CardElement), 
          billing_details: { name: customerDetails.name, email: customerDetails.email } 
        },
      });

      if (stripeError) {
        setCardError(stripeError.message);
        setProcessing(false);
        return;
      }

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

  if (loadingIntent) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-[var(--gold)]/30 border-t-[var(--gold)] rounded-full animate-spin mb-2" />
        <p className="text-xs text-[var(--text-muted)]">Verifying payment details...</p>
      </div>
    );
  }

  if (savedCard && useSavedCard) {
    return (
      <form onSubmit={handleConfirmWithSavedCard}>
        <div className="bg-[var(--card-bg)] border border-[var(--glass-border)] rounded-xl p-5 mb-4 text-center">
          <div className="flex justify-center mb-2.5">
            <div className="w-12 h-12 rounded-full bg-[var(--gold)]/10 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
            </div>
          </div>
          <p className="text-sm font-semibold text-white mb-0.5">Use your saved card</p>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {savedCard.brand.toUpperCase()} ending in •••• {savedCard.last4}
          </p>
          <button
            type="button"
            onClick={() => setUseSavedCard(false)}
            className="text-xs text-[var(--gold)] hover:underline hover:text-[var(--gold-light)] transition-colors"
          >
            Use a different card
          </button>
        </div>

        {cardError && <p className="text-red-400 text-xs mb-4 text-center">{cardError}</p>}

        <div className="flex items-start gap-2 mb-5 px-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" className="mt-0.5 shrink-0"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">We will use your vaulted card for no-show protection. You will only be charged <strong className="text-[var(--text-secondary)]">£5.00</strong> in the event of a no-show.</p>
        </div>

        <button type="submit" disabled={processing} className="btn-gold w-full text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
          {processing ? (
            <><div className="w-4 h-4 border-2 border-[#0a0a0a]/30 border-t-[#0a0a0a] rounded-full animate-spin" /> Confirming...</>
          ) : (
            <>Confirm Booking</>
          )}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmitNewCard}>
      {savedCard && (
        <div className="mb-4 text-center">
          <button
            type="button"
            onClick={() => setUseSavedCard(true)}
            className="text-xs text-[var(--gold)] hover:underline hover:text-[var(--gold-light)] transition-colors"
          >
            ← Back to use saved card
          </button>
        </div>
      )}
      <div className="bg-[var(--card-bg)] border border-[var(--glass-border)] rounded-xl p-4 mb-4 focus-within:border-[var(--gold)]/40 transition-colors duration-300">
        <CardElement options={{ ...cardStyle, hidePostalCode: true }} onChange={(e) => { if (e.error) setCardError(e.error.message); else setCardError(null); }} />
      </div>

      {cardError && <p className="text-red-400 text-xs mb-4 text-center">{cardError}</p>}

      <div className="flex items-start gap-2 mb-5 px-1">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" className="mt-0.5 shrink-0"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">Your card will <strong className="text-[var(--text-secondary)]">not be charged now</strong>. We securely store your details for no-show protection, and you will only be charged <strong className="text-[var(--text-secondary)]">£5.00</strong> if there is a no-show. If you need to cancel, please contact us as soon as possible.</p>
      </div>

      <button type="submit" disabled={!stripe || processing || !clientSecret} className="btn-gold w-full text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed" id="confirm-booking-btn">
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
