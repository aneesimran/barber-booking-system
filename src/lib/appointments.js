import {
  collection,
  query,
  where,
  getDocs,
  getDocFromServer,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { randomUUID } from "crypto";
import { barbers, dayKeys, shopInfo, getBarberSlotDuration } from "@/config/barbers";

/**
 * Returns deterministic document ID for a blocked slot.
 * @param {string} barberId - e.g. "imran" or "ali"
 * @param {string} date - "YYYY-MM-DD"
 * @param {string} time - "HH:MM"
 * @returns {string} e.g. "imran_2026-09-03_12:00"
 */
export function getBlockedSlotId(barberId, date, time) {
  return `${barberId}_${date}_${time}`;
}

/**
 * Formats a Date object as "YYYY-MM-DD" in local time.
 * This avoids timezone shifting issues caused by toISOString() on local midnight dates.
 * @param {Date} date
 * @returns {string}
 */
export function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ============================================================================
// REST API Fallbacks for Server-Side (Next.js Node.js Environment)
// To bypass gRPC / WebSocket hanging issues in Next.js server-side
// ============================================================================

async function getBarberScheduleRest(barberId) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/barberSchedules/${barberId}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`REST schedule fetch failed: ${res.statusText}`);
    }
    const data = await res.json();
    const fields = data.fields || {};
    const schedule = { barberId };
    
    if (fields.workingHours && fields.workingHours.mapValue) {
      schedule.workingHours = {};
      const whFields = fields.workingHours.mapValue.fields || {};
      for (const [day, val] of Object.entries(whFields)) {
        if (val.nullValue !== undefined) {
          schedule.workingHours[day] = null;
        } else if (val.mapValue) {
          const start = val.mapValue.fields?.start?.stringValue;
          const end = val.mapValue.fields?.end?.stringValue;
          schedule.workingHours[day] = { start, end };
        }
      }
    }
    
    if (fields.lunchBreak) {
      if (fields.lunchBreak.nullValue !== undefined) {
        schedule.lunchBreak = null;
      } else if (fields.lunchBreak.mapValue) {
        const start = fields.lunchBreak.mapValue.fields?.start?.stringValue;
        const end = fields.lunchBreak.mapValue.fields?.end?.stringValue;
        schedule.lunchBreak = { start, end };
      }
    }
    return schedule;
  } catch (err) {
    console.error("Error in getBarberScheduleRest:", err);
    return null;
  }
}

async function getBarberDateScheduleRest(barberId, dateString) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const docId = `${barberId}_${dateString}`;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/dateSchedules/${docId}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`REST date schedule fetch failed: ${res.statusText}`);
    }
    const data = await res.json();
    const fields = data.fields || {};
    const schedule = {};
    
    if (fields.workingHours) {
      if (fields.workingHours.nullValue !== undefined) {
        schedule.workingHours = null;
      } else if (fields.workingHours.mapValue) {
        const start = fields.workingHours.mapValue.fields?.start?.stringValue;
        const end = fields.workingHours.mapValue.fields?.end?.stringValue;
        schedule.workingHours = { start, end };
      }
    }
    
    if (fields.lunchBreak) {
      if (fields.lunchBreak.nullValue !== undefined) {
        schedule.lunchBreak = null;
      } else if (fields.lunchBreak.mapValue) {
        const start = fields.lunchBreak.mapValue.fields?.start?.stringValue;
        const end = fields.lunchBreak.mapValue.fields?.end?.stringValue;
        schedule.lunchBreak = { start, end };
      }
    }
    return schedule;
  } catch (err) {
    console.error("Error in getBarberDateScheduleRest:", err);
    return null;
  }
}

async function getBookedSlotsRest(barberId, dateString) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const query = {
    structuredQuery: {
      from: [{ collectionId: "appointments" }],
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: "barberId" },
                op: "EQUAL",
                value: { stringValue: barberId }
              }
            },
            {
              fieldFilter: {
                field: { fieldPath: "date" },
                op: "EQUAL",
                value: { stringValue: dateString }
              }
            }
          ]
        }
      }
    }
  };
  
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
      cache: "no-store"
    });
    
    if (!res.ok) throw new Error(`REST query error: ${res.statusText}`);
    const data = await res.json();
    
    const bookedSlots = [];
    for (const item of data) {
      if (item.document) {
        const fields = item.document.fields || {};
        const status = fields.status?.stringValue;
        if (status === "confirmed" || status === "completed") {
          const time = fields.time?.stringValue;
          if (time) bookedSlots.push(time);
        }
      }
    }
    return bookedSlots;
  } catch (err) {
    console.error("Error in getBookedSlotsRest:", err);
    throw err;
  }
}

async function getBlockedSlotsRest(barberId, dateString) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const query = {
    structuredQuery: {
      from: [{ collectionId: "blockedSlots" }],
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: "barberId" },
                op: "EQUAL",
                value: { stringValue: barberId }
              }
            },
            {
              fieldFilter: {
                field: { fieldPath: "date" },
                op: "EQUAL",
                value: { stringValue: dateString }
              }
            }
          ]
        }
      }
    }
  };
  
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
      cache: "no-store"
    });
    
    if (!res.ok) throw new Error(`REST blocked slots query error: ${res.statusText}`);
    const data = await res.json();
    
    const blockedSlots = [];
    for (const item of data) {
      if (item.document) {
        const fields = item.document.fields || {};
        const time = fields.time?.stringValue;
        if (time && !blockedSlots.includes(time)) blockedSlots.push(time);
      }
    }
    return blockedSlots;
  } catch (err) {
    console.error("Error in getBlockedSlotsRest:", err);
    throw err;
  }
}

/**
 * Check if a specific slot is blocked via Firestore REST API.
 * First checks direct document /blockedSlots/{barberId}_{date}_{time}.
 * Falls back to collection query for backward compatibility.
 * @param {string} barberId
 * @param {string} dateString - "YYYY-MM-DD"
 * @param {string} timeString - "HH:MM"
 * @returns {Promise<boolean>}
 */
export async function isSlotBlockedRest(barberId, dateString, timeString) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const docId = getBlockedSlotId(barberId, dateString, timeString);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/blockedSlots/${docId}`;
  
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) return true;
    if (res.status === 404) {
      // Check collection query as fallback for legacy random ID docs
      const blocked = await getBlockedSlotsRest(barberId, dateString);
      return blocked.includes(timeString);
    }
    throw new Error(`REST blocked check error: ${res.statusText}`);
  } catch (err) {
    console.error("Error in isSlotBlockedRest:", err);
    throw err;
  }
}

async function createOrFindCustomerRest(data) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  
  // Find customer by email
  const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const queryBody = {
    structuredQuery: {
      from: [{ collectionId: "customers" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "email" },
          op: "EQUAL",
          value: { stringValue: data.email }
        }
      }
    }
  };
  
  const queryRes = await fetch(queryUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(queryBody),
    cache: "no-store"
  });
  
  if (queryRes.ok) {
    const results = await queryRes.json();
    for (const item of results) {
      if (item.document) {
        const docId = item.document.name.split("/").pop();
        const fields = item.document.fields || {};
        const existingStripeCustomerId = fields.stripeCustomerId?.stringValue;
        if (data.stripeCustomerId && existingStripeCustomerId !== data.stripeCustomerId) {
          // Update customer document via PATCH REST API
          const updateUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/customers/${docId}?updateMask.fieldPaths=stripeCustomerId`;
          const updateBody = {
            fields: {
              stripeCustomerId: { stringValue: data.stripeCustomerId }
            }
          };
          try {
            await fetch(updateUrl, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updateBody),
              cache: "no-store"
            });
          } catch (err) {
            console.error("Error updating customer stripeCustomerId via REST:", err);
          }
        }
        return docId;
      }
    }
  }
  
  // Create new customer
  const createUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/customers`;
  const customerDoc = {
    fields: {
      name: { stringValue: data.name },
      email: { stringValue: data.email },
      phone: { stringValue: data.phone },
      stripeCustomerId: data.stripeCustomerId ? { stringValue: data.stripeCustomerId } : { nullValue: null },
      createdAt: { timestampValue: new Date().toISOString() }
    }
  };
  
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(customerDoc),
    cache: "no-store"
  });
  
  if (!createRes.ok) {
    throw new Error(`REST customer creation failed: ${createRes.statusText}`);
  }
  
  const createdData = await createRes.json();
  return createdData.name.split("/").pop();
}

async function createAppointmentRest(data) {
  // Pre-write verification: ensure slot is not blocked
  const blocked = await isSlotBlockedRest(data.barberId, data.date, data.time);
  if (blocked) {
    throw new Error("This time slot is blocked and cannot be booked.");
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const createUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/appointments`;
  const managementToken = randomUUID();
  
  const appointmentDoc = {
    fields: {
      barberId: { stringValue: data.barberId },
      customerId: { stringValue: data.customerId },
      date: { stringValue: data.date },
      time: { stringValue: data.time },
      duration: { integerValue: data.duration || getBarberSlotDuration(data.barberId) },
      status: { stringValue: "confirmed" },
      reminderSent: { booleanValue: false },
      managementToken: { stringValue: managementToken },
      stripeSetupIntentId: data.stripeSetupIntentId ? { stringValue: data.stripeSetupIntentId } : { nullValue: null },
      createdAt: { timestampValue: new Date().toISOString() }
    }
  };
  
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(appointmentDoc),
    cache: "no-store"
  });
  
  if (!createRes.ok) {
    throw new Error(`REST appointment creation failed: ${createRes.statusText}`);
  }
  
  const createdData = await createRes.json();
  const appointmentId = createdData.name.split("/").pop();
  return { appointmentId, managementToken };
}

/**
 * Fetch a single appointment document by ID via Firestore REST API.
 * @param {string} appointmentId
 * @returns {Promise<Object|null>} Parsed appointment data with id, or null if not found
 */
export async function getAppointmentByIdRest(appointmentId) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/appointments/${appointmentId}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`REST appointment fetch failed: ${res.statusText}`);
    }
    const data = await res.json();
    const fields = data.fields || {};
    return {
      id: appointmentId,
      barberId: fields.barberId?.stringValue || null,
      customerId: fields.customerId?.stringValue || null,
      date: fields.date?.stringValue || null,
      time: fields.time?.stringValue || null,
      duration: parseInt(fields.duration?.integerValue || "20", 10),
      status: fields.status?.stringValue || null,
      managementToken: fields.managementToken?.stringValue || null,
      stripeSetupIntentId: fields.stripeSetupIntentId?.stringValue || null,
      reminderSent: fields.reminderSent?.booleanValue || false,
      createdAt: fields.createdAt?.timestampValue || null,
      cancelledAt: fields.cancelledAt?.timestampValue || null,
      rescheduledAt: fields.rescheduledAt?.timestampValue || null,
      previousDate: fields.previousDate?.stringValue || null,
      previousTime: fields.previousTime?.stringValue || null,
    };
  } catch (err) {
    console.error("Error in getAppointmentByIdRest:", err);
    return null;
  }
}

/**
 * Update an appointment document via Firestore REST API.
 * @param {string} appointmentId
 * @param {Object} updates - Key/value pairs to update
 * @returns {Promise<boolean>} True if successful
 */
export async function updateAppointmentRest(appointmentId, updates) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const fieldPaths = Object.keys(updates).map(k => `updateMask.fieldPaths=${k}`).join("&");
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/appointments/${appointmentId}?${fieldPaths}`;
  
  const fields = {};
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === "string") {
      fields[key] = { stringValue: value };
    } else if (typeof value === "boolean") {
      fields[key] = { booleanValue: value };
    } else if (value instanceof Date) {
      fields[key] = { timestampValue: value.toISOString() };
    } else if (typeof value === "number") {
      fields[key] = { integerValue: String(value) };
    }
  }
  
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
    cache: "no-store"
  });
  
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(`REST appointment update failed: ${res.statusText} ${JSON.stringify(errData)}`);
  }
  return true;
}

/**
 * Fetch a customer document by ID via Firestore REST API.
 * @param {string} customerId
 * @returns {Promise<Object|null>}
 */
export async function getCustomerByIdRest(customerId) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/customers/${customerId}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`REST customer fetch failed: ${res.statusText}`);
    }
    const data = await res.json();
    const fields = data.fields || {};
    return {
      id: customerId,
      name: fields.name?.stringValue || null,
      email: fields.email?.stringValue || null,
      phone: fields.phone?.stringValue || null,
    };
  } catch (err) {
    console.error("Error in getCustomerByIdRest:", err);
    return null;
  }
}

/**
 * Generate all possible 20-minute time slots for a barber on a given date, based on their schedule.
 * @param {Object} schedule - Barber's schedule object containing workingHours and lunchBreak
 * @param {Date} date
 * @returns {string[]} Array of time strings like ["09:00", "09:20", ...]
 */
export function generateTimeSlots(schedule, date) {
  if (!schedule) return [];

  const dayKey = dayKeys[date.getDay()];
  const hours = schedule.workingHours?.[dayKey];
  if (!hours) return []; // barber doesn't work this day

  const slots = [];
  const [startH, startM] = hours.start.split(":").map(Number);
  const [endH, endM] = hours.end.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const duration = schedule.slotDuration || schedule.appointmentDuration || (schedule.barberId ? getBarberSlotDuration(schedule.barberId) : shopInfo.appointmentDuration);

  let lunchStartMins = -1;
  let lunchEndMins = -1;
  // Friday closure: 12:20 PM (740 mins) to 2:00 PM (840 mins)
  const isFriday = date.getDay() === 5;
  const isAliFriday = isFriday && schedule.barberId === "ali";

  if (schedule.lunchBreak && !isAliFriday) {
    const [lStartH, lStartM] = schedule.lunchBreak.start.split(":").map(Number);
    const [lEndH, lEndM] = schedule.lunchBreak.end.split(":").map(Number);
    lunchStartMins = lStartH * 60 + lStartM;
    lunchEndMins = lEndH * 60 + lEndM;
  }

  const friCloseStart = 12 * 60 + 20;
  const friCloseEnd = 14 * 60;

  for (let m = startMinutes; m + duration <= endMinutes; m += duration) {
    // Skip slots that overlap with Friday shop closure
    if (isFriday) {
      if (m < friCloseEnd && m + duration > friCloseStart) continue;
    }

    // Skip slots that overlap with lunch break
    if (lunchStartMins > -1 && lunchEndMins > -1) {
      if (m < lunchEndMins && m + duration > lunchStartMins) continue;
    }

    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }

  return slots;
}

/**
 * Fetch booked appointment times for a barber on a specific date from Firestore.
 * @param {string} barberId
 * @param {string} dateString - ISO date string "YYYY-MM-DD"
 * @param {Object} [options]
 * @param {boolean} [options.throwOnError=false]
 * @returns {Promise<string[]>} Array of booked time strings like ["09:00", "10:40"]
 */
export async function getBookedSlots(barberId, dateString, { throwOnError = false } = {}) {
  if (typeof window === "undefined") {
    try {
      return await getBookedSlotsRest(barberId, dateString);
    } catch (err) {
      if (throwOnError) throw err;
      return [];
    }
  }

  try {
    const appointmentsRef = collection(db, "appointments");
    const q = query(
      appointmentsRef,
      where("barberId", "==", barberId),
      where("date", "==", dateString)
    );

    const snapshot = await getDocs(q);
    // Filter to only confirmed/completed appointments client-side
    return snapshot.docs
      .filter((doc) => {
        const status = doc.data().status;
        return status === "confirmed" || status === "completed";
      })
      .map((doc) => doc.data().time);
  } catch (error) {
    console.error("Error fetching booked slots:", error);
    if (throwOnError) throw error;
    return [];
  }
}

/**
 * Fetch a barber's schedule from Firestore, falling back to static config.
 * @param {string} barberId 
 * @returns {Promise<Object>} Schedule object with workingHours and lunchBreak
 */
export async function getBarberSchedule(barberId) {
  if (typeof window === "undefined") {
    const restSchedule = await getBarberScheduleRest(barberId);
    if (restSchedule) return restSchedule;
  } else {
    try {
      const scheduleRef = doc(db, "barberSchedules", barberId);
      const snap = await getDoc(scheduleRef);
      if (snap.exists()) {
        return { barberId, ...snap.data() };
      }
    } catch (err) {
      console.error("Error fetching schedule, using fallback", err);
    }
  }

  // Fallback to static config
  const barber = barbers.find((b) => b.id === barberId);
  if (!barber) return null;
  return {
    barberId,
    workingHours: barber.workingHours,
    lunchBreak: barber.lunchBreak,
    slotDuration: getBarberSlotDuration(barberId),
  };
}

/**
 * Fetch a barber's schedule for a specific date, checking for overrides first, falling back to weekly.
 * @param {string} barberId 
 * @param {string} dateString - "YYYY-MM-DD"
 * @returns {Promise<Object>} Schedule object
 */
export async function getBarberScheduleForDate(barberId, dateString) {
  const [y, m, d] = dateString.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dayKey = dayKeys[dateObj.getDay()];

  // 1. Check for date-specific override
  let dateOverride = null;
  if (typeof window === "undefined") {
    dateOverride = await getBarberDateScheduleRest(barberId, dateString);
  } else {
    try {
      const docRef = doc(db, "dateSchedules", `${barberId}_${dateString}`);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        dateOverride = snap.data();
      }
    } catch (err) {
      console.error("Error fetching date schedule override:", err);
    }
  }

  if (dateOverride) {
    return {
      barberId,
      workingHours: {
        [dayKey]: dateOverride.workingHours ? {
          start: dateOverride.workingHours.start,
          end: dateOverride.workingHours.end
        } : null
      },
      lunchBreak: dateOverride.lunchBreak,
      slotDuration: getBarberSlotDuration(barberId),
    };
  }

  // 2. Revert to weekly schedule
  return getBarberSchedule(barberId);
}

/**
 * Fetch blocked slots for a barber on a specific date.
 * @param {string} barberId 
 * @param {string} dateString 
 * @param {Object} [options]
 * @param {boolean} [options.throwOnError=false]
 * @returns {Promise<string[]>} Array of blocked time strings
 */
export async function getBlockedSlots(barberId, dateString, { throwOnError = false } = {}) {
  if (typeof window === "undefined") {
    try {
      return await getBlockedSlotsRest(barberId, dateString);
    } catch (err) {
      if (throwOnError) throw err;
      return [];
    }
  }

  try {
    const blockedRef = collection(db, "blockedSlots");
    const q = query(
      blockedRef,
      where("barberId", "==", barberId),
      where("date", "==", dateString)
    );
    const snapshot = await getDocs(q);
    return Array.from(new Set(snapshot.docs.map(doc => doc.data().time).filter(Boolean)));
  } catch (err) {
    console.error("Error fetching blocked slots:", err);
    if (throwOnError) throw err;
    return [];
  }
}

/**
 * Check if a specific slot is blocked (direct document lookup + collection fallback).
 * Uses getDocFromServer on client to guarantee fresh server state bypassing local cache.
 * @param {string} barberId
 * @param {string} dateString - "YYYY-MM-DD"
 * @param {string} timeString - "HH:MM"
 * @returns {Promise<boolean>}
 */
export async function isSlotBlocked(barberId, dateString, timeString) {
  if (typeof window === "undefined") {
    return isSlotBlockedRest(barberId, dateString, timeString);
  }

  const slotId = getBlockedSlotId(barberId, dateString, timeString);
  try {
    const docRef = doc(db, "blockedSlots", slotId);
    let snap = null;
    try {
      snap = await getDocFromServer(docRef);
    } catch (serverErr) {
      console.warn("getDocFromServer failed, falling back to getDoc:", serverErr);
      snap = await getDoc(docRef);
    }

    if (snap && snap.exists()) return true;

    // Fallback check against collection query for legacy random-ID docs
    const blockedSlots = await getBlockedSlots(barberId, dateString, { throwOnError: true });
    return blockedSlots.includes(timeString);
  } catch (err) {
    console.error("Error in isSlotBlocked:", err);
    throw err;
  }
}

/**
 * Get available time slots for a barber on a specific date.
 * Filters out already-booked slots, blocked slots, and past slots for today.
 * @param {string} barberId
 * @param {Date} date
 * @returns {Promise<{time: string, available: boolean}[]>}
 */
export async function getAvailableSlots(barberId, date) {
  const dateString = formatLocalDate(date);
  const schedule = await getBarberScheduleForDate(barberId, dateString);
  if (!schedule) return [];

  const allSlots = generateTimeSlots(schedule, date);
  
  const [bookedSlots, blockedSlots] = await Promise.all([
    getBookedSlots(barberId, dateString),
    getBlockedSlots(barberId, dateString)
  ]);

  const duration = schedule.slotDuration || schedule.appointmentDuration || (schedule.barberId ? getBarberSlotDuration(schedule.barberId) : shopInfo.appointmentDuration);

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  return allSlots.map((time) => {
    const [h, m] = time.split(":").map(Number);
    const slotStart = h * 60 + m;
    const slotEnd = slotStart + duration;

    // Check if slot overlaps with any booked slot or blocked slot
    const isBooked = bookedSlots.some((bt) => {
      if (bt === time) return true;
      const [bh, bm] = bt.split(":").map(Number);
      const bStart = bh * 60 + bm;
      return bStart >= slotStart && bStart < slotEnd;
    });

    const isBlocked = blockedSlots.some((bt) => {
      if (bt === time) return true;
      const [bh, bm] = bt.split(":").map(Number);
      const bStart = bh * 60 + bm;
      return bStart >= slotStart && bStart < slotEnd;
    });

    let available = !isBooked && !isBlocked;

    // If it's today, disable past time slots
    if (isToday && available) {
      const slotDate = new Date(date);
      slotDate.setHours(h, m, 0, 0);
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
      if (slotDate <= oneHourFromNow) {
        available = false;
      }
    }

    return { time, available };
  });
}

/**
 * Create an appointment document in Firestore.
 * @param {Object} data
 * @returns {Promise<{ appointmentId: string, managementToken: string }>}
 */
export async function createAppointment(data) {
  if (typeof window === "undefined") {
    return createAppointmentRest(data);
  }

  // Pre-write verification: slot must not be blocked
  const blocked = await isSlotBlocked(data.barberId, data.date, data.time);
  if (blocked) {
    throw new Error("This time slot is no longer available. Please select another.");
  }

  const duration = data.duration || getBarberSlotDuration(data.barberId);
  const managementToken = crypto.randomUUID();
  const docRef = await addDoc(collection(db, "appointments"), {
    barberId: data.barberId,
    customerId: data.customerId,
    date: data.date, // "YYYY-MM-DD"
    time: data.time, // "HH:MM"
    duration,
    status: "confirmed",
    reminderSent: false,
    managementToken,
    stripeSetupIntentId: data.stripeSetupIntentId || null,
    createdAt: serverTimestamp(),
  });
  return { appointmentId: docRef.id, managementToken };
}

/**
 * Create or find a customer in Firestore by email.
 * @param {Object} data - { name, email, phone }
 * @returns {Promise<string>} The customer document ID
 */
export async function createOrFindCustomer(data) {
  if (typeof window === "undefined") {
    return createOrFindCustomerRest(data);
  }

  const customersRef = collection(db, "customers");

  // Check if customer already exists by email
  const q = query(customersRef, where("email", "==", data.email));
  const snapshot = await getDocs(q);

  if (!snapshot.empty) {
    const docSnap = snapshot.docs[0];
    const existingData = docSnap.data();
    // Update stripeCustomerId if it is new/different
    if (data.stripeCustomerId && existingData.stripeCustomerId !== data.stripeCustomerId) {
      try {
        const docRef = doc(db, "customers", docSnap.id);
        await updateDoc(docRef, { stripeCustomerId: data.stripeCustomerId });
      } catch (err) {
        console.error("Error updating stripeCustomerId for customer:", err);
      }
    }
    return docSnap.id;
  }

  // Create new customer
  const docRef = await addDoc(customersRef, {
    name: data.name,
    email: data.email,
    phone: data.phone,
    stripeCustomerId: data.stripeCustomerId || null,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}
