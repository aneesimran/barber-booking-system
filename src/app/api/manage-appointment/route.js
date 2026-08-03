import { getAppointmentByIdRest, getCustomerByIdRest } from "@/lib/appointments";
import { barbers } from "@/config/barbers";

/**
 * GET /api/manage-appointment?id={appointmentId}&token={managementToken}
 * Fetches appointment details and validates the management token.
 */
export async function GET(request) {
  try {
    const { searchParams } = request.nextUrl;
    const appointmentId = searchParams.get("id");
    const token = searchParams.get("token");

    if (!appointmentId || !token) {
      return Response.json(
        { error: "Appointment ID and token are required" },
        { status: 400 }
      );
    }

    // Fetch the appointment
    const appointment = await getAppointmentByIdRest(appointmentId);
    if (!appointment) {
      return Response.json(
        { error: "Appointment not found" },
        { status: 404 }
      );
    }

    // Validate management token
    if (appointment.managementToken !== token) {
      return Response.json(
        { error: "Invalid management token" },
        { status: 403 }
      );
    }

    // Resolve barber name
    const barber = barbers.find((b) => b.id === appointment.barberId);
    const barberName = barber ? barber.name : appointment.barberId;

    // Fetch customer name
    let customerName = "Customer";
    if (appointment.customerId) {
      const customer = await getCustomerByIdRest(appointment.customerId);
      if (customer && customer.name) {
        customerName = customer.name;
      }
    }

    // Check if appointment can be modified (1 hour rule)
    const [year, month, day] = appointment.date.split("-").map(Number);
    const [h, m] = appointment.time.split(":").map(Number);
    const appointmentDateTime = new Date(year, month - 1, day, h, m, 0);
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const canModify = appointment.status === "confirmed" && appointmentDateTime > oneHourFromNow;

    // Don't expose the management token in the response
    return Response.json({
      appointment: {
        id: appointment.id,
        barberId: appointment.barberId,
        barberName,
        customerName,
        date: appointment.date,
        time: appointment.time,
        duration: appointment.duration,
        status: appointment.status,
        previousDate: appointment.previousDate,
        previousTime: appointment.previousTime,
        rescheduledAt: appointment.rescheduledAt,
        cancelledAt: appointment.cancelledAt,
      },
      canModify,
      reason: !canModify
        ? appointment.status !== "confirmed"
          ? `Appointment is ${appointment.status}`
          : "Appointment is less than 1 hour away"
        : null,
    });
  } catch (error) {
    console.error("Manage appointment GET error:", error);
    return Response.json(
      { error: "Failed to fetch appointment details" },
      { status: 500 }
    );
  }
}
