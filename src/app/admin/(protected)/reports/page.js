"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { barbers } from "@/config/barbers";
import { formatLocalDate } from "@/lib/appointments";

export default function ReportsPage() {
  const [viewMode, setViewMode] = useState("week"); // "day" | "week" | "year"
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDate(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reportData, setReportData] = useState({});

  // Fixed Week Range: Monday to Sunday
  const getWeekRange = (dateStr) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const day = date.getDay(); // 0 is Sunday, 1 is Monday...
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
    const monday = new Date(date.setDate(diff));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { monday, sunday };
  };

  // Fixed Year Range: Jan 1 to Dec 31
  const getYearRange = (dateStr) => {
    const year = dateStr.split("-")[0];
    return {
      start: `${year}-01-01`,
      end: `${year}-12-31`,
      yearLabel: year,
    };
  };

  // Formatting date range label for UI
  const getRangeLabel = () => {
    const options = { day: "numeric", month: "short", year: "numeric" };
    if (viewMode === "day") {
      const [y, m, d] = selectedDate.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    } else if (viewMode === "week") {
      const { monday, sunday } = getWeekRange(selectedDate);
      return `${monday.toLocaleDateString("en-GB", options)} – ${sunday.toLocaleDateString("en-GB", options)}`;
    } else {
      const { yearLabel } = getYearRange(selectedDate);
      return `Calendar Year ${yearLabel}`;
    }
  };

  // Date Navigation Shifting
  const handlePrevRange = () => {
    setSelectedDate((prev) => {
      const [y, m, d] = prev.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      if (viewMode === "day") {
        date.setDate(date.getDate() - 1);
      } else if (viewMode === "week") {
        date.setDate(date.getDate() - 7);
      } else {
        date.setFullYear(date.getFullYear() - 1);
      }
      return formatLocalDate(date);
    });
  };

  const handleNextRange = () => {
    setSelectedDate((prev) => {
      const [y, m, d] = prev.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      if (viewMode === "day") {
        date.setDate(date.getDate() + 1);
      } else if (viewMode === "week") {
        date.setDate(date.getDate() + 7);
      } else {
        date.setFullYear(date.getFullYear() + 1);
      }
      return formatLocalDate(date);
    });
  };

  useEffect(() => {
    const fetchReportData = async () => {
      setLoading(true);
      setError("");

      try {
        let startDate, endDate;
        if (viewMode === "day") {
          startDate = selectedDate;
          endDate = selectedDate;
        } else if (viewMode === "week") {
          const { monday, sunday } = getWeekRange(selectedDate);
          startDate = formatLocalDate(monday);
          endDate = formatLocalDate(sunday);
        } else {
          const { start, end } = getYearRange(selectedDate);
          startDate = start;
          endDate = end;
        }

        // 1. Fetch appointments within date range
        const apptsQ = query(
          collection(db, "appointments"),
          where("date", ">=", startDate),
          where("date", "<=", endDate)
        );
        const apptsSnap = await getDocs(apptsQ);

        // 2. Fetch blocked slots within date range
        const blockedQ = query(
          collection(db, "blockedSlots"),
          where("date", ">=", startDate),
          where("date", "<=", endDate)
        );
        const blockedSnap = await getDocs(blockedQ);

        // Initialize structured aggregation object
        const stats = {};
        barbers.forEach((barber) => {
          stats[barber.id] = {
            name: barber.name,
            role: barber.role,
            confirmed: 0,
            noShow: 0,
            cancelled: 0,
            blocked: 0,
          };
        });

        // Add overall total stats
        stats["total"] = {
          name: "Shop Totals",
          role: "Combined Shop Performance",
          confirmed: 0,
          noShow: 0,
          cancelled: 0,
          blocked: 0,
        };

        // Aggregate appointments
        apptsSnap.forEach((doc) => {
          const data = doc.data();
          const bId = data.barberId;
          const status = data.status; // "confirmed" | "no-show" | "cancelled"

          if (stats[bId]) {
            if (status === "confirmed") {
              stats[bId].confirmed++;
              stats["total"].confirmed++;
            } else if (status === "no-show") {
              stats[bId].noShow++;
              stats["total"].noShow++;
            } else if (status === "cancelled") {
              stats[bId].cancelled++;
              stats["total"].cancelled++;
            }
          }
        });

        // Aggregate blocked slots
        blockedSnap.forEach((doc) => {
          const data = doc.data();
          const bId = data.barberId;
          if (stats[bId]) {
            stats[bId].blocked++;
            stats["total"].blocked++;
          }
        });

        setReportData(stats);
      } catch (err) {
        console.error("Failed to load reports:", err);
        setError("Could not load reporting data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchReportData();
  }, [viewMode, selectedDate]);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header and View Mode Toggle */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>Performance Reports</h1>
          <p className="text-[var(--text-muted)]">Track appointment statistics, cancellations, and blocks.</p>
        </div>

        {/* View Mode Toggle Buttons */}
        <div className="flex bg-[#111] p-1 rounded-lg border border-[#222]">
          {["day", "week", "year"].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all ${
                viewMode === mode
                  ? "bg-[var(--gold)] text-[#0a0a0a] shadow-[0_0_10px_rgba(201,168,76,0.15)]"
                  : "text-[var(--text-muted)] hover:text-white"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Date Navigation Bar */}
      <div className="bg-[#111] border border-[#222] p-4 rounded-xl flex items-center justify-between shadow-lg">
        <button
          onClick={handlePrevRange}
          className="bg-[#1a1a1a] hover:bg-[#222] text-[var(--text-muted)] hover:text-white p-2.5 rounded-lg border border-[#333] transition-all active:scale-95 flex items-center justify-center"
          title={`Previous ${viewMode}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>

        <span className="text-white font-medium text-sm md:text-base text-center">
          {getRangeLabel()}
        </span>

        <button
          onClick={handleNextRange}
          className="bg-[#1a1a1a] hover:bg-[#222] text-[var(--text-muted)] hover:text-white p-2.5 rounded-lg border border-[#333] transition-all active:scale-95 flex items-center justify-center"
          title={`Next ${viewMode}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="w-10 h-10 border-2 border-[var(--gold)]/30 border-t-[var(--gold)] rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center text-red-400 font-medium">
          {error}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Summary Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {barbers.map((barber) => {
              const data = reportData[barber.id] || { confirmed: 0, noShow: 0, cancelled: 0, blocked: 0 };
              return (
                <div key={barber.id} className="bg-[#111] border border-[#222] rounded-2xl overflow-hidden shadow-xl relative">
                  <div className="absolute top-0 left-0 w-full h-[3px] bg-[var(--gold)]" />
                  
                  {/* Card Title */}
                  <div className="bg-[#1a1a1a] p-5 border-b border-[#222] flex justify-between items-center">
                    <div>
                      <h2 className="font-bold text-lg text-white">{barber.name}</h2>
                      <p className="text-xs text-[var(--text-muted)]">{barber.role}</p>
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 p-6 gap-4">
                    {/* Bookings */}
                    <div className="bg-[#0a0a0a] border border-[#222] p-4 rounded-xl flex flex-col justify-between">
                      <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">Bookings</span>
                      <span className="text-2xl font-bold text-green-400 mt-2">{data.confirmed}</span>
                    </div>

                    {/* No Shows */}
                    <div className="bg-[#0a0a0a] border border-[#222] p-4 rounded-xl flex flex-col justify-between">
                      <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">No-Shows</span>
                      <span className="text-2xl font-bold text-amber-500 mt-2">{data.noShow}</span>
                    </div>

                    {/* Cancelled */}
                    <div className="bg-[#0a0a0a] border border-[#222] p-4 rounded-xl flex flex-col justify-between">
                      <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">Cancelled</span>
                      <span className="text-2xl font-bold text-red-500 mt-2">{data.cancelled}</span>
                    </div>

                    {/* Blocked Slots */}
                    <div className="bg-[#0a0a0a] border border-[#222] p-4 rounded-xl flex flex-col justify-between">
                      <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">Blocked Slots</span>
                      <span className="text-2xl font-bold text-[var(--text-muted)] mt-2">{data.blocked}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Shop Totals Summary Table */}
          {reportData["total"] && (
            <div className="bg-[#111] border border-[#222] rounded-2xl overflow-hidden shadow-xl p-6">
              <h2 className="font-bold text-lg text-white mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>Shop Totals Comparison</h2>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#222] text-[var(--text-muted)] text-xs uppercase tracking-wider">
                      <th className="py-3 px-4">Barber / Summary</th>
                      <th className="py-3 px-4 text-center">Bookings</th>
                      <th className="py-3 px-4 text-center">No-Shows</th>
                      <th className="py-3 px-4 text-center">Cancelled</th>
                      <th className="py-3 px-4 text-center">Blocked Slots</th>
                      <th className="py-3 px-4 text-center font-bold text-white">Activity Index*</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#222]">
                    {barbers.map((barber) => {
                      const data = reportData[barber.id] || { confirmed: 0, noShow: 0, cancelled: 0, blocked: 0 };
                      const activityIndex = data.confirmed + data.noShow + data.blocked;
                      return (
                        <tr key={barber.id} className="text-sm hover:bg-[#1a1a1a]/40 transition-colors">
                          <td className="py-4 px-4 font-semibold text-white">{barber.name}</td>
                          <td className="py-4 px-4 text-center text-green-400 font-medium">{data.confirmed}</td>
                          <td className="py-4 px-4 text-center text-amber-500 font-medium">{data.noShow}</td>
                          <td className="py-4 px-4 text-center text-red-400 font-medium">{data.cancelled}</td>
                          <td className="py-4 px-4 text-center text-[var(--text-muted)]">{data.blocked}</td>
                          <td className="py-4 px-4 text-center text-[var(--gold)] font-bold">{activityIndex}</td>
                        </tr>
                      );
                    })}
                    
                    {/* Totals Row */}
                    <tr className="text-sm bg-[#1a1a1a]/60 font-semibold border-t border-[#333]">
                      <td className="py-4 px-4 text-[var(--gold)]">Shop Totals</td>
                      <td className="py-4 px-4 text-center text-green-400 font-bold">{reportData["total"].confirmed}</td>
                      <td className="py-4 px-4 text-center text-amber-500 font-bold">{reportData["total"].noShow}</td>
                      <td className="py-4 px-4 text-center text-red-400 font-bold">{reportData["total"].cancelled}</td>
                      <td className="py-4 px-4 text-center text-[var(--text-muted)] font-bold">{reportData["total"].blocked}</td>
                      <td className="py-4 px-4 text-center text-[var(--gold)] font-extrabold">
                        {reportData["total"].confirmed + reportData["total"].noShow + reportData["total"].blocked}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-4">
                * Activity Index represents total utilized scheduling capacity (Bookings + No-Shows + Blocked Slots).
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
