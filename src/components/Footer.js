"use client";

import { shopInfo } from "@/config/barbers";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative border-t border-[var(--glass-border)] mt-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col items-center text-center gap-4">
          {/* Shop name */}
          <h3
            className="text-lg font-semibold text-gold-gradient"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {shopInfo.name}
          </h3>

          {/* Decorative divider */}
          <div className="flex items-center gap-3">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-[var(--gold)] opacity-40" />
            <div className="w-1.5 h-1.5 rotate-45 border border-[var(--gold)] opacity-30" />
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-[var(--gold)] opacity-40" />
          </div>

          {/* Info */}
          <p className="text-xs text-[var(--text-muted)] max-w-md leading-relaxed">
            Walk-ins welcome · Online booking available · {shopInfo.appointmentDuration}-minute appointments
          </p>

          {/* Copyright */}
          <p className="text-xs text-[var(--text-muted)] opacity-60">
            © {currentYear} {shopInfo.name}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
