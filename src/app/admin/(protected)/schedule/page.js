"use client";
import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { barbers, dayKeys } from "@/config/barbers";

const dayLabels = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", 
  thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday"
};

export default function SchedulePage() {
  const [selectedBarberId, setSelectedBarberId] = useState(barbers[0].id);
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  useEffect(() => {
    const fetchSchedule = async () => {
      setLoading(true);
      setMessage({ text: "", type: "" });
      try {
        const docRef = doc(db, "barberSchedules", selectedBarberId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setSchedule(snap.data());
        } else {
          // Fallback to static
          const staticBarber = barbers.find(b => b.id === selectedBarberId);
          setSchedule({
            workingHours: staticBarber.workingHours,
            lunchBreak: staticBarber.lunchBreak || null
          });
        }
      } catch (err) {
        console.error(err);
        setMessage({ text: "Failed to load schedule.", type: "error" });
      } finally {
        setLoading(false);
      }
    };
    fetchSchedule();
  }, [selectedBarberId]);

  const handleSave = async () => {
    setSaving(true);
    setMessage({ text: "", type: "" });
    try {
      await setDoc(doc(db, "barberSchedules", selectedBarberId), {
        ...schedule,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.uid || "unknown"
      });
      setMessage({ text: "Schedule saved successfully.", type: "success" });
    } catch (err) {
      console.error(err);
      setMessage({ text: "Failed to save schedule. Check permissions.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const updateDay = (day, field, value) => {
    setSchedule(prev => {
      const newHours = { ...prev.workingHours };
      if (!newHours[day]) newHours[day] = { start: "09:00", end: "18:00" };
      newHours[day] = { ...newHours[day], [field]: value };
      return { ...prev, workingHours: newHours };
    });
  };

  const toggleDay = (day) => {
    setSchedule(prev => {
      const newHours = { ...prev.workingHours };
      if (newHours[day]) {
        newHours[day] = null;
      } else {
        newHours[day] = { start: "09:00", end: "18:00" };
      }
      return { ...prev, workingHours: newHours };
    });
  };

  const updateLunch = (field, value) => {
    setSchedule(prev => {
      const newLunch = prev.lunchBreak ? { ...prev.lunchBreak } : { start: "13:00", end: "13:40" };
      newLunch[field] = value;
      return { ...prev, lunchBreak: newLunch };
    });
  };

  const toggleLunch = () => {
    setSchedule(prev => ({
      ...prev,
      lunchBreak: prev.lunchBreak ? null : { start: "13:00", end: "13:40" }
    }));
  };

  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center items-start mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>Working Hours</h1>
          <p className="text-[var(--text-muted)]">Manage weekly schedules and lunch breaks.</p>
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
          <button
            onClick={handleSave}
            disabled={loading || saving}
            className="bg-[var(--gold)] text-[#0a0a0a] px-6 py-2 rounded-lg font-bold hover:shadow-[0_0_15px_rgba(201,168,76,0.3)] transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <div className="w-4 h-4 border-2 border-[#0a0a0a]/30 border-t-[#0a0a0a] rounded-full animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>

      {message.text && (
        <div className={`px-4 py-3 rounded-lg mb-6 text-sm border ${
          message.type === "error" ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-green-500/10 border-green-500/30 text-green-400"
        }`}>
          {message.text}
        </div>
      )}

      {loading || !schedule ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-[var(--gold)]/30 border-t-[var(--gold)] rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Working Hours */}
          <div className="bg-[#111] border border-[#222] rounded-xl overflow-hidden">
            <div className="bg-[#1a1a1a] p-4 border-b border-[#222]">
              <h2 className="font-bold text-lg text-white">Weekly Schedule</h2>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-[100px_1fr] gap-y-4 items-center">
                {dayKeys.map((day) => {
                  const hours = schedule.workingHours[day];
                  const isOpen = !!hours;
                  return (
                    <div key={day} className="contents">
                      <div className="font-medium capitalize text-[var(--text-muted)]">{dayLabels[day]}</div>
                      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                        <button
                          onClick={() => toggleDay(day)}
                          className={`w-12 h-6 rounded-full relative transition-colors ${isOpen ? 'bg-[var(--gold)]' : 'bg-[#333]'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${isOpen ? 'left-7 bg-[#0a0a0a]' : 'left-1'}`} />
                        </button>
                        <span className="text-xs uppercase w-12 text-center text-[var(--text-muted)]">{isOpen ? "Open" : "Closed"}</span>
                        
                        {isOpen && (
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={hours.start}
                              onChange={(e) => updateDay(day, 'start', e.target.value)}
                              className="bg-[#0a0a0a] border border-[#333] rounded px-2 py-1 text-sm focus:border-[var(--gold)] focus:outline-none"
                            />
                            <span className="text-[var(--text-muted)]">to</span>
                            <input
                              type="time"
                              value={hours.end}
                              onChange={(e) => updateDay(day, 'end', e.target.value)}
                              className="bg-[#0a0a0a] border border-[#333] rounded px-2 py-1 text-sm focus:border-[var(--gold)] focus:outline-none"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Lunch Break */}
          <div className="bg-[#111] border border-[#222] rounded-xl overflow-hidden">
            <div className="bg-[#1a1a1a] p-4 border-b border-[#222]">
              <h2 className="font-bold text-lg text-white">Daily Lunch Break</h2>
              <p className="text-xs text-[var(--text-muted)] mt-1">This time will be automatically blocked off every working day.</p>
            </div>
            <div className="p-6 flex items-center gap-4">
              <button
                onClick={toggleLunch}
                className={`w-12 h-6 rounded-full relative transition-colors ${schedule.lunchBreak ? 'bg-[var(--gold)]' : 'bg-[#333]'}`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${schedule.lunchBreak ? 'left-7 bg-[#0a0a0a]' : 'left-1'}`} />
              </button>
              <span className="text-sm font-medium">{schedule.lunchBreak ? "Enabled" : "Disabled"}</span>
              
              {schedule.lunchBreak && (
                <div className="flex items-center gap-2 ml-4">
                  <input
                    type="time"
                    value={schedule.lunchBreak.start}
                    onChange={(e) => updateLunch('start', e.target.value)}
                    className="bg-[#0a0a0a] border border-[#333] rounded px-3 py-2 focus:border-[var(--gold)] focus:outline-none"
                  />
                  <span className="text-[var(--text-muted)]">to</span>
                  <input
                    type="time"
                    value={schedule.lunchBreak.end}
                    onChange={(e) => updateLunch('end', e.target.value)}
                    className="bg-[#0a0a0a] border border-[#333] rounded px-3 py-2 focus:border-[var(--gold)] focus:outline-none"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
