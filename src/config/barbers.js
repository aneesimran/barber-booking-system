/**
 * Static barber configuration.
 * In a production app, this would be fetched from Firestore.
 * For now, we use static data to power the selection UI.
 */

export const barbers = [
  {
    id: "imran",
    name: "Imran",
    role: "Senior Barber & Owner",
    bio: "With years of experience and a passion for precision, Imran delivers sharp, clean cuts every time. Specialising in modern fades and classic styles.",
    specialties: ["Skin Fades", "Beard Shaping", "Classic Cuts", "Hair Design"],
    image: "/images/imran.png",
    rating: 4.9,
    reviewCount: 230,
    workingHours: {
      mon: { start: "09:00", end: "18:00" },
      tue: { start: "09:00", end: "18:00" },
      wed: { start: "09:00", end: "18:00" },
      thu: { start: "09:00", end: "18:00" },
      fri: { start: "09:00", end: "18:00" },
      sat: { start: "09:00", end: "18:00" },
      sun: null, // closed
    },
  },
  {
    id: "ali",
    name: "Ali",
    role: "Barber",
    bio: "Ali brings fresh energy and a keen eye for trending styles. Known for his attention to detail and friendly approach.",
    specialties: ["Modern Fades", "Scissor Cuts", "Line-Ups", "Beard Trims"],
    image: "/images/ali.png",
    rating: 4.8,
    reviewCount: 145,
    workingHours: {
      mon: { start: "09:00", end: "18:00" },
      tue: { start: "09:00", end: "18:00" },
      wed: { start: "09:00", end: "18:00" },
      thu: { start: "09:00", end: "18:00" },
      fri: { start: "09:00", end: "18:00" },
      sat: { start: "09:00", end: "18:00" },
      sun: null, // closed
    },
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
