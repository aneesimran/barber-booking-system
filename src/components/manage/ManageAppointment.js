"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { barbers, shopInfo } from "@/config/barbers";
import { formatLocalDate } from "@/lib/appointments";
import "@/app/manage/manage-page.css";

/**
 * ManageAppointment — Full client component for reschedule/cancel flow.
 * Accessed via email link: /manage/{appointmentId}?token={managementToken}
 */
export default function ManageAppointment({ appointmentId, token }) {
  const [state, setState] = useState("loading"); // loading | view | reschedule | cancelConfirm | success | error
  const [appointment, setAppointment] = useState(null);
  const [canModify, setCanModify] = useState(false);
  const [modifyReason, setModifyReason] = useState(null);
  const [error, setError] = useState(null);
  const [successType, setSuccessType] = useState(null); // "cancelled" | "rescheduled"

  // Reschedule state
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Reschedule success data
  const [newBookingDate, setNewBookingDate] = useState(null);
  const [newBookingTime, setNewBookingTime] = useState(null);

  // Fetch appointment details
  useEffect(() => {
    const fetchAppointment = async () => {
      try {
        const res = await fetch(`/api/manage-appointment?id=${appointmentId}&token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Failed to load appointment");
          setState("error");
          return;
        }

        setAppointment(data.appointment);
        setCanModify(data.canModify);
        setModifyReason(data.reason);
        setState("view");
      } catch (err) {
        console.error("Fetch error:", err);
        setError("Unable to load appointment details. Please try again.");
        setState("error");
      }
    };

    fetchAppointment();
  }, [appointmentId, token]);

  // Fetch available slots when a date is selected for rescheduling
  useEffect(() => {
    if (!selectedDate || !appointment) return;

    const fetchSlots = async () => {
      setLoadingSlots(true);
      setSelectedTime(null);

      try {
        const dateStr = formatLocalDate(selectedDate);
        const res = await fetch(`/api/available-slots?barberId=${appointment.barberId}&date=${dateStr}`);
        const data = await res.json();

        if (res.ok && data.slots) {
          // Filter out the current appointment's slot on same date (it should be available for re-selection)
          const isSameDate = dateStr === appointment.date;
          const slots = data.slots.map((slot) => {
            if (isSameDate && slot.time === appointment.time) {
              return { ...slot, available: true };
            }
            return slot;
          });
          setAvailableSlots(slots);
        } else {
          setAvailableSlots([]);
        }
      } catch (err) {
        console.error("Slots fetch error:", err);
        setAvailableSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchSlots();
  }, [selectedDate, appointment]);

  // Cancel appointment
  const handleCancel = useCallback(async () => {
    setProcessing(true);
    try {
      const res = await fetch("/api/manage-appointment/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId, token }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to cancel appointment");
        setProcessing(false);
        return;
      }

      setSuccessType("cancelled");
      setState("success");
    } catch (err) {
      console.error("Cancel error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [appointmentId, token]);

  // Reschedule appointment
  const handleReschedule = useCallback(async () => {
    if (!selectedDate || !selectedTime) return;

    setProcessing(true);
    try {
      const res = await fetch("/api/manage-appointment/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId,
          token,
          newDate: formatLocalDate(selectedDate),
          newTime: selectedTime,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to reschedule appointment");
        setProcessing(false);
        return;
      }

      setNewBookingDate(data.newDate);
      setNewBookingTime(data.newTime);
      setSuccessType("rescheduled");
      setState("success");
    } catch (err) {
      console.error("Reschedule error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [appointmentId, token, selectedDate, selectedTime]);

  // Helpers
  const formatDate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatTime12 = (t) => {
    const [h, m] = t.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayH}:${String(m).padStart(2, "0")} ${period}`;
  };

  const formatDateLabel = (dateStr) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  // Generate week dates for the date picker
  const generateWeekDates = (offset) => {
    const dates = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() + offset * 7);

    // If first week, start from today
    if (offset === 0) {
      startDate.setTime(today.getTime());
    }

    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      dates.push(d);
    }
    return dates;
  };

  const getWeekLabel = (dates) => {
    if (!dates.length) return "";
    const start = dates[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const end = dates[dates.length - 1].toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return `${start} — ${end}`;
  };

  const weekDates = generateWeekDates(weekOffset);
  const maxWeekOffset = Math.ceil(shopInfo.bookingWindowDays / 7) - 1;

  // Check if a date is a working day for the barber
  const isWorkingDay = (date) => {
    if (!appointment) return true;
    const barber = barbers.find((b) => b.id === appointment.barberId);
    if (!barber) return true;
    const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const dayKey = dayKeys[date.getDay()];
    return barber.workingHours[dayKey] !== null;
  };

  // Check if date is beyond booking window
  const isBeyondWindow = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + shopInfo.bookingWindowDays);
    return date >= maxDate;
  };

  // ===================== RENDER STATES =====================

  // Loading
  if (state === "loading") {
    return (
      <div className="manage-page">
        <div className="manage-loading">
          <div className="manage-loading-spinner" />
          <p>Loading appointment details...</p>
        </div>
      </div>
    );
  }

  // Error
  if (state === "error") {
    return (
      <div className="manage-page">
        <div className="manage-container">
          <div className="manage-error">
            <div className="manage-error-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h2>Unable to Load Appointment</h2>
            <p>{error || "The link may be invalid or the appointment was not found."}</p>
            <Link href="/" className="btn-gold inline-block text-sm" id="manage-error-home">
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Success (cancelled or rescheduled)
  if (state === "success") {
    return (
      <div className="manage-page">
        <div className="manage-container">
          <div className="manage-success">
            <div className={`manage-success-icon ${successType}`}>
              {successType === "cancelled" ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </div>

            <h2>{successType === "cancelled" ? "Appointment Cancelled" : "Appointment Rescheduled"}</h2>
            <p>
              {successType === "cancelled"
                ? "Your appointment has been cancelled. You can book a new appointment anytime."
                : "Your appointment has been updated. A confirmation email with your new details has been sent."}
            </p>

            {successType === "rescheduled" && newBookingDate && newBookingTime && (
              <div className="glass-card p-5 max-w-xs mx-auto mb-6 text-left">
                <div className="manage-detail-row">
                  <span className="manage-detail-label">New Date</span>
                  <span className="manage-detail-value" style={{ color: "var(--gold)" }}>{formatDateLabel(newBookingDate)}</span>
                </div>
                <div className="manage-detail-row" style={{ borderBottom: "none" }}>
                  <span className="manage-detail-label">New Time</span>
                  <span className="manage-detail-value" style={{ color: "var(--gold)" }}>{formatTime12(newBookingTime)}</span>
                </div>
              </div>
            )}

            <Link href="/" className="btn-gold inline-block text-sm" id="manage-success-home">
              ← Book Another Appointment
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Cancel confirmation modal
  if (state === "cancelConfirm") {
    return (
      <>
        {renderViewState()}
        <div className="manage-modal-overlay" onClick={() => !processing && setState("view")}>
          <div className="manage-modal" onClick={(e) => e.stopPropagation()}>
            <div className="manage-modal-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h3>Cancel Appointment?</h3>
            <p>
              Are you sure you want to cancel your appointment on{" "}
              <strong style={{ color: "white" }}>{formatDateLabel(appointment.date)}</strong> at{" "}
              <strong style={{ color: "white" }}>{formatTime12(appointment.time)}</strong>?
              This action cannot be undone.
            </p>
            <div className="manage-modal-actions">
              <button
                className="manage-modal-btn secondary"
                onClick={() => setState("view")}
                disabled={processing}
              >
                Keep It
              </button>
              <button
                className="manage-modal-btn danger"
                onClick={handleCancel}
                disabled={processing}
              >
                {processing ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
                    <span className="manage-loading-spinner" style={{ width: "14px", height: "14px", borderWidth: "2px" }} />
                    Cancelling...
                  </span>
                ) : (
                  "Yes, Cancel"
                )}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Reschedule flow
  if (state === "reschedule") {
    return (
      <div className="manage-page">
        <div className="manage-container">
          {/* Header with back button */}
          <div className="manage-reschedule-header">
            <button
              className="manage-reschedule-back"
              onClick={() => {
                setSelectedDate(null);
                setSelectedTime(null);
                setAvailableSlots([]);
                setWeekOffset(0);
                setState("view");
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="manage-reschedule-title">Reschedule</h2>
              <p className="manage-reschedule-subtitle">
                With {appointment.barberName} • Currently {formatDateLabel(appointment.date)}
              </p>
            </div>
          </div>

          <div className="glass-card p-5" style={{ animation: "fadeInUp 0.5s ease-out forwards" }}>
            {/* Step 1: Pick a date */}
            <p className="manage-time-label">Select a new date</p>

            {/* Week navigation */}
            <div className="manage-week-nav">
              <button
                className="manage-week-btn"
                disabled={weekOffset === 0}
                onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <span className="manage-week-label">{getWeekLabel(weekDates)}</span>
              <button
                className="manage-week-btn"
                disabled={weekOffset >= maxWeekOffset}
                onClick={() => setWeekOffset(Math.min(maxWeekOffset, weekOffset + 1))}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>

            {/* Date grid */}
            <div className="manage-date-grid">
              {weekDates.map((date, idx) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const isPast = date < today;
                const isClosedDay = !isWorkingDay(date);
                const isBeyond = isBeyondWindow(date);
                const isDisabled = isPast || isClosedDay || isBeyond;
                const isSelected = selectedDate && formatDate(selectedDate) === formatDate(date);

                return (
                  <button
                    key={idx}
                    className={`manage-date-cell ${isSelected ? "selected" : ""}`}
                    disabled={isDisabled}
                    onClick={() => setSelectedDate(date)}
                  >
                    <span className="manage-date-day">
                      {date.toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 3)}
                    </span>
                    <span className="manage-date-num">{date.getDate()}</span>
                  </button>
                );
              })}
            </div>

            {/* Step 2: Pick a time (shown after date selection) */}
            {selectedDate && (
              <>
                <p className="manage-time-label" style={{ marginTop: "1rem" }}>
                  Available times for {selectedDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
                </p>

                {loadingSlots ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "1.5rem" }}>
                    <div className="manage-loading-spinner" style={{ width: "1.25rem", height: "1.25rem" }} />
                  </div>
                ) : availableSlots.filter((s) => s.available).length === 0 ? (
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "1rem 0" }}>
                    No available slots on this date. Please try another day.
                  </p>
                ) : (
                  <div className="manage-time-grid">
                    {availableSlots
                      .filter((s) => s.available)
                      .map((slot) => (
                        <button
                          key={slot.time}
                          className={`manage-time-slot ${selectedTime === slot.time ? "selected" : ""}`}
                          onClick={() => setSelectedTime(slot.time)}
                        >
                          {formatTime12(slot.time)}
                        </button>
                      ))}
                  </div>
                )}
              </>
            )}

            {/* Confirm reschedule */}
            {selectedDate && selectedTime && (
              <button
                className="manage-confirm-btn"
                onClick={handleReschedule}
                disabled={processing}
                id="confirm-reschedule-btn"
              >
                {processing ? (
                  <>
                    <span className="manage-loading-spinner" style={{ width: "16px", height: "16px", borderWidth: "2px" }} />
                    Rescheduling...
                  </>
                ) : (
                  <>
                    Confirm — {selectedDate.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} at {formatTime12(selectedTime)}
                  </>
                )}
              </button>
            )}
          </div>

          {error && (
            <div className="manage-warning" style={{ animationDelay: "0ms" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "1px" }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p>{error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // View state (default)
  function renderViewState() {
    return (
      <div className="manage-page">
        <div className="manage-container">
          {/* Header */}
          <div className="manage-header">
            <div className="manage-header-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <h1 className="manage-title">Manage Appointment</h1>
            <p className="manage-subtitle">Hi {appointment.customerName}! Here are your booking details.</p>
          </div>

          {/* Details card */}
          <div className="glass-card p-5 manage-details-card">
            {/* Status badge */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
              <span className={`manage-status-badge ${appointment.status}`}>
                <span className="manage-status-dot" />
                {appointment.status}
              </span>
            </div>

            <div className="manage-detail-row">
              <span className="manage-detail-label">Barber</span>
              <span className="manage-detail-value">{appointment.barberName}</span>
            </div>
            <div className="manage-detail-row">
              <span className="manage-detail-label">Date</span>
              <span className="manage-detail-value">{formatDateLabel(appointment.date)}</span>
            </div>
            <div className="manage-detail-row">
              <span className="manage-detail-label">Time</span>
              <span className="manage-detail-value">{formatTime12(appointment.time)}</span>
            </div>
            <div className="manage-detail-row" style={{ borderBottom: "none" }}>
              <span className="manage-detail-label">Duration</span>
              <span className="manage-detail-value">{appointment.duration} mins</span>
            </div>

            {/* Show previous booking info if rescheduled */}
            {appointment.previousDate && appointment.previousTime && (
              <div style={{ marginTop: "0.5rem", padding: "0.6rem 0.75rem", background: "rgba(255,255,255,0.02)", borderRadius: "0.5rem" }}>
                <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", margin: 0 }}>
                  Rescheduled from: <span style={{ textDecoration: "line-through" }}>
                    {formatDateLabel(appointment.previousDate)} at {formatTime12(appointment.previousTime)}
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          {appointment.status === "confirmed" && (
            <>
              <div className="manage-actions">
                <button
                  className="manage-btn manage-btn-reschedule"
                  onClick={() => {
                    setError(null);
                    setState("reschedule");
                  }}
                  disabled={!canModify}
                  id="reschedule-btn"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  Reschedule
                </button>
                <button
                  className="manage-btn manage-btn-cancel"
                  onClick={() => {
                    setError(null);
                    setState("cancelConfirm");
                  }}
                  disabled={!canModify}
                  id="cancel-btn"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  Cancel
                </button>
              </div>

              {/* Warning if can't modify */}
              {!canModify && modifyReason && (
                <div className="manage-warning">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "1px" }}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p>
                    {modifyReason === "Appointment is less than 1 hour away"
                      ? "Changes are no longer available as your appointment is less than 1 hour away. Please contact us directly if you need to make changes."
                      : modifyReason}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Already cancelled message */}
          {appointment.status === "cancelled" && (
            <div className="manage-warning" style={{ borderColor: "rgba(239, 68, 68, 0.15)", background: "rgba(239, 68, 68, 0.06)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "1px" }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <p style={{ color: "#f87171" }}>This appointment has been cancelled. You can book a new appointment below.</p>
            </div>
          )}

          {/* Back to home */}
          <div style={{ textAlign: "center", marginTop: "1.5rem", animation: "fadeInUp 0.9s ease-out forwards", opacity: 0, animationDelay: "300ms" }}>
            <Link href="/" className="text-sm" style={{ color: "var(--text-muted)", transition: "color 0.2s" }} id="manage-back-home">
              ← Back to Home
            </Link>
          </div>

          {error && (
            <div className="manage-warning" style={{ animationDelay: "0ms", marginTop: "0.75rem" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "1px" }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p>{error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return renderViewState();
}
