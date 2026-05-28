/**
 * Static barber configuration.
 * In a production app, this would be fetched from Firestore.
 * For now, we use static data to power the selection UI.
 */

export const barbers = [
  {
    id: "imran",
    name: "Imran (Anees)",
    role: "Owner & Barber",
    bio: "With years of experience and a passion for precision, Imran delivers sharp, clean cuts every time. Specialising in modern fades and classic styles.",
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
  },
  {
    id: "ali",
    name: "Ali",
    role: "Barber",
    bio: "Ali brings fresh energy and a keen eye for trending styles. Known for his attention to detail and friendly approach.",
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
  },
];

/** Day name keys matching the workingHours object keys */
export const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const shopInfo = {
  name: "Anees Hairdressers",
  tagline: "Precision Cuts. Premium Experience.",
  appointmentDuration: 20, // minutes
  bookingWindowDays: 14, // how far ahead customers can book
};
