"use client";

import { shopInfo } from "@/config/barbers";

export default function Hero() {
  return (
    <section className="relative min-h-[55vh] flex items-center justify-center overflow-hidden px-4 pt-20 pb-10">
      {/* Gradient background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,rgba(201,168,76,0.08)_0%,transparent_70%)] blur-3xl" />
        <div className="absolute -bottom-20 -right-40 w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(201,168,76,0.05)_0%,transparent_70%)] blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-[radial-gradient(circle,rgba(201,168,76,0.03)_0%,transparent_70%)] blur-2xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center max-w-2xl mx-auto">
        {/* Decorative line */}
        <div className="flex items-center justify-center gap-4 mb-6 opacity-0 animate-fade-in">
          <div className="h-px w-12 bg-gradient-to-r from-transparent to-[var(--gold)]" />
          <div className="w-2 h-2 rotate-45 border border-[var(--gold)] opacity-60" />
          <div className="h-px w-12 bg-gradient-to-l from-transparent to-[var(--gold)]" />
        </div>

        {/* Shop name */}
        <h1
          className="font-[var(--font-display)] text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-4 opacity-0 animate-fade-in-up"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          <span className="text-gold-gradient">{shopInfo.name}</span>
        </h1>

        {/* Tagline */}
        <p className="text-lg sm:text-xl text-[var(--text-secondary)] mb-3 opacity-0 animate-fade-in-up delay-200">
          {shopInfo.tagline}
        </p>

        {/* Subtitle */}
        <p className="text-sm text-[var(--text-muted)] mb-10 opacity-0 animate-fade-in-up delay-300">
          Book your appointment online — select your barber below
        </p>

        {/* Scroll indicator */}
        <div className="opacity-0 animate-fade-in delay-700">
          <div className="animate-float">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              className="mx-auto opacity-40"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 5L12 19M12 19L5 12M12 19L19 12"
                stroke="var(--gold)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
