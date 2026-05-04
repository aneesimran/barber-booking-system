"use client";

import Link from "next/link";
import { shopInfo } from "@/config/barbers";

export default function BookingConfirmation({ barber, date, time }) {
  const formatTime = (t) => {
    const [h, m] = t.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayH}:${String(m).padStart(2, "0")} ${period}`;
  };

  const dateObj = new Date(date + "T00:00:00");
  const dateLabel = dateObj.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="animate-fade-in-up text-center">
      {/* Animated checkmark */}
      <div className="mx-auto w-20 h-20 rounded-full bg-[var(--gold)]/15 flex items-center justify-center mb-6 animate-pulse-glow">
        <div className="w-14 h-14 rounded-full bg-[var(--gold)] flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
      </div>

      <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
        Booking Confirmed!
      </h2>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        You&apos;re all set. We&apos;ll see you soon.
      </p>

      {/* Summary card */}
      <div className="glass-card p-6 max-w-sm mx-auto mb-8 text-left">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Barber</span>
            <span className="text-sm font-semibold text-white">{barber.name}</span>
          </div>
          <div className="h-px bg-[var(--glass-border)]" />
          <div className="flex justify-between items-center">
            <span className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Date</span>
            <span className="text-sm font-semibold text-white">{dateLabel}</span>
          </div>
          <div className="h-px bg-[var(--glass-border)]" />
          <div className="flex justify-between items-center">
            <span className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Time</span>
            <span className="text-sm font-semibold text-white">{formatTime(time)}</span>
          </div>
          <div className="h-px bg-[var(--glass-border)]" />
          <div className="flex justify-between items-center">
            <span className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Duration</span>
            <span className="text-sm font-semibold text-white">{shopInfo.appointmentDuration} mins</span>
          </div>
        </div>
      </div>

      <Link href="/" className="btn-gold inline-block text-sm" id="book-another">
        ← Book Another Appointment
      </Link>
    </div>
  );
}
