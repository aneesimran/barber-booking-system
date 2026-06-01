"use client";
import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { barbers } from "@/config/barbers";
import { formatLocalDate } from "@/lib/appointments";

export default function DashboardPage() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => {
    return formatLocalDate(new Date());
  });

  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [modalSuccess, setModalSuccess] = useState("");

  const [selectedBlockedSlot, setSelectedBlockedSlot] = useState(null);
  const [unblockingLoading, setUnblockingLoading] = useState(false);

  const handleUnblockFromDashboard = async () => {
    if (!selectedBlockedSlot) return;
    setUnblockingLoading(true);
    try {
      await deleteDoc(doc(db, "blockedSlots", selectedBlockedSlot.id));
      setAppointments(prev => prev.filter(item => item.id !== selectedBlockedSlot.id));
      setSelectedBlockedSlot(null);
    } catch (err) {
      console.error(err);
      alert("Failed to unblock slot: " + (err.message || "Unknown error"));
    } finally {
      setUnblockingLoading(false);
    }
  };

  const handlePrevDay = () => {
    setSelectedDate(prev => {
      const [y, m, d] = prev.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      date.setDate(date.getDate() - 1);
      return formatLocalDate(date);
    });
  };

  const handleNextDay = () => {
    setSelectedDate(prev => {
      const [y, m, d] = prev.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      date.setDate(date.getDate() + 1);
      return formatLocalDate(date);
    });
  };

  const handleCancelBooking = async () => {
    if (!selectedAppointment) return;
    setActionLoading(true);
    setModalError("");
    setModalSuccess("");
    try {
      const apptRef = doc(db, "appointments", selectedAppointment.id);
      await updateDoc(apptRef, { 
        status: "cancelled",
        updatedAt: new Date().toISOString()
      });

      // Send cancellation notification (SMS & Email) asynchronously
      try {
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          fetch("/api/admin/send-cancellation", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              customerName: selectedAppointment.customer.name,
              customerPhone: selectedAppointment.customer.phone,
              customerEmail: selectedAppointment.customer.email,
              barberId: selectedAppointment.barberId,
              date: selectedAppointment.date,
              time: selectedAppointment.time
            }),
          });
        }
      } catch (smsErr) {
        console.error("Failed to send cancellation notification:", smsErr);
      }
      
      setAppointments(prev => prev.map(a => a.id === selectedAppointment.id ? { ...a, status: "cancelled" } : a));
      setModalSuccess("Appointment cancelled successfully!");
      setTimeout(() => {
        setSelectedAppointment(null);
        setModalSuccess("");
      }, 1500);
    } catch (err) {
      console.error(err);
      setModalError("Failed to cancel appointment: " + (err.message || "Unknown error"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleNoShowBooking = async () => {
    if (!selectedAppointment) return;
    setActionLoading(true);
    setModalError("");
    setModalSuccess("");
    try {
      const stripeCustomerId = selectedAppointment.customer.stripeCustomerId;
      if (!stripeCustomerId) {
        throw new Error("No credit card was vaulted for this customer. Cannot process charge.");
      }

      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/charge-no-show", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          stripeCustomerId,
          customerName: selectedAppointment.customer.name
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to process charge via Stripe.");
      }

      const apptRef = doc(db, "appointments", selectedAppointment.id);
      await updateDoc(apptRef, { 
        status: "no-show",
        stripeChargeId: data.chargeId,
        updatedAt: new Date().toISOString()
      });

      setAppointments(prev => prev.map(a => a.id === selectedAppointment.id ? { 
        ...a, 
        status: "no-show", 
        stripeChargeId: data.chargeId 
      } : a));

      setModalSuccess(`Successfully marked as No-Show and charged customer £5.00!`);
      setTimeout(() => {
        setSelectedAppointment(null);
        setModalSuccess("");
      }, 2500);
    } catch (err) {
      console.error(err);
      setModalError(err.message || "Failed to process no-show fee.");
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    const fetchBookings = async (showSkeleton = false) => {
      if (showSkeleton) setLoading(true);
      try {
        // Query appointments
        const apptQ = query(
          collection(db, "appointments"),
          where("date", "==", selectedDate)
        );
        const apptSnap = await getDocs(apptQ);
        
        const bookingsData = [];
        for (const d of apptSnap.docs) {
          const appt = d.data();
          const customerSnap = await getDoc(doc(db, "customers", appt.customerId));
          const customer = customerSnap.exists() ? customerSnap.data() : { name: "Unknown", phone: "", email: "" };
          bookingsData.push({ id: d.id, ...appt, customer, isBlockedSlot: false });
        }
        
        // Query blocked slots
        const blockedQ = query(
          collection(db, "blockedSlots"),
          where("date", "==", selectedDate)
        );
        const blockedSnap = await getDocs(blockedQ);
        const blockedData = blockedSnap.docs.map(doc => {
          const b = doc.data();
          return {
            id: doc.id,
            barberId: b.barberId,
            date: b.date,
            time: b.time,
            reason: b.reason || "Manual Block",
            isBlockedSlot: true
          };
        });

        const combined = [...bookingsData, ...blockedData];
        combined.sort((a, b) => a.time.localeCompare(b.time));
        setAppointments(combined);
      } catch (err) {
        console.error("Error fetching bookings:", err);
      } finally {
        if (showSkeleton) setLoading(false);
      }
    };

    // Initial load (show loading spinner)
    fetchBookings(true);

    // Auto-refresh every 5 minutes (300,000 ms) in the background
    const intervalId = setInterval(() => {
      fetchBookings(false);
    }, 300000);

    return () => clearInterval(intervalId);
  }, [selectedDate]);

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center items-start mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>Dashboard</h1>
          <p className="text-[var(--text-muted)]">View and manage bookings.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handlePrevDay}
            className="bg-[#111] hover:bg-[#222] border border-[#333] text-[var(--text-muted)] hover:text-white p-2 rounded-lg transition-colors active:scale-95"
            title="Previous Day"
            aria-label="Previous day"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          
          <input 
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-[#111] border border-[#333] text-white px-4 py-2 rounded-lg focus:outline-none focus:border-[var(--gold)] text-center font-medium"
          />

          <button 
            onClick={handleNextDay}
            className="bg-[#111] hover:bg-[#222] border border-[#333] text-[var(--text-muted)] hover:text-white p-2 rounded-lg transition-colors active:scale-95"
            title="Next Day"
            aria-label="Next day"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-[var(--gold)]/30 border-t-[var(--gold)] rounded-full animate-spin" />
        </div>
      ) : appointments.length === 0 ? (
        <div className="bg-[#111] border border-[#222] rounded-xl p-8 text-center text-[var(--text-muted)]">
          No bookings or blocked slots found for this date.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {barbers.map(barber => {
            const barberAppts = appointments.filter(a => a.barberId === barber.id);
            const bookingsCount = barberAppts.filter(a => !a.isBlockedSlot).length;
            const blockedCount = barberAppts.filter(a => a.isBlockedSlot).length;

            return (
              <div key={barber.id} className="bg-[#111] border border-[#222] rounded-xl overflow-hidden">
                <div className="bg-[#1a1a1a] p-4 border-b border-[#222] flex justify-between items-center">
                  <h2 className="font-bold text-lg">{barber.name}'s Schedule</h2>
                  <span className="text-xs bg-[var(--gold)]/10 text-[var(--gold)] px-2 py-1 rounded-full font-medium">
                    {bookingsCount} {bookingsCount === 1 ? "booking" : "bookings"}
                    {blockedCount > 0 && ` • ${blockedCount} blocked`}
                  </span>
                </div>
                <div className="p-4 space-y-3">
                  {barberAppts.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)] italic py-4 text-center">No schedule entries.</p>
                  ) : (
                    barberAppts.map(item => {
                      if (item.isBlockedSlot) {
                        return (
                          <div 
                            key={item.id} 
                            onClick={() => setSelectedBlockedSlot(item)}
                            className="flex gap-4 p-3 rounded-lg border border-red-500/10 bg-red-500/5 hover:border-red-500/30 cursor-pointer hover:bg-red-500/[0.08] transition-all"
                          >
                            <div className="text-center min-w-[60px] shrink-0 border-r border-red-500/10 pr-4">
                              <p className="text-lg font-bold text-red-400">{item.time}</p>
                              <p className="text-[10px] uppercase text-red-400/60">Blocked</p>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-white truncate">Blocked Time Slot</p>
                              <div className="text-xs text-[var(--text-muted)] mt-1 space-y-0.5">
                                <p className="truncate italic">Reason: {item.reason}</p>
                              </div>
                            </div>
                            <div className="shrink-0 flex items-start">
                              <span className="text-[10px] px-2 py-1 rounded uppercase tracking-wider bg-red-500/10 text-red-400">
                                Blocked
                              </span>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div 
                          key={item.id} 
                          onClick={() => setSelectedAppointment(item)}
                          className="flex gap-4 p-3 rounded-lg border border-[#222] bg-[#0a0a0a] hover:border-[var(--gold)]/50 cursor-pointer hover:bg-white/[0.02] transition-all"
                        >
                          <div className="text-center min-w-[60px] shrink-0 border-r border-[#222] pr-4">
                            <p className="text-lg font-bold text-[var(--gold)]">{item.time}</p>
                            <p className="text-[10px] uppercase text-[var(--text-muted)]">20 Min</p>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-white truncate">{item.customer.name}</p>
                            <div className="text-xs text-[var(--text-muted)] mt-1 space-y-0.5">
                              <p className="truncate">{item.customer.phone}</p>
                              <p className="truncate" title={item.customer.email}>{item.customer.email}</p>
                            </div>
                          </div>
                          <div className="shrink-0 flex items-start">
                            <span className={`text-[10px] px-2 py-1 rounded uppercase tracking-wider ${
                              item.status === "confirmed" ? "bg-green-500/10 text-green-400" : 
                              item.status === "cancelled" ? "bg-red-500/10 text-red-400" :
                              item.status === "no-show" ? "bg-amber-500/10 text-amber-400" :
                              "bg-gray-500/10 text-gray-400"
                            }`}>
                              {item.status}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Appointment Action Modal */}
      {selectedAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-[#111] border border-[#222] rounded-2xl p-6 shadow-2xl animate-fade-in-up">
            <button 
              onClick={() => {
                setSelectedAppointment(null);
                setModalError("");
                setModalSuccess("");
              }}
              className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-white transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>

            <h3 className="text-xl font-bold text-white mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
              Manage Booking
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-6">Review details and update booking status.</p>

            {modalError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs px-4 py-3 rounded-lg mb-4">
                {modalError}
              </div>
            )}

            {modalSuccess && (
              <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-xs px-4 py-3 rounded-lg mb-4">
                {modalSuccess}
              </div>
            )}

            <div className="space-y-4 mb-6 bg-[#0a0a0a] p-4 rounded-xl border border-[#222] min-w-0">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Customer</span>
                <p className="font-semibold text-white truncate">{selectedAppointment.customer.name}</p>
                <p className="text-xs text-[var(--text-muted)] break-all">{selectedAppointment.customer.phone} • {selectedAppointment.customer.email}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-[#222] pt-3">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Time & Date</span>
                  <p className="text-sm font-medium text-white">{selectedAppointment.time} on {selectedAppointment.date}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Barber</span>
                  <p className="text-sm font-medium text-white capitalize">{selectedAppointment.barberId}</p>
                </div>
              </div>

              <div className="border-t border-[#222] pt-3">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Current Status</span>
                <div>
                  <span className={`inline-block text-[10px] px-2 py-0.5 rounded uppercase tracking-wider mt-1 ${
                    selectedAppointment.status === "confirmed" ? "bg-green-500/10 text-green-400" : 
                    selectedAppointment.status === "cancelled" ? "bg-red-500/10 text-red-400" :
                    selectedAppointment.status === "no-show" ? "bg-amber-500/10 text-amber-400" :
                    "bg-gray-500/10 text-gray-400"
                  }`}>
                    {selectedAppointment.status}
                  </span>
                </div>
              </div>
            </div>

            {selectedAppointment.status === "confirmed" && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleCancelBooking}
                  disabled={actionLoading}
                  className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 hover:border-red-500/50 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
                >
                  {actionLoading ? "Processing..." : "Cancel Booking"}
                </button>
                <button
                  onClick={handleNoShowBooking}
                  disabled={actionLoading}
                  className="w-full bg-[var(--gold)] hover:bg-[var(--gold)]/90 text-[#0a0a0a] py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 hover:shadow-[0_0_15px_rgba(201,168,76,0.2)]"
                >
                  {actionLoading ? (
                    <div className="w-4 h-4 border-2 border-[#0a0a0a]/30 border-t-[#0a0a0a] rounded-full animate-spin" />
                  ) : (
                    "Mark as No-Show & Charge £5"
                  )}
                </button>
              </div>
            )}

            {selectedAppointment.status !== "confirmed" && (
              <button
                onClick={() => {
                  setSelectedAppointment(null);
                  setModalError("");
                  setModalSuccess("");
                }}
                className="w-full bg-[#222] hover:bg-[#333] text-white py-2.5 rounded-lg text-sm font-semibold transition-all"
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}

      {/* Blocked Slot Details Modal */}
      {selectedBlockedSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-[#111] border border-[#222] rounded-2xl p-6 shadow-2xl animate-fade-in-up">
            <button 
              onClick={() => {
                setSelectedBlockedSlot(null);
              }}
              className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-white transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>

            <h3 className="text-xl font-bold text-white mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
              Blocked Time Slot
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-6">Details of blocked slot and option to unblock.</p>

            <div className="space-y-4 mb-6 bg-[#0a0a0a] p-4 rounded-xl border border-[#222]">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Time & Date</span>
                  <p className="text-sm font-medium text-white">{selectedBlockedSlot.time} on {selectedBlockedSlot.date}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Barber</span>
                  <p className="text-sm font-medium text-white capitalize">{selectedBlockedSlot.barberId}</p>
                </div>
              </div>

              <div className="border-t border-[#222] pt-3">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Reason for Block</span>
                <p className="text-sm font-semibold text-white mt-1 break-all">{selectedBlockedSlot.reason}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedBlockedSlot(null)}
                className="flex-1 bg-[#222] hover:bg-[#333] text-white py-2.5 rounded-lg text-sm font-semibold transition-all"
              >
                Close
              </button>
              <button
                onClick={handleUnblockFromDashboard}
                disabled={unblockingLoading}
                className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 hover:border-red-500/50 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {unblockingLoading && <div className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />}
                Unblock Slot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
