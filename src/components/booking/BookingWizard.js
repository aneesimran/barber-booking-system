"use client";

import { useState, useCallback } from "react";
import { formatLocalDate } from "@/lib/appointments";
import Image from "next/image";
import Link from "next/link";
import ProgressBar from "./ProgressBar";
import DatePicker from "./DatePicker";
import TimeSlotPicker from "./TimeSlotPicker";
import CustomerForm from "./CustomerForm";
import CardCapture from "./CardCapture";
import BookingConfirmation from "./BookingConfirmation";

export default function BookingWizard({ barber }) {
  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [customerDetails, setCustomerDetails] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  const handleDateSelect = useCallback((date) => {
    setSelectedDate(date);
    setSelectedTime(null);
    // Auto-advance after short delay for feel
    setTimeout(() => setStep(2), 300);
  }, []);

  const handleTimeSelect = useCallback((time) => {
    setSelectedTime(time);
    setTimeout(() => setStep(3), 300);
  }, []);

  const handleCustomerSubmit = useCallback((details) => {
    setCustomerDetails(details);
    setStep(4);
  }, []);

  const handleBookingSuccess = useCallback(() => {
    setConfirmed(true);
  }, []);

  const goBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const dateString = selectedDate ? formatLocalDate(selectedDate) : "";

  // Confirmed state — show confirmation
  if (confirmed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          <BookingConfirmation barber={barber} date={dateString} time={selectedTime} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:py-12">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-[var(--text-muted)] hover:text-white transition-colors" id="back-home">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-[var(--card-border)]">
              <Image src={barber.image} alt={barber.name} width={40} height={40} className="object-cover w-full h-full" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{barber.name}</p>
              <p className="text-xs text-[var(--text-muted)]">{barber.role}</p>
            </div>
          </div>
        </div>

        {/* Progress */}
        <ProgressBar currentStep={step} />

        {/* Back button for steps 2+ */}
        {step > 1 && (
          <button onClick={goBack} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors mb-4" id="step-back">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Back
          </button>
        )}

        {/* Step content */}
        <div className="glass-card p-5 sm:p-7">
          {step === 1 && (
            <DatePicker barberId={barber.id} selectedDate={selectedDate} onSelectDate={handleDateSelect} />
          )}
          {step === 2 && (
            <TimeSlotPicker barberId={barber.id} selectedDate={selectedDate} selectedTime={selectedTime} onSelectTime={handleTimeSelect} />
          )}
          {step === 3 && (
            <CustomerForm customerDetails={customerDetails} onSubmit={handleCustomerSubmit} />
          )}
          {step === 4 && (
            <CardCapture
              customerDetails={customerDetails}
              bookingData={{ barberId: barber.id, date: dateString, time: selectedTime }}
              onSuccess={handleBookingSuccess}
            />
          )}
        </div>

        {/* Selected summary at bottom */}
        {(selectedDate || selectedTime) && step < 4 && (
          <div className="mt-4 flex items-center justify-center gap-3 text-xs text-[var(--text-muted)]">
            {selectedDate && (
              <span className="bg-[var(--card-bg)] border border-[var(--glass-border)] rounded-full px-3 py-1.5">
                {selectedDate.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
              </span>
            )}
            {selectedTime && (
              <span className="bg-[var(--card-bg)] border border-[var(--glass-border)] rounded-full px-3 py-1.5">
                {(() => { const [h,m] = selectedTime.split(":").map(Number); return `${h>12?h-12:h}:${String(m).padStart(2,"0")} ${h>=12?"PM":"AM"}`; })()}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
