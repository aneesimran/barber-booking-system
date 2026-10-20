/**
 * Static barber configuration.
 * In a production app, this would be fetched from Firestore.
 * For now, we use static data to power the selection UI.
 */

export const barbers = [
  {
    id: "imran",
    name: "Imran (Anees)",
    phone: "07930383297",
    role: "Owner & Barber",
    bio: "Over 35 years of experience with a diploma in Barbering. Specialist in skin fades, precision scissor work, and modern styling.",
    specialties: ["Skin Fades", "Beard Shaping", "Classic Cuts", "Hair Design"],
    image: "/images/imran.jpg",
    rating: 4.9,
    reviewCount: 230,
    workingHours: {
      mon: { start: "10:00", end: "19:00" },
      tue: null, // closed
      wed: { start: "10:00", end: "19:00" },
      thu: { start: "10:00", end: "19:00" },
      fri: { start: "10:00", end: "19:00" },
      sat: { start: "10:00", end: "19:00" },
      sun: null, // closed
    },
    lunchBreak: { start: "13:40", end: "14:00" },
    slotDuration: 20,
  },
  {
    id: "ali",
    name: "Ali",
    phone: "07538270142",
    role: "Barber",
    bio: "With over 20 years of barbering experience, Ali specialises in clean fades, scissor cuts, and beard trims.",
    specialties: ["Modern Fades", "Scissor Cuts", "Line-Ups", "Beard Trims"],
    image: "/images/ali.jpg",
    rating: 4.8,
    reviewCount: 145,
    workingHours: {
      mon: { start: "10:00", end: "19:00" },
      tue: { start: "10:00", end: "19:00" },
      wed: null, // closed
      thu: { start: "10:00", end: "19:00" },
      fri: { start: "10:00", end: "19:00" },
      sat: { start: "10:00", end: "19:00" },
      sun: null, // closed
    },
    lunchBreak: { start: "14:00", end: "14:20" },
    slotDuration: 20,
  },
  {
    id: "mudni",
    name: "Mudni",
    phone: "07818442523",
    role: "Trainee Barber",
    isTrainee: true,
    slotDuration: 60, // 1 hour slots for trainee
    discountNote: "50% Off — All haircuts with Mudni are half price solely because he is currently learning barbering. Appointments are 1 hour long for dedicated care.",
    bio: "Mudni is currently learning the barbering trade under expert guidance. As a trainee barber, his appointments are 1 hour long to ensure extra care and detail. The 50% discount on all haircuts with Mudni is provided solely because he is learning barbering.",
    specialties: ["Classic Cuts", "Modern Fades", "Beard Trims", "Learner Cuts"],
    image: "/images/mudni-profile.jpg",
    rating: 5.0,
    reviewCount: 18,
    workingHours: {
      mon: { start: "10:00", end: "19:00" },
      tue: null, // closed
      wed: { start: "10:00", end: "19:00" },
      thu: { start: "10:00", end: "19:00" },
      fri: { start: "10:00", end: "19:00" },
      sat: { start: "10:00", end: "19:00" },
      sun: { start: "10:00", end: "16:00" },
    },
    lunchBreak: null,
  },
];

/** Day name keys matching the workingHours object keys */
export const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const shopInfo = {
  name: "Anees Hairdressers",
  tagline: "Precision Cuts. Premium Experience.",
  appointmentDuration: 20, // default minutes
  bookingWindowDays: 14, // how far ahead customers can book
};

/**
 * Get slot duration in minutes for a specific barber.
 * Defaults to shopInfo.appointmentDuration (20 mins).
 * @param {string} barberId
 * @returns {number}
 */
export function getBarberSlotDuration(barberId) {
  const barber = barbers.find((b) => b.id === barberId);
  return barber?.slotDuration || shopInfo.appointmentDuration;
}
