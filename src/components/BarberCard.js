"use client";

import Image from "next/image";
import Link from "next/link";

export default function BarberCard({ barber, index }) {
  return (
    <div
      className={`glass-card group cursor-pointer opacity-0 animate-fade-in-up flex flex-col h-full`}
      style={{ animationDelay: `${300 + index * 200}ms`, animationFillMode: "forwards" }}
    >
      {/* Image container */}
      <div className="relative overflow-hidden rounded-t-[1.25rem]">
        <div className="aspect-square relative">
          <Image
            src={barber.image}
            alt={`${barber.name} — ${barber.role}`}
            fill
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, 33vw"
            priority
          />
          {/* Image overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent opacity-70" />

          {/* Trainee floating badge */}
          {barber.isTrainee && (
            <div className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-full bg-[var(--gold)] text-[#0a0a0a] text-[11px] font-extrabold tracking-wide uppercase shadow-[0_4px_14px_rgba(201,168,76,0.45)] flex items-center gap-1.5">
              <span>50% OFF</span>
              <span className="opacity-50">•</span>
              <span>LEARNER</span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-6 flex flex-col flex-1 justify-between">
        <div>
          {/* Name */}
          <h3
            className="text-2xl font-bold mb-1 text-white group-hover:text-gold-gradient transition-all duration-300"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {barber.name}
          </h3>
          <p className="text-sm text-[var(--gold)] font-medium mb-3">{barber.role}</p>

          {/* Bio (for Imran & Ali) */}
          {!barber.isTrainee && barber.bio && (
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
              {barber.bio}
            </p>
          )}

          {/* Trainee box (already added previously for Mudni) */}
          {barber.isTrainee && (
            <div className="mb-4 p-3 rounded-lg bg-[rgba(201,168,76,0.12)] border border-[var(--gold)]/40 text-xs text-[var(--text-secondary)] leading-relaxed">
              <strong className="text-[var(--gold)] block font-bold mb-1">
                50% Off — Learning Barbering
              </strong>
              All haircuts with {barber.name} are half price solely because he is currently learning barbering.
            </div>
          )}
        </div>

        {/* CTA Button */}
        <Link href={`/booking/${barber.id}`} id={`book-${barber.id}`} className="block mt-2">
          <button className="btn-gold w-full text-sm font-semibold tracking-wide flex items-center justify-center gap-2">
            Book with {barber.name}{barber.isTrainee ? " (50% Off)" : ""}
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
