"use client";
import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { barbers, dayKeys } from "@/config/barbers";
import { formatLocalDate } from "@/lib/appointments";

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

  // Custom Date Overrides States
  const [dateOverrides, setDateOverrides] = useState([]);
  const [loadingOverrides, setLoadingOverrides] = useState(true);
  const [overrideDate, setOverrideDate] = useState(() => formatLocalDate(new Date()));
  const [overrideOpen, setOverrideOpen] = useState(true);
  const [overrideStart, setOverrideStart] = useState("10:00");
  const [overrideEnd, setOverrideEnd] = useState("19:00");
  const [overrideLunchEnabled, setOverrideLunchEnabled] = useState(true);
  const [overrideLunchStart, setOverrideLunchStart] = useState("13:00");
  const [overrideLunchEnd, setOverrideLunchEnd] = useState("13:40");
  const [addingOverride, setAddingOverride] = useState(false);

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

    const fetchOverrides = async () => {
      setLoadingOverrides(true);
      try {
        const todayStr = formatLocalDate(new Date());
        const q = query(
          collection(db, "dateSchedules"),
          where("barberId", "==", selectedBarberId),
          where("date", ">=", todayStr)
        );
        const snap = await getDocs(q);
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        list.sort((a, b) => a.date.localeCompare(b.date));
        setDateOverrides(list);
      } catch (err) {
        console.error("Error fetching overrides:", err);
      } finally {
        setLoadingOverrides(false);
      }
    };

    fetchSchedule();
    fetchOverrides();
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

  const handleSaveOverride = async (e) => {
    e.preventDefault();
    if (!overrideDate) return;
    setAddingOverride(true);
    
    const docId = `${selectedBarberId}_${overrideDate}`;
    const overrideData = {
      barberId: selectedBarberId,
      date: overrideDate,
      workingHours: overrideOpen ? { start: overrideStart, end: overrideEnd } : null,
      lunchBreak: (overrideOpen && overrideLunchEnabled) ? { start: overrideLunchStart, end: overrideLunchEnd } : null,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.currentUser?.uid || "unknown"
    };

    try {
      await setDoc(doc(db, "dateSchedules", docId), overrideData);
      
      setDateOverrides(prev => {
        const filtered = prev.filter(o => o.date !== overrideDate);
        const newList = [...filtered, { id: docId, ...overrideData }];
        newList.sort((a, b) => a.date.localeCompare(b.date));
        return newList;
      });
      
      alert("Custom date schedule saved successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to save custom date schedule. Check permissions.");
    } finally {
      setAddingOverride(false);
    }
  };

  const handleDeleteOverride = async (id) => {
    if (!confirm("Are you sure you want to remove this date override? This date will revert back to the weekly default schedule.")) return;
    try {
      await deleteDoc(doc(db, "dateSchedules", id));
      setDateOverrides(prev => prev.filter(o => o.id !== id));
    } catch (err) {
      console.error(err);
      alert("Failed to delete override.");
    }
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
            <div className="p-4 space-y-3">
              {dayKeys.map((day) => {
                const hours = schedule.workingHours[day];
                const isOpen = !!hours;
                return (
                  <div key={day} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-[#0a0a0a] border border-[#222] gap-3">
                    <div className="flex items-center justify-between sm:justify-start gap-4">
                      <div className="font-semibold capitalize text-white w-20">{dayLabels[day]}</div>
                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={() => toggleDay(day)}
                          className={`w-12 h-6 rounded-full relative transition-colors ${isOpen ? 'bg-[var(--gold)]' : 'bg-[#333]'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${isOpen ? 'left-7 bg-[#0a0a0a]' : 'left-1'}`} />
                        </button>
                        <span className="text-xs uppercase w-12 text-[var(--text-muted)]">{isOpen ? "Open" : "Closed"}</span>
                      </div>
                    </div>
                    
                    {isOpen && (
                      <div className="flex items-center gap-2.5 bg-[#111] sm:bg-transparent border border-[#333] sm:border-0 rounded-lg p-2 sm:p-0 justify-center sm:justify-end">
                        <input
                          type="time"
                          value={hours.start}
                          onChange={(e) => updateDay(day, 'start', e.target.value)}
                          className="bg-[#0a0a0a] border border-[#333] rounded px-3 py-1.5 sm:py-1 text-sm focus:border-[var(--gold)] focus:outline-none text-white text-center font-medium"
                        />
                        <span className="text-xs text-[var(--text-muted)] font-medium">to</span>
                        <input
                          type="time"
                          value={hours.end}
                          onChange={(e) => updateDay(day, 'end', e.target.value)}
                          className="bg-[#0a0a0a] border border-[#333] rounded px-3 py-1.5 sm:py-1 text-sm focus:border-[var(--gold)] focus:outline-none text-white text-center font-medium"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lunch Break */}
          <div className="bg-[#111] border border-[#222] rounded-xl overflow-hidden">
            <div className="bg-[#1a1a1a] p-4 border-b border-[#222]">
              <h2 className="font-bold text-lg text-white">Daily Lunch Break</h2>
              <p className="text-xs text-[var(--text-muted)] mt-1">This time will be automatically blocked off every working day.</p>
            </div>
            <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleLunch}
                  className={`w-12 h-6 rounded-full relative transition-colors ${schedule.lunchBreak ? 'bg-[var(--gold)]' : 'bg-[#333]'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${schedule.lunchBreak ? 'left-7 bg-[#0a0a0a]' : 'left-1'}`} />
                </button>
                <span className="text-sm font-medium text-white">{schedule.lunchBreak ? "Enabled" : "Disabled"}</span>
              </div>
              
              {schedule.lunchBreak && (
                <div className="flex items-center gap-2.5 bg-[#0a0a0a] sm:bg-transparent border border-[#222] sm:border-0 rounded-lg p-2.5 sm:p-0 justify-center w-full sm:w-auto">
                  <input
                    type="time"
                    value={schedule.lunchBreak.start}
                    onChange={(e) => updateLunch('start', e.target.value)}
                    className="bg-[#0a0a0a] border border-[#333] rounded px-3 py-1.5 sm:py-2 focus:border-[var(--gold)] focus:outline-none text-white text-center font-medium text-sm"
                  />
                  <span className="text-xs text-[var(--text-muted)] font-medium">to</span>
                  <input
                    type="time"
                    value={schedule.lunchBreak.end}
                    onChange={(e) => updateLunch('end', e.target.value)}
                    className="bg-[#0a0a0a] border border-[#333] rounded px-3 py-1.5 sm:py-2 focus:border-[var(--gold)] focus:outline-none text-white text-center font-medium text-sm"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Custom Date Overrides Card */}
          <div className="bg-[#111] border border-[#222] rounded-xl overflow-hidden mt-8">
            <div className="bg-[#1a1a1a] p-4 border-b border-[#222]">
              <h2 className="font-bold text-lg text-white">Custom Date Overrides</h2>
              <p className="text-xs text-[var(--text-muted)] mt-1">Set special hours or time off for specific dates (e.g. holidays, leaving early).</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Form to Add Override */}
                <form onSubmit={handleSaveOverride} className="space-y-4 bg-[#0a0a0a] p-4 rounded-xl border border-[#222]">
                  <h3 className="font-semibold text-white text-sm">Add/Edit Date Override</h3>
                  
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1 font-medium">Select Date</label>
                    <input 
                      type="date"
                      value={overrideDate}
                      min={formatLocalDate(new Date())}
                      onChange={(e) => setOverrideDate(e.target.value)}
                      required
                      className="w-full bg-[#111] border border-[#333] text-white px-3 py-2 rounded focus:outline-none focus:border-[var(--gold)] text-sm"
                    />
                  </div>

                  <div className="flex items-center justify-between border-t border-[#222] pt-3">
                    <span className="text-sm font-medium text-white">Working on this date?</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setOverrideOpen(!overrideOpen)}
                        className={`w-12 h-6 rounded-full relative transition-colors ${overrideOpen ? 'bg-[var(--gold)]' : 'bg-[#333]'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${overrideOpen ? 'left-7 bg-[#0a0a0a]' : 'left-1'}`} />
                      </button>
                      <span className="text-xs uppercase w-12 text-[var(--text-muted)]">{overrideOpen ? "Open" : "Closed"}</span>
                    </div>
                  </div>

                  {overrideOpen && (
                    <>
                      <div className="grid grid-cols-2 gap-4 border-t border-[#222] pt-3">
                        <div>
                          <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1 font-medium">Start Time</label>
                          <input 
                            type="time"
                            value={overrideStart}
                            onChange={(e) => setOverrideStart(e.target.value)}
                            required
                            className="w-full bg-[#111] border border-[#333] text-white px-3 py-2 rounded focus:outline-none focus:border-[var(--gold)] text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1 font-medium">End Time</label>
                          <input 
                            type="time"
                            value={overrideEnd}
                            onChange={(e) => setOverrideEnd(e.target.value)}
                            required
                            className="w-full bg-[#111] border border-[#333] text-white px-3 py-2 rounded focus:outline-none focus:border-[var(--gold)] text-sm"
                          />
                        </div>
                      </div>

                      <div className="border-t border-[#222] pt-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-white">Lunch break on this date?</span>
                          <button
                            type="button"
                            onClick={() => setOverrideLunchEnabled(!overrideLunchEnabled)}
                            className={`w-12 h-6 rounded-full relative transition-colors ${overrideLunchEnabled ? 'bg-[var(--gold)]' : 'bg-[#333]'}`}
                          >
                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${overrideLunchEnabled ? 'left-7 bg-[#0a0a0a]' : 'left-1'}`} />
                          </button>
                        </div>
                        
                        {overrideLunchEnabled && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1 font-medium">Lunch Start</label>
                              <input 
                                type="time"
                                value={overrideLunchStart}
                                onChange={(e) => setOverrideLunchStart(e.target.value)}
                                required
                                className="w-full bg-[#111] border border-[#333] text-white px-3 py-2 rounded focus:outline-none focus:border-[var(--gold)] text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1 font-medium">Lunch End</label>
                              <input 
                                type="time"
                                value={overrideLunchEnd}
                                onChange={(e) => setOverrideLunchEnd(e.target.value)}
                                required
                                className="w-full bg-[#111] border border-[#333] text-white px-3 py-2 rounded focus:outline-none focus:border-[var(--gold)] text-sm"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  <button
                    type="submit"
                    disabled={addingOverride}
                    className="w-full bg-[var(--gold)] text-[#0a0a0a] py-2 rounded font-bold hover:shadow-[0_0_15px_rgba(201,168,76,0.2)] transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                  >
                    {addingOverride && <div className="w-4 h-4 border-2 border-[#0a0a0a]/30 border-t-[#0a0a0a] rounded-full animate-spin" />}
                    Save Date Override
                  </button>
                </form>

                {/* List of Current Overrides */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-white text-sm">Active Date Overrides</h3>
                  
                  {loadingOverrides ? (
                    <div className="flex justify-center py-10">
                      <div className="w-6 h-6 border-2 border-[var(--gold)]/30 border-t-[var(--gold)] rounded-full animate-spin" />
                    </div>
                  ) : dateOverrides.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] italic bg-[#0a0a0a] p-4 rounded-xl border border-[#222] text-center">
                      No custom date overrides configured. Default weekly hours apply to all dates.
                    </p>
                  ) : (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                      {dateOverrides.map(override => {
                        const [y, m, d] = override.date.split("-").map(Number);
                        const dateObj = new Date(y, m - 1, d);
                        const dateFormatted = dateObj.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
                        
                        return (
                          <div key={override.id} className="flex justify-between items-center bg-[#0a0a0a] p-3 rounded-lg border border-[#222] text-xs">
                            <div>
                              <p className="font-bold text-white mb-0.5">{dateFormatted}</p>
                              {override.workingHours ? (
                                <p className="text-[var(--gold)]">
                                  Hours: {override.workingHours.start} - {override.workingHours.end}
                                  {override.lunchBreak && ` (Lunch: ${override.lunchBreak.start}-${override.lunchBreak.end})`}
                                </p>
                              ) : (
                                <p className="text-red-400 font-medium">Off / Closed</p>
                              )}
                            </div>
                            <button
                              onClick={() => handleDeleteOverride(override.id)}
                              className="text-red-400 hover:text-red-300 px-2.5 py-1.5 rounded hover:bg-red-500/10 transition-colors"
                              title="Delete Override"
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
