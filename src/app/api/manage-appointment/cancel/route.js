import { getAppointmentByIdRest, updateAppointmentRest } from "@/lib/appointments";

/**
 * POST /api/manage-appointment/cancel
 * Cancels an appointment after validating token and 1-hour rule.
 * Body: { appointmentId, token }
 */
export async function POST(request) {
  try {
    const { appointmentId, token } = await request.json();

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

    // Check appointment is still confirmed
    if (appointment.status !== "confirmed") {
      return Response.json(
        { error: `Appointment is already ${appointment.status}` },
        { status: 409 }
      );
    }

    // Enforce 1-hour rule
    const [year, month, day] = appointment.date.split("-").map(Number);
    const [h, m] = appointment.time.split(":").map(Number);
    const appointmentDateTime = new Date(year, month - 1, day, h, m, 0);
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    if (appointmentDateTime <= oneHourFromNow) {
      return Response.json(
        { error: "Appointments can only be cancelled at least 1 hour before the scheduled time" },
        { status: 400 }
      );
    }

    // Cancel the appointment
    await updateAppointmentRest(appointmentId, {
      status: "cancelled",
      cancelledAt: new Date(),
      managementToken: appointment.managementToken, // Keep token for Firestore rules validation
    });

    return Response.json({
      success: true,
      message: "Appointment has been cancelled successfully",
    });
  } catch (error) {
    console.error("Cancel appointment error:", error);
    return Response.json(
      { error: "Failed to cancel appointment. Please try again." },
      { status: 500 }
    );
  }
}
