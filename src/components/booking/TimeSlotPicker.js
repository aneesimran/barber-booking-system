"use client";

import { useState, useEffect } from "react";
import { formatLocalDate } from "@/lib/appointments";

export default function TimeSlotPicker({
  barberId,
  selectedDate,
  selectedTime,
  onSelectTime,
}) {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!selectedDate || !barberId) return;

    const fetchSlots = async () => {
      setLoading(true);
      setError(null);
      try {
        const dateString = formatLocalDate(selectedDate);
        const res = await fetch(
          `/api/available-slots?barberId=${barberId}&date=${dateString}`
        );
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "Failed to fetch slots");
        setSlots(data.slots || []);
      } catch (err) {
        console.error("Error fetching slots:", err);
        setError("Could not load available times. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchSlots();
  }, [barberId, selectedDate]);

  // Group slots into Morning / Afternoon
  const morning = slots.filter((s) => {
    const hour = parseInt(s.time.split(":")[0], 10);
    return hour < 12;
  });
  const afternoon = slots.filter((s) => {
    const hour = parseInt(s.time.split(":")[0], 10);
    return hour >= 12;
  });

  const formatTime = (time) => {
    const [h, m] = time.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayH}:${String(m).padStart(2, "0")} ${period}`;
  };

  const dateLabel = selectedDate
    ? selectedDate.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "";

  return (
    <div className="animate-fade-in-up">
      <h2
        className="text-xl sm:text-2xl font-bold text-white mb-1 text-center"
        style={{ fontFamily: "'Playfair Display', serif" }}
      >
        Pick a Time
      </h2>
      <p className="text-sm text-[var(--text-muted)] text-center mb-6">
        {dateLabel}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-[var(--gold)]/30 border-t-[var(--gold)] rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-8">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      ) : slots.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-[var(--text-muted)]">
            No available slots for this day.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {morning.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--gold)] mb-3 px-1">
                Morning
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {morning.map((slot) => (
                  <button
                    key={slot.time}
                    onClick={() => slot.available && onSelectTime(slot.time)}
                    disabled={!slot.available}
                    className={`py-3 px-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                      selectedTime === slot.time
                        ? "bg-[var(--gold)] text-[#0a0a0a] shadow-[0_0_25px_rgba(201,168,76,0.3)] scale-105 font-bold"
                        : slot.available
                        ? "bg-[var(--card-bg)] border border-[var(--glass-border)] text-white hover:border-[var(--card-border-hover)] hover:bg-[rgba(255,255,255,0.06)] cursor-pointer"
                        : "bg-[var(--card-bg)]/50 border border-transparent text-[var(--text-muted)]/30 cursor-not-allowed line-through opacity-40"
                    }`}
                    id={`slot-${slot.time}`}
                  >
                    {formatTime(slot.time)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {afternoon.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--gold)] mb-3 px-1">
                Afternoon
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {afternoon.map((slot) => (
                  <button
                    key={slot.time}
                    onClick={() => slot.available && onSelectTime(slot.time)}
                    disabled={!slot.available}
                    className={`py-3 px-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                      selectedTime === slot.time
                        ? "bg-[var(--gold)] text-[#0a0a0a] shadow-[0_0_25px_rgba(201,168,76,0.3)] scale-105 font-bold"
                        : slot.available
                        ? "bg-[var(--card-bg)] border border-[var(--glass-border)] text-white hover:border-[var(--card-border-hover)] hover:bg-[rgba(255,255,255,0.06)] cursor-pointer"
                        : "bg-[var(--card-bg)]/50 border border-transparent text-[var(--text-muted)]/30 cursor-not-allowed line-through opacity-40"
                    }`}
                    id={`slot-${slot.time}`}
                  >
                    {formatTime(slot.time)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
