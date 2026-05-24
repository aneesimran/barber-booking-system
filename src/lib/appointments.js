import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { barbers, dayKeys, shopInfo } from "@/config/barbers";

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
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`REST schedule fetch failed: ${res.statusText}`);
    }
    const data = await res.json();
    const fields = data.fields || {};
    const schedule = {};
    
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
      body: JSON.stringify(query)
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
    return [];
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
      body: JSON.stringify(query)
    });
    
    if (!res.ok) throw new Error(`REST blocked slots query error: ${res.statusText}`);
    const data = await res.json();
    
    const blockedSlots = [];
    for (const item of data) {
      if (item.document) {
        const fields = item.document.fields || {};
        const time = fields.time?.stringValue;
        if (time) blockedSlots.push(time);
      }
    }
    return blockedSlots;
  } catch (err) {
    console.error("Error in getBlockedSlotsRest:", err);
    return [];
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
    body: JSON.stringify(queryBody)
  });
  
  if (queryRes.ok) {
    const results = await queryRes.json();
    for (const item of results) {
      if (item.document) {
        return item.document.name.split("/").pop();
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
    body: JSON.stringify(customerDoc)
  });
  
  if (!createRes.ok) {
    throw new Error(`REST customer creation failed: ${createRes.statusText}`);
  }
  
  const createdData = await createRes.json();
  return createdData.name.split("/").pop();
}

async function createAppointmentRest(data) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const createUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/appointments`;
  
  const appointmentDoc = {
    fields: {
      barberId: { stringValue: data.barberId },
      customerId: { stringValue: data.customerId },
      date: { stringValue: data.date },
      time: { stringValue: data.time },
      duration: { integerValue: 20 },
      status: { stringValue: "confirmed" },
      reminderSent: { booleanValue: false },
      stripeSetupIntentId: data.stripeSetupIntentId ? { stringValue: data.stripeSetupIntentId } : { nullValue: null },
      createdAt: { timestampValue: new Date().toISOString() }
    }
  };
  
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(appointmentDoc)
  });
  
  if (!createRes.ok) {
    throw new Error(`REST appointment creation failed: ${createRes.statusText}`);
  }
  
  const createdData = await createRes.json();
  return createdData.name.split("/").pop();
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
  const duration = shopInfo.appointmentDuration;

  let lunchStartMins = -1;
  let lunchEndMins = -1;
  if (schedule.lunchBreak) {
    const [lStartH, lStartM] = schedule.lunchBreak.start.split(":").map(Number);
    const [lEndH, lEndM] = schedule.lunchBreak.end.split(":").map(Number);
    lunchStartMins = lStartH * 60 + lStartM;
    lunchEndMins = lEndH * 60 + lEndM;
  }

  for (let m = startMinutes; m + duration <= endMinutes; m += duration) {
    // Skip slots that overlap with lunch break
    if (lunchStartMins > -1 && lunchEndMins > -1) {
      if (m >= lunchStartMins && m < lunchEndMins) continue;
      // Also skip if the slot ends during lunch break
      if (m + duration > lunchStartMins && m + duration <= lunchEndMins) continue;
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
 * @returns {Promise<string[]>} Array of booked time strings like ["09:00", "10:40"]
 */
export async function getBookedSlots(barberId, dateString) {
  if (typeof window === "undefined") {
    return getBookedSlotsRest(barberId, dateString);
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
        return snap.data();
      }
    } catch (err) {
      console.error("Error fetching schedule, using fallback", err);
    }
  }

  // Fallback to static config
  const barber = barbers.find((b) => b.id === barberId);
  if (!barber) return null;
  return {
    workingHours: barber.workingHours,
    lunchBreak: barber.lunchBreak
  };
}

/**
 * Fetch blocked slots for a barber on a specific date.
 * @param {string} barberId 
 * @param {string} dateString 
 * @returns {Promise<string[]>} Array of blocked time strings
 */
export async function getBlockedSlots(barberId, dateString) {
  if (typeof window === "undefined") {
    return getBlockedSlotsRest(barberId, dateString);
  }

  try {
    const blockedRef = collection(db, "blockedSlots");
    const q = query(
      blockedRef,
      where("barberId", "==", barberId),
      where("date", "==", dateString)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data().time);
  } catch (err) {
    console.error("Error fetching blocked slots:", err);
    return [];
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
  const schedule = await getBarberSchedule(barberId);
  if (!schedule) return [];

  const allSlots = generateTimeSlots(schedule, date);
  const dateString = formatLocalDate(date);
  
  const [bookedSlots, blockedSlots] = await Promise.all([
    getBookedSlots(barberId, dateString),
    getBlockedSlots(barberId, dateString)
  ]);

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  return allSlots.map((time) => {
    let available = !bookedSlots.includes(time) && !blockedSlots.includes(time);

    // If it's today, disable past time slots
    if (isToday && available) {
      const [h, m] = time.split(":").map(Number);
      const slotDate = new Date(date);
      slotDate.setHours(h, m, 0, 0);
      if (slotDate <= now) {
        available = false;
      }
    }

    return { time, available };
  });
}

/**
 * Create an appointment document in Firestore.
 * @param {Object} data
 * @returns {Promise<string>} The new document ID
 */
export async function createAppointment(data) {
  if (typeof window === "undefined") {
    return createAppointmentRest(data);
  }

  const docRef = await addDoc(collection(db, "appointments"), {
    barberId: data.barberId,
    customerId: data.customerId,
    date: data.date, // "YYYY-MM-DD"
    time: data.time, // "HH:MM"
    duration: shopInfo.appointmentDuration,
    status: "confirmed",
    reminderSent: false,
    stripeSetupIntentId: data.stripeSetupIntentId || null,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
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
    // Update existing customer name/phone if needed
    return snapshot.docs[0].id;
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
