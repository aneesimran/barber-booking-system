import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { barbers, dayKeys, shopInfo } from "@/config/barbers";

/**
 * Generate all possible 20-minute time slots for a barber on a given date.
 * @param {string} barberId
 * @param {Date} date
 * @returns {string[]} Array of time strings like ["09:00", "09:20", ...]
 */
export function generateTimeSlots(barberId, date) {
  const barber = barbers.find((b) => b.id === barberId);
  if (!barber) return [];

  const dayKey = dayKeys[date.getDay()];
  const hours = barber.workingHours[dayKey];
  if (!hours) return []; // barber doesn't work this day

  const slots = [];
  const [startH, startM] = hours.start.split(":").map(Number);
  const [endH, endM] = hours.end.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const duration = shopInfo.appointmentDuration;

  for (let m = startMinutes; m + duration <= endMinutes; m += duration) {
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
  try {
    const appointmentsRef = collection(db, "appointments");
    const q = query(
      appointmentsRef,
      where("barberId", "==", barberId),
      where("date", "==", dateString),
      where("status", "in", ["confirmed", "completed"])
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data().time);
  } catch (error) {
    console.error("Error fetching booked slots:", error);
    return [];
  }
}

/**
 * Get available time slots for a barber on a specific date.
 * Filters out already-booked slots and past slots for today.
 * @param {string} barberId
 * @param {Date} date
 * @returns {Promise<{time: string, available: boolean}[]>}
 */
export async function getAvailableSlots(barberId, date) {
  const allSlots = generateTimeSlots(barberId, date);
  const dateString = date.toISOString().split("T")[0];
  const bookedSlots = await getBookedSlots(barberId, dateString);

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  return allSlots.map((time) => {
    let available = !bookedSlots.includes(time);

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
