"use client";
import { useState, useEffect } from "react";
import { collection, query, where, getDocs, getDoc, setDoc, deleteDoc, doc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { barbers } from "@/config/barbers";
import { getBarberScheduleForDate, generateTimeSlots, formatLocalDate, getBlockedSlotId } from "@/lib/appointments";

export default function BlockedSlotsPage() {
  const [selectedBarberId, setSelectedBarberId] = useState(barbers[0].id);
  const [selectedDate, setSelectedDate] = useState(() => {
    return formatLocalDate(new Date());
  });
  
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal States for Blocking/Unblocking
  const [selectedSlotForModal, setSelectedSlotForModal] = useState(null);
  const [modalAction, setModalAction] = useState(null); // 'block' or 'unblock'
  const [reason, setReason] = useState("");

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

  const getSelectedDayName = () => {
    if (!selectedDate) return "";
    const [y, m, d] = selectedDate.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const today = new Date();
    const isToday = today.getFullYear() === y && today.getMonth() === (m - 1) && today.getDate() === d;
    
    const formatted = dateObj.toLocaleDateString("en-GB", { 
      weekday: "long", 
      day: "numeric", 
      month: "long", 
      year: "numeric" 
    });
    return isToday ? `${formatted} (Today)` : formatted;
  };

  // Real-time synchronization for appointments and blocked slots
  useEffect(() => {
    let unsubscribeAppts = null;
    let unsubscribeBlocked = null;
    let isMounted = true;

    const setupRealtimeListeners = async () => {
      setLoading(true);
      try {
        const [y, m, d] = selectedDate.split("-").map(Number);
        const localDate = new Date(y, m - 1, d);
        
        const schedule = await getBarberScheduleForDate(selectedBarberId, selectedDate);
        if (!isMounted) return;

        const allTimes = generateTimeSlots(schedule, localDate);

        let latestBookedTimes = [];
        let latestBlockedDocs = [];

        const updateSlotGrid = () => {
          if (!isMounted) return;
          const blockedByTime = new Map();
          latestBlockedDocs.forEach(b => {
            if (!blockedByTime.has(b.time) || b.id === getBlockedSlotId(selectedBarberId, selectedDate, b.time)) {
              blockedByTime.set(b.time, b);
            }
          });

          const currentBarber = barbers.find(b => b.id === selectedBarberId);
          const currentDuration = currentBarber?.slotDuration || 20;

          const slotsData = allTimes.map(time => {
            const [h, m] = time.split(":").map(Number);
            const slotStart = h * 60 + m;
            const slotEnd = slotStart + currentDuration;

            const isBooked = latestBookedTimes.some(bt => {
              if (bt === time) return true;
              const [bh, bm] = bt.split(":").map(Number);
              const bStart = bh * 60 + bm;
              return bStart >= slotStart && bStart < slotEnd;
            });

            const blockedDoc = Array.from(blockedByTime.values()).find(b => {
              if (b.time === time) return true;
              const [bh, bm] = b.time.split(":").map(Number);
              const bStart = bh * 60 + bm;
              return bStart >= slotStart && bStart < slotEnd;
            });

            return {
              time,
              isBooked,
              isBlocked: !!blockedDoc,
              blockedId: blockedDoc ? blockedDoc.id : null,
              reason: blockedDoc ? blockedDoc.reason : null,
              loading: false,
            };
          });
          setSlots(slotsData);
          setLoading(false);
        };

        // 1. Real-time listener for appointments
        const apptQ = query(
          collection(db, "appointments"),
          where("barberId", "==", selectedBarberId),
          where("date", "==", selectedDate)
        );

        unsubscribeAppts = onSnapshot(apptQ, (snap) => {
          latestBookedTimes = snap.docs
            .filter(d => {
              const status = d.data().status;
              return status === "confirmed" || status === "completed";
            })
            .map(d => d.data().time);
          updateSlotGrid();
        }, (err) => {
          console.error("Appointments snapshot error:", err);
          if (isMounted) setLoading(false);
        });

        // 2. Real-time listener for blocked slots
        const blockedQ = query(
          collection(db, "blockedSlots"),
          where("barberId", "==", selectedBarberId),
          where("date", "==", selectedDate)
        );

        unsubscribeBlocked = onSnapshot(blockedQ, (snap) => {
          latestBlockedDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

          // Auto-migrate any legacy random-ID blocks for today/future to deterministic IDs and remove duplicates
          const todayStr = formatLocalDate(new Date());
          if (selectedDate >= todayStr && auth.currentUser) {
            snap.docs.forEach(d => {
              const data = d.data();
              if (data.barberId && data.date && data.time) {
                const detId = getBlockedSlotId(data.barberId, data.date, data.time);
                if (d.id !== detId) {
                  setDoc(doc(db, "blockedSlots", detId), {
                    barberId: data.barberId,
                    date: data.date,
                    time: data.time,
                    reason: data.reason || "Manual Block",
                    createdAt: data.createdAt || serverTimestamp(),
                    createdBy: data.createdBy || auth.currentUser?.uid || "unknown"
                  }).then(() => {
                    // Delete old random-ID document now that deterministic one is saved
                    deleteDoc(doc(db, "blockedSlots", d.id)).catch(() => {});
                  }).catch(e => console.warn("Auto-migration notice:", e));
                }
              }
            });
          }

          updateSlotGrid();
        }, (err) => {
          console.error("Blocked slots snapshot error:", err);
          if (isMounted) setLoading(false);
        });

      } catch (err) {
        console.error("Error setting up listeners:", err);
        if (isMounted) setLoading(false);
      }
    };

    if (selectedBarberId && selectedDate) {
      setupRealtimeListeners();
    }

    return () => {
      isMounted = false;
      if (unsubscribeAppts) unsubscribeAppts();
      if (unsubscribeBlocked) unsubscribeBlocked();
    };
  }, [selectedBarberId, selectedDate]);

  const handleSlotClick = (slot) => {
    if (slot.isBooked) return;
    setSelectedSlotForModal(slot);
    if (slot.isBlocked) {
      setModalAction("unblock");
    } else {
      setModalAction("block");
      setReason("");
    }
  };

  const executeBlock = async () => {
    if (!selectedSlotForModal) return;
    
    const slotTime = selectedSlotForModal.time;
    const finalReason = reason.trim() || "Manual Block";
    const slotDocId = getBlockedSlotId(selectedBarberId, selectedDate, slotTime);
    
    // Set loading in UI list
    setSlots(prev => prev.map(s => s.time === slotTime ? { ...s, loading: true } : s));
    
    // Close modal
    setSelectedSlotForModal(null);
    setModalAction(null);
    
    try {
      // 1. Double check Firestore for any active confirmed appointments for this slot
      const apptQ = query(
        collection(db, "appointments"),
        where("barberId", "==", selectedBarberId),
        where("date", "==", selectedDate),
        where("time", "==", slotTime)
      );
      const apptSnap = await getDocs(apptQ);
      const activeAppt = apptSnap.docs.find(d => {
        const s = d.data().status;
        return s === "confirmed" || s === "completed";
      });

      if (activeAppt) {
        let customerInfo = "a customer";
        const customerId = activeAppt.data().customerId;
        if (customerId) {
          try {
            const custSnap = await getDoc(doc(db, "customers", customerId));
            if (custSnap.exists()) {
              const c = custSnap.data();
              customerInfo = `${c.name || "Customer"}${c.phone ? ` (${c.phone})` : ""}`;
            }
          } catch {}
        }
        setSlots(prev => prev.map(s => s.time === slotTime ? { ...s, loading: false } : s));
        alert(`Cannot block this slot: It is already booked by ${customerInfo}.\n\nPlease cancel the booking from the Dashboard first if you need to free up this time slot.`);
        return;
      }

      // 2. Write block with deterministic document ID: {barberId}_{date}_{time}
      await setDoc(doc(db, "blockedSlots", slotDocId), {
        barberId: selectedBarberId,
        date: selectedDate,
        time: slotTime,
        reason: finalReason,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || "unknown"
      });

      // UI will update immediately via real-time onSnapshot listener
    } catch (err) {
      console.error("Error blocking slot:", err);
      setSlots(prev => prev.map(s => s.time === slotTime ? { ...s, loading: false } : s));
      alert("Failed to block slot. Check permissions.");
    }
  };

  const executeUnblock = async () => {
    if (!selectedSlotForModal) return;
    
    const slotTime = selectedSlotForModal.time;
    const deterministicId = getBlockedSlotId(selectedBarberId, selectedDate, slotTime);
    
    // Set loading in UI list
    setSlots(prev => prev.map(s => s.time === slotTime ? { ...s, loading: true } : s));
    
    // Close modal
    setSelectedSlotForModal(null);
    setModalAction(null);
    
    try {
      // Find and delete ALL blocked documents for this slot (both deterministic and legacy)
      const q = query(
        collection(db, "blockedSlots"),
        where("barberId", "==", selectedBarberId),
        where("date", "==", selectedDate),
        where("time", "==", slotTime)
      );
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      await deleteDoc(doc(db, "blockedSlots", deterministicId)).catch(() => {});
      // UI will update immediately via onSnapshot listener
    } catch (err) {
      console.error("Error unblocking slot:", err);
      setSlots(prev => prev.map(s => s.time === slotTime ? { ...s, loading: false } : s));
      alert("Failed to unblock slot. Check permissions.");
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>Blocked Slots</h1>
          <p className="text-[var(--text-muted)]">
            Schedule for <span className="text-[var(--gold)] font-semibold">{getSelectedDayName()}</span>
          </p>
        </div>
        <div className="flex gap-4 items-center flex-wrap sm:flex-nowrap">
          <select 
            value={selectedBarberId}
            onChange={(e) => setSelectedBarberId(e.target.value)}
            className="bg-[#111] border border-[#333] text-white px-4 h-[38px] rounded-lg focus:outline-none focus:border-[var(--gold)] shrink-0 font-medium"
          >
            {barbers.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={handlePrevDay}
              className="bg-[#111] hover:bg-[#222] border border-[#333] text-[var(--text-muted)] hover:text-white h-[38px] w-[38px] rounded-lg transition-colors active:scale-95 flex items-center justify-center shrink-0"
              title="Previous Day"
              aria-label="Previous day"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            
            <button
              onClick={() => setSelectedDate(formatLocalDate(new Date()))}
              className="px-4 h-[38px] text-xs font-semibold uppercase tracking-wider bg-[#111] hover:bg-[#222] text-[var(--gold)] border border-[#333] rounded-lg transition-all active:scale-95 flex items-center justify-center shrink-0"
              title="Go to Today"
            >
              Today
            </button>

            <input 
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-[#111] border border-[#333] text-white px-4 h-[38px] rounded-lg focus:outline-none focus:border-[var(--gold)] text-center font-medium shrink-0"
            />

            <button 
              onClick={handleNextDay}
              className="bg-[#111] hover:bg-[#222] border border-[#333] text-[var(--text-muted)] hover:text-white h-[38px] w-[38px] rounded-lg transition-colors active:scale-95 flex items-center justify-center shrink-0"
              title="Next Day"
              aria-label="Next day"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-[var(--gold)]/30 border-t-[var(--gold)] rounded-full animate-spin" />
        </div>
      ) : slots.length === 0 ? (
        <div className="bg-[#111] border border-[#222] rounded-xl p-8 text-center text-[var(--text-muted)]">
          No working hours for this date.
        </div>
      ) : (
        <div className="bg-[#111] border border-[#222] rounded-xl p-6">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {slots.map(slot => {
              const isBooked = slot.isBooked;
              const isBlocked = slot.isBlocked;
              const isLoading = slot.loading;

              let buttonClass = "bg-[var(--card-bg)] border border-[var(--glass-border)] text-white hover:border-[var(--card-border-hover)] hover:bg-[rgba(255,255,255,0.06)] cursor-pointer";
              if (isBooked) {
                buttonClass = "bg-green-500/10 border border-green-500/30 text-green-400 cursor-not-allowed opacity-80";
              } else if (isBlocked) {
                buttonClass = "bg-red-500/10 border border-red-500/30 text-red-400 cursor-pointer hover:bg-red-500/20";
              }

              return (
                <button
                  key={slot.time}
                  disabled={isBooked || isLoading}
                  onClick={() => handleSlotClick(slot)}
                  className={`relative py-3 px-2 rounded-xl text-sm font-medium transition-all duration-300 ${buttonClass}`}
                >
                  {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    </div>
                  )}
                  {slot.time}
                  {isBooked && <div className="text-[10px] uppercase mt-0.5 opacity-80">Booked</div>}
                  {isBlocked && !isBooked && <div className="text-[10px] uppercase mt-0.5 opacity-80">Blocked</div>}
                  {!isBooked && !isBlocked && <div className="text-[10px] uppercase mt-0.5 text-[var(--text-muted)]">Available</div>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Block/Unblock Modal */}
      {selectedSlotForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-[#111] border border-[#222] rounded-2xl p-6 shadow-2xl animate-fade-in-up">
            <button 
              onClick={() => {
                setSelectedSlotForModal(null);
                setModalAction(null);
              }}
              className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-white transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>

            {modalAction === "block" ? (
              <>
                <h3 className="text-xl font-bold text-white mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Block Time Slot
                </h3>
                <p className="text-xs text-[var(--text-muted)] mb-6">
                  Block {selectedSlotForModal.time} on {selectedDate} for {barbers.find(b => b.id === selectedBarberId)?.name}.
                </p>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2 font-medium">
                      Reason / Description (Optional)
                    </label>
                    <input 
                      type="text"
                      placeholder="e.g., Personal appointment, Maintenance..."
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#333] text-white px-4 py-2.5 rounded-lg focus:outline-none focus:border-[var(--gold)] text-sm"
                      maxLength={100}
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setSelectedSlotForModal(null);
                      setModalAction(null);
                    }}
                    className="flex-1 bg-[#222] hover:bg-[#333] text-white py-2.5 rounded-lg text-sm font-semibold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={executeBlock}
                    className="flex-1 bg-[var(--gold)] hover:bg-[var(--gold)]/90 text-[#0a0a0a] py-2.5 rounded-lg text-sm font-bold transition-all hover:shadow-[0_0_15px_rgba(201,168,76,0.2)]"
                  >
                    Block Slot
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold text-white mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Unblock Time Slot
                </h3>
                <p className="text-xs text-[var(--text-muted)] mb-6">
                  Unblock {selectedSlotForModal.time} on {selectedDate} for {barbers.find(b => b.id === selectedBarberId)?.name}.
                </p>

                <div className="bg-[#0a0a0a] p-4 rounded-xl border border-[#222] mb-6">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Current Block Reason</span>
                  <p className="font-semibold text-white mt-1 text-sm break-all">{selectedSlotForModal.reason || "Manual Block"}</p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setSelectedSlotForModal(null);
                      setModalAction(null);
                    }}
                    className="flex-1 bg-[#222] hover:bg-[#333] text-white py-2.5 rounded-lg text-sm font-semibold transition-all"
                  >
                    Close
                  </button>
                  <button
                    onClick={executeUnblock}
                    className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 hover:border-red-500/50 py-2.5 rounded-lg text-sm font-semibold transition-all"
                  >
                    Unblock Slot
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
