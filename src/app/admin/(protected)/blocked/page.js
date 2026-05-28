"use client";
import { useState, useEffect } from "react";
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { barbers } from "@/config/barbers";
import { getBarberSchedule, generateTimeSlots, getBookedSlots, formatLocalDate } from "@/lib/appointments";

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

  useEffect(() => {
    const fetchSlots = async () => {
      setLoading(true);
      try {
        const [y, m, d] = selectedDate.split("-").map(Number);
        const localDate = new Date(y, m - 1, d);
        
        const schedule = await getBarberSchedule(selectedBarberId);
        const allTimes = generateTimeSlots(schedule, localDate);
        
        const bookedTimes = await getBookedSlots(selectedBarberId, selectedDate);
        
        const blockedQ = query(
          collection(db, "blockedSlots"),
          where("barberId", "==", selectedBarberId),
          where("date", "==", selectedDate)
        );
        const blockedSnap = await getDocs(blockedQ);
        const blockedDocs = blockedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const slotsData = allTimes.map(time => {
          const isBooked = bookedTimes.includes(time);
          const blockedDoc = blockedDocs.find(b => b.time === time);
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
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (selectedBarberId && selectedDate) {
      fetchSlots();
    }
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
    
    // Set loading in UI list
    setSlots(prev => prev.map(s => s.time === slotTime ? { ...s, loading: true } : s));
    
    // Close modal
    setSelectedSlotForModal(null);
    setModalAction(null);
    
    try {
      const newDoc = await addDoc(collection(db, "blockedSlots"), {
        barberId: selectedBarberId,
        date: selectedDate,
        time: slotTime,
        reason: finalReason,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || "unknown"
      });
      setSlots(prev => prev.map(s => s.time === slotTime ? { 
        ...s, 
        isBlocked: true, 
        blockedId: newDoc.id, 
        reason: finalReason,
        loading: false 
      } : s));
    } catch (err) {
      console.error(err);
      setSlots(prev => prev.map(s => s.time === slotTime ? { ...s, loading: false } : s));
      alert("Failed to block slot. Check permissions.");
    }
  };

  const executeUnblock = async () => {
    if (!selectedSlotForModal || !selectedSlotForModal.blockedId) return;
    
    const slotTime = selectedSlotForModal.time;
    const blockedId = selectedSlotForModal.blockedId;
    
    // Set loading in UI list
    setSlots(prev => prev.map(s => s.time === slotTime ? { ...s, loading: true } : s));
    
    // Close modal
    setSelectedSlotForModal(null);
    setModalAction(null);
    
    try {
      await deleteDoc(doc(db, "blockedSlots", blockedId));
      setSlots(prev => prev.map(s => s.time === slotTime ? { 
        ...s, 
        isBlocked: false, 
        blockedId: null, 
        reason: null,
        loading: false 
      } : s));
    } catch (err) {
      console.error(err);
      setSlots(prev => prev.map(s => s.time === slotTime ? { ...s, loading: false } : s));
      alert("Failed to unblock slot. Check permissions.");
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>Blocked Slots</h1>
          <p className="text-[var(--text-muted)]">Manually block specific times so customers can't book them.</p>
        </div>
        <div className="flex gap-4 items-center">
          <select 
            value={selectedBarberId}
            onChange={(e) => setSelectedBarberId(e.target.value)}
            className="bg-[#111] border border-[#333] text-white px-4 py-2 rounded-lg focus:outline-none focus:border-[var(--gold)]"
          >
            {barbers.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
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
