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

        {/* Rating badge */}
        <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-full px-3 py-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--gold)" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
          </svg>
          <span className="text-xs font-semibold text-white">{barber.rating}</span>
          <span className="text-xs text-[var(--text-muted)]">({barber.reviewCount})</span>
        </div>

        {/* Role badge */}
        {barber.role === "Senior Barber & Owner" && (
          <div className="absolute top-4 left-4 bg-[var(--gold)]/90 backdrop-blur-md text-[#0a0a0a] text-xs font-bold uppercase tracking-wider rounded-full px-3 py-1.5">
            Owner
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Name & Role */}
        <h3
          className="text-2xl font-bold mb-1 text-white group-hover:text-gold-gradient transition-all duration-300"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          {barber.name}
        </h3>
        <p className="text-sm text-[var(--gold)] font-medium mb-3">{barber.role}</p>

        {/* Bio */}
        <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-5">{barber.bio}</p>

        {/* Specialties */}
        <div className="flex flex-wrap gap-2 mb-6">
          {barber.specialties.map((specialty) => (
            <span
              key={specialty}
              className="text-xs px-3 py-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)] transition-colors duration-300 group-hover:border-[var(--card-border-hover)] group-hover:text-white"
            >
              {specialty}
            </span>
          ))}
        </div>

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
