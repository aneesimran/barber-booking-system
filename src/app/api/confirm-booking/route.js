import {
  createAppointment,
  createOrFindCustomer,
  getBookedSlots,
} from "@/lib/appointments";

/**
 * POST /api/confirm-booking
 * Validates availability, creates customer & appointment in Firestore.
 * Body: { barberId, date, time, name, email, phone, stripeSetupIntentId, stripeCustomerId }
 * Returns: { success, appointmentId }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      barberId,
      date,
      time,
      name,
      email,
      phone,
      stripeSetupIntentId,
      stripeCustomerId,
    } = body;

    // Validate required fields
    if (!barberId || !date || !time || !name || !email || !phone) {
      return Response.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    // Validate UK mobile number format
    const phoneRegex = /^(\+44|0)7\d{9}$/;
    if (!phoneRegex.test(phone.replace(/\s/g, ""))) {
      return Response.json(
        { error: "Invalid UK mobile number" },
        { status: 400 }
      );
    }

    // Check the slot is still available (prevent double-booking)
    console.log("Checking booked slots...");
    const bookedSlots = await getBookedSlots(barberId, date);
    console.log("Booked slots:", bookedSlots);
    if (bookedSlots.includes(time)) {
      return Response.json(
        { error: "This time slot has just been booked. Please select another." },
        { status: 409 }
      );
    }

    // Create or find the customer in Firestore
    console.log("Creating/finding customer...");
    const customerId = await createOrFindCustomer({
      name,
      email,
      phone,
      stripeCustomerId: stripeCustomerId || null,
    });
    console.log("Customer ID:", customerId);

    // Create the appointment
    console.log("Creating appointment...");
    const appointmentId = await createAppointment({
      barberId,
      customerId,
      date,
      time,
      stripeSetupIntentId: stripeSetupIntentId || null,
    });
    console.log("Appointment ID:", appointmentId);

    return Response.json({
      success: true,
      appointmentId,
      message: "Booking confirmed!",
    });
  } catch (error) {
    console.error("Booking confirmation error:", error);
    return Response.json(
      { error: "Failed to confirm booking. Please try again." },
      { status: 500 }
    );
  }
}
