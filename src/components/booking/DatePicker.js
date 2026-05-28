"use client";

import { useMemo, useState, useEffect } from "react";
import { barbers, dayKeys, shopInfo } from "@/config/barbers";
import { formatLocalDate } from "@/lib/appointments";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthLabels = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function DatePicker({ barberId, selectedDate, onSelectDate }) {
  const barber = barbers.find((b) => b.id === barberId);
  const [schedule, setSchedule] = useState(() => {
    if (!barber) return null;
    return {
      workingHours: barber.workingHours,
      lunchBreak: barber.lunchBreak
    };
  });

  useEffect(() => {
    if (!barberId) return;
    const fetchSchedule = async () => {
      try {
        const scheduleRef = doc(db, "barberSchedules", barberId);
        const snap = await getDoc(scheduleRef);
        if (snap.exists()) {
          setSchedule(snap.data());
        }
      } catch (err) {
        console.error("Error fetching dynamic schedule in DatePicker:", err);
      }
    };
    fetchSchedule();
  }, [barberId]);

  const dates = useMemo(() => {
    const result = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < shopInfo.bookingWindowDays; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      const dayKey = dayKeys[date.getDay()];
      const isWorking = schedule?.workingHours?.[dayKey] !== null && schedule?.workingHours?.[dayKey] !== undefined;

      result.push({
        date,
        dayLabel: dayLabels[date.getDay()],
        dayNumber: date.getDate(),
        month: monthLabels[date.getMonth()],
        dateString: formatLocalDate(date),
        isWorking,
      });
    }
    return result;
  }, [barberId, schedule]);

  // Group by month for section headers
  const groupedByMonth = useMemo(() => {
    const groups = {};
    dates.forEach((d) => {
      if (!groups[d.month]) groups[d.month] = [];
      groups[d.month].push(d);
    });
    return groups;
  }, [dates]);

  const selectedString = selectedDate
    ? formatLocalDate(selectedDate)
    : null;

  return (
    <div className="animate-fade-in-up">
      <h2
        className="text-xl sm:text-2xl font-bold text-white mb-1 text-center"
        style={{ fontFamily: "'Playfair Display', serif" }}
      >
        Pick a Date
      </h2>
      <p className="text-sm text-[var(--text-muted)] text-center mb-6">
        Select a day for your appointment
      </p>

      <div className="space-y-5">
        {Object.entries(groupedByMonth).map(([month, monthDates]) => (
          <div key={month}>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--gold)] mb-3 px-1">
              {month}
            </h3>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {monthDates.map((d) => {
                const isSelected = selectedString === d.dateString;
                return (
                  <button
                    key={d.dateString}
                    onClick={() => d.isWorking && onSelectDate(d.date)}
                    disabled={!d.isWorking}
                    className={`relative flex flex-col items-center justify-center py-3 px-2 rounded-xl text-center transition-all duration-300 ${
                      isSelected
                        ? "bg-[var(--gold)] text-[#0a0a0a] shadow-[0_0_25px_rgba(201,168,76,0.3)] scale-105"
                        : d.isWorking
                        ? "bg-[var(--card-bg)] border border-[var(--glass-border)] text-white hover:border-[var(--card-border-hover)] hover:bg-[rgba(255,255,255,0.06)] cursor-pointer"
                        : "bg-transparent border border-transparent text-[var(--text-muted)]/40 cursor-not-allowed opacity-40"
                    }`}
                    id={`date-${d.dateString}`}
                  >
                    <span className={`text-[10px] uppercase font-medium mb-0.5 ${
                      isSelected ? "text-[#0a0a0a]/70" : d.isWorking ? "text-[var(--text-muted)]" : ""
                    }`}>
                      {d.dayLabel}
                    </span>
                    <span className={`text-lg font-bold ${
                      isSelected ? "text-[#0a0a0a]" : ""
                    }`}>
                      {d.dayNumber}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
