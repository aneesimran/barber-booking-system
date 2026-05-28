"use client";

import Image from "next/image";
import Link from "next/link";

export default function BarberCard({ barber, index }) {
  return (
    <div
      className={`glass-card group cursor-pointer opacity-0 animate-fade-in-up`}
      style={{ animationDelay: `${300 + index * 200}ms`, animationFillMode: "forwards" }}
    >
      {/* Image container */}
      <div className="relative overflow-hidden rounded-t-[1.25rem]">
        <div className="aspect-[4/5] relative">
          <Image
            src={barber.image}
            alt={`${barber.name} — ${barber.role}`}
            fill
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, 50vw"
            priority
          />
          {/* Image overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent opacity-70" />
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Name */}
        <h3
          className="text-2xl font-bold mb-1 text-white group-hover:text-gold-gradient transition-all duration-300"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          {barber.name}
        </h3>
        <p className="text-sm text-[var(--gold)] font-medium mb-4">{barber.role}</p>

        {/* CTA Button */}
        <Link href={`/booking/${barber.id}`} id={`book-${barber.id}`}>
          <button className="btn-gold w-full text-sm font-semibold tracking-wide flex items-center justify-center gap-2">
            Book with {barber.name}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-transform duration-300 group-hover:translate-x-1"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </Link>
      </div>
    </div>
  );
}
