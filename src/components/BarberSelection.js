"use client";

import { barbers } from "@/config/barbers";
import BarberCard from "./BarberCard";

export default function BarberSelection() {
  return (
    <section className="relative px-4 sm:px-6 pt-16 pb-20" id="select-barber">
      {/* Section heading */}
      <div className="text-center mb-10 opacity-0 animate-fade-in-up delay-200">
        <h2
          className="text-2xl sm:text-3xl font-bold text-white mb-2"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          Choose Your Barber
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Select a barber to view available time slots
        </p>
      </div>

      {/* Barber cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {barbers.map((barber, index) => (
          <BarberCard key={barber.id} barber={barber} index={index} />
        ))}
      </div>
    </section>
  );
}
