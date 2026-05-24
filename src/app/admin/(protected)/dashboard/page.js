"use client";
import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { barbers } from "@/config/barbers";

export default function DashboardPage() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });

  useEffect(() => {
    const fetchBookings = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, "appointments"),
          where("date", "==", selectedDate)
        );
        const snap = await getDocs(q);
        
        const bookingsData = [];
        for (const d of snap.docs) {
          const appt = d.data();
          const customerSnap = await getDoc(doc(db, "customers", appt.customerId));
          const customer = customerSnap.exists() ? customerSnap.data() : { name: "Unknown", phone: "", email: "" };
          bookingsData.push({ id: d.id, ...appt, customer });
        }
        
        bookingsData.sort((a, b) => a.time.localeCompare(b.time));
        setAppointments(bookingsData);
      } catch (err) {
        console.error("Error fetching bookings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBookings();
  }, [selectedDate]);

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>Dashboard</h1>
          <p className="text-[var(--text-muted)]">View and manage bookings.</p>
        </div>
        <div>
          <input 
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-[#111] border border-[#333] text-white px-4 py-2 rounded-lg focus:outline-none focus:border-[var(--gold)]"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-[var(--gold)]/30 border-t-[var(--gold)] rounded-full animate-spin" />
        </div>
      ) : appointments.length === 0 ? (
        <div className="bg-[#111] border border-[#222] rounded-xl p-8 text-center text-[var(--text-muted)]">
          No bookings found for this date.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {barbers.map(barber => {
            const barberAppts = appointments.filter(a => a.barberId === barber.id);
            return (
              <div key={barber.id} className="bg-[#111] border border-[#222] rounded-xl overflow-hidden">
                <div className="bg-[#1a1a1a] p-4 border-b border-[#222] flex justify-between items-center">
                  <h2 className="font-bold text-lg">{barber.name}'s Schedule</h2>
                  <span className="text-xs bg-[var(--gold)]/10 text-[var(--gold)] px-2 py-1 rounded-full">
                    {barberAppts.length} appointments
                  </span>
                </div>
                <div className="p-4 space-y-3">
                  {barberAppts.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)] italic py-4 text-center">No bookings yet.</p>
                  ) : (
                    barberAppts.map(appt => (
                      <div key={appt.id} className="flex gap-4 p-3 rounded-lg border border-[#222] bg-[#0a0a0a] hover:border-[var(--gold)]/30 transition-colors">
                        <div className="text-center min-w-[60px] shrink-0 border-r border-[#222] pr-4">
                          <p className="text-lg font-bold text-[var(--gold)]">{appt.time}</p>
                          <p className="text-[10px] uppercase text-[var(--text-muted)]">20 Min</p>
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-white">{appt.customer.name}</p>
                          <div className="text-xs text-[var(--text-muted)] mt-1 space-y-0.5">
                            <p>{appt.customer.phone}</p>
                            <p>{appt.customer.email}</p>
                          </div>
                        </div>
                        <div className="shrink-0 flex items-start">
                          <span className={`text-[10px] px-2 py-1 rounded uppercase tracking-wider ${
                            appt.status === "confirmed" ? "bg-green-500/10 text-green-400" : 
                            appt.status === "cancelled" ? "bg-red-500/10 text-red-400" :
                            "bg-gray-500/10 text-gray-400"
                          }`}>
                            {appt.status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
