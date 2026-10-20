"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { shopInfo } from "@/config/barbers";

const emptySubscribe = () => () => {};

export default function TermsModal({ isOpen, onClose }) {
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "auto";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !isMounted) return null;

  return createPortal(
    <div className="terms-modal-overlay" onClick={onClose}>
      <div
        className="terms-modal-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-modal-title"
      >
        {/* Header */}
        <div className="terms-modal-header">
          <h3 id="terms-modal-title" className="terms-modal-title">
            Terms &amp; Conditions
          </h3>
          <button
            onClick={onClose}
            className="terms-modal-close"
            aria-label="Close Terms and Conditions"
            id="close-terms-btn"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="terms-modal-body">
          <p className="terms-updated">Last updated: July 2026</p>
          <p className="terms-intro">
            By confirming your booking with {shopInfo.name}, you agree to the following terms and conditions. Please read them carefully before proceeding.
          </p>

          <div className="terms-section">
            <h4>1. Booking &amp; Appointments</h4>
            <ul>
              <li>
                All standard appointments are {shopInfo.appointmentDuration} minutes in duration (1 hour for trainee barber appointments).
              </li>
              <li>
                Appointments can be booked up to {shopInfo.bookingWindowDays} days in advance through our online booking system.
              </li>
              <li>
                A valid debit or credit card is required to secure your booking. Your card will <strong>not</strong> be charged at the time of booking.
              </li>
            </ul>
          </div>

          <div className="terms-section">
            <h4>2. No-Show &amp; Late Cancellation Policy</h4>
            <ul>
              <li>
                If you fail to attend your appointment without prior notice (<strong>no-show</strong>), a fee of <strong>£5.00</strong> will be charged to the card on file.
              </li>
              <li>
                Cancellations made with less than <strong>2 hours&apos;</strong> notice may also be subject to the £5.00 no-show fee.
              </li>
              <li>
                This policy exists to respect the time of our barbers and other customers who could have used the slot.
              </li>
            </ul>
          </div>

          <div className="terms-section">
            <h4>3. Cancellations &amp; Rescheduling</h4>
            <ul>
              <li>
                You may cancel or reschedule your appointment free of charge by contacting us at least <strong>2 hours</strong> before your appointment time.
              </li>
              <li>
                To cancel or reschedule, please contact us directly by phone or in person.
              </li>
              <li>
                We reserve the right to cancel or reschedule appointments due to unforeseen circumstances such as barber illness or emergencies. In such cases, we will notify you as soon as possible.
              </li>
            </ul>
          </div>

          <div className="terms-section">
            <h4>4. Lateness</h4>
            <ul>
              <li>
                If you arrive more than <strong>10 minutes late</strong>, we may not be able to accommodate your appointment and it may be treated as a no-show.
              </li>
              <li>
                If you arrive slightly late, we will do our best to fit you in, but your service may be shortened to avoid delaying other customers.
              </li>
            </ul>
          </div>

          <div className="terms-section">
            <h4>5. Payment &amp; Card Security</h4>
            <ul>
              <li>
                Your card details are securely processed and stored by <strong>Stripe</strong>, a PCI-DSS Level 1 certified payment processor. {shopInfo.name} does not store your full card details.
              </li>
              <li>
                Payment for services is due at the time of your appointment and can be made by cash or card in-store.
              </li>
              <li>
                The card on file is used solely for no-show protection and will not be charged for any other purpose.
              </li>
            </ul>
          </div>

          <div className="terms-section">
            <h4>6. Your Data &amp; Privacy</h4>
            <ul>
              <li>
                We collect your name, email address, and phone number to manage your booking and send appointment confirmations.
              </li>
              <li>
                Your personal data will not be shared with third parties for marketing purposes.
              </li>
              <li>
                You may request the deletion of your data at any time by contacting us directly.
              </li>
            </ul>
          </div>

          <div className="terms-section">
            <h4>7. Liability &amp; Service Disclaimer</h4>
            <ul>
              <li>
                Our barbers exercise the utmost care and professional skill. However, haircutting, precision grooming, razor line-ups, and wet shaves carry inherent minor risks of temporary skin irritation, razor burn, or minor cuts and nicks. {shopInfo.name} accepts no liability for minor skin irritation, cuts, or incidental nicks during hair or beard grooming services. Please inform your barber of any sensitive skin or pre-existing skin conditions prior to your service.
              </li>
              <li>
                We accept no liability for adverse reactions to products used during your appointment if known allergies or sensitivities were not disclosed beforehand.
              </li>
              <li>
                We are not responsible for any personal belongings left on the premises.
              </li>
            </ul>
          </div>

          <div className="terms-section">
            <h4>8. Changes to Terms</h4>
            <ul>
              <li>
                We reserve the right to update these terms at any time. Any changes will be reflected on our booking platform.
              </li>
              <li>
                By continuing to use our booking service, you agree to the most current version of these terms.
              </li>
            </ul>
          </div>

          <p className="terms-contact">
            If you have any questions about these terms, please speak to a member of our team.
          </p>
        </div>

        {/* Footer */}
        <div className="terms-modal-footer">
          <button onClick={onClose} className="btn-gold text-sm w-full" id="accept-terms-btn">
            I Understand
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
