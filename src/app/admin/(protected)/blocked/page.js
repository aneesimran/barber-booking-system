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

  const toggleBlock = async (slot) => {
    if (slot.isBooked) return; // cannot block already booked slots
    
    const isBlocking = !slot.isBlocked;
    setSlots(prev => prev.map(s => s.time === slot.time ? { ...s, isBlocked: isBlocking, loading: true } : s));
    
    try {
      if (isBlocking) {
        const newDoc = await addDoc(collection(db, "blockedSlots"), {
          barberId: selectedBarberId,
          date: selectedDate,
          time: slot.time,
          reason: "Manual Block",
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.uid || "unknown"
        });
        setSlots(prev => prev.map(s => s.time === slot.time ? { ...s, blockedId: newDoc.id, loading: false } : s));
      } else {
        if (slot.blockedId) {
          await deleteDoc(doc(db, "blockedSlots", slot.blockedId));
        }
        setSlots(prev => prev.map(s => s.time === slot.time ? { ...s, blockedId: null, loading: false } : s));
      }
    } catch (err) {
      console.error(err);
      setSlots(prev => prev.map(s => s.time === slot.time ? { ...s, isBlocked: slot.isBlocked, loading: false } : s));
      alert("Failed to update blocked slot. Check permissions.");
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
                  onClick={() => toggleBlock(slot)}
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
    </div>
  );
}
