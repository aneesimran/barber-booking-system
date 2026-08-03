import {
  getAppointmentByIdRest,
  updateAppointmentRest,
  getBookedSlots,
  getBlockedSlots,
  getBarberScheduleForDate,
  generateTimeSlots,
} from "@/lib/appointments";
import { barbers } from "@/config/barbers";

/**
 * POST /api/manage-appointment/reschedule
 * Reschedules an appointment after validating token, 1-hour rule, and slot availability.
 * Body: { appointmentId, token, newDate, newTime }
 */
export async function POST(request) {
  try {
    const { appointmentId, token, newDate, newTime } = await request.json();

    if (!appointmentId || !token || !newDate || !newTime) {
      return Response.json(
        { error: "Appointment ID, token, new date, and new time are required" },
        { status: 400 }
      );
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      return Response.json(
        { error: "Invalid date format. Use YYYY-MM-DD" },
        { status: 400 }
      );
    }

    // Validate time format
    if (!/^\d{2}:\d{2}$/.test(newTime)) {
      return Response.json(
        { error: "Invalid time format. Use HH:MM" },
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

    // Enforce 1-hour rule on current appointment
    const [curYear, curMonth, curDay] = appointment.date.split("-").map(Number);
    const [curH, curM] = appointment.time.split(":").map(Number);
    const currentDateTime = new Date(curYear, curMonth - 1, curDay, curH, curM, 0);
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    if (currentDateTime <= oneHourFromNow) {
      return Response.json(
        { error: "Appointments can only be rescheduled at least 1 hour before the scheduled time" },
        { status: 400 }
      );
    }

    // Validate new date is not in the past
    const [newYear, newMonth, newDay] = newDate.split("-").map(Number);
    const newDateObj = new Date(newYear, newMonth - 1, newDay);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (newDateObj < today) {
      return Response.json(
        { error: "Cannot reschedule to a date in the past" },
        { status: 400 }
      );
    }

    // Validate new time is not in the past (if same day)
    const [newH, newM] = newTime.split(":").map(Number);
    const newDateTime = new Date(newYear, newMonth - 1, newDay, newH, newM, 0);
    const newOneHourCheck = new Date(now.getTime() + 60 * 60 * 1000);
    if (newDateTime <= newOneHourCheck) {
      return Response.json(
        { error: "New time must be at least 1 hour from now" },
        { status: 400 }
      );
    }

    // Validate the new slot exists in the barber's schedule
    const schedule = await getBarberScheduleForDate(appointment.barberId, newDate);
    if (!schedule) {
      return Response.json(
        { error: "Barber schedule not found for the selected date" },
        { status: 400 }
      );
    }

    const allSlots = generateTimeSlots(schedule, newDateObj);
    if (!allSlots.includes(newTime)) {
      return Response.json(
        { error: "The selected time is not a valid slot for this barber" },
        { status: 400 }
      );
    }

    // Check new slot is available (exclude current appointment from booked check)
    const [bookedSlots, blockedSlots] = await Promise.all([
      getBookedSlots(appointment.barberId, newDate),
      getBlockedSlots(appointment.barberId, newDate),
    ]);

    // If rescheduling to same date, the current appointment's slot should not count as booked
    const isSameDate = newDate === appointment.date;
    const effectiveBookedSlots = isSameDate
      ? bookedSlots.filter((t) => t !== appointment.time)
      : bookedSlots;

    if (effectiveBookedSlots.includes(newTime) || blockedSlots.includes(newTime)) {
      return Response.json(
        { error: "The selected time slot is no longer available" },
        { status: 409 }
      );
    }

    // Update the appointment
    await updateAppointmentRest(appointmentId, {
      date: newDate,
      time: newTime,
      previousDate: appointment.date,
      previousTime: appointment.time,
      rescheduledAt: new Date(),
      managementToken: appointment.managementToken, // Keep token for Firestore rules validation
    });

    // Send updated confirmation email
    const barber = barbers.find((b) => b.id === appointment.barberId);
    const barberName = barber ? barber.name : appointment.barberId;

    // Fetch customer details for the email
    const { getCustomerByIdRest } = await import("@/lib/appointments");
    let customerEmail = null;
    let customerName = "Customer";
    if (appointment.customerId) {
      const customer = await getCustomerByIdRest(appointment.customerId);
      if (customer) {
        customerEmail = customer.email;
        customerName = customer.name || "Customer";
      }
    }

    // Send new confirmation email asynchronously
    if (customerEmail) {
      const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
      const proto = request.headers.get("x-forwarded-proto") || "https";
      const requestUrl = host ? `${proto}://${host}` : null;
      const defaultAppUrl = "https://barber-booking-system--barber-booking-d6dd5.europe-west4.hosted.app";
      const appUrl = process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes("aneeshairdressers.co.uk")
        ? process.env.NEXT_PUBLIC_APP_URL
        : requestUrl || defaultAppUrl;

      const senderEmail = process.env.RESEND_SENDER_EMAIL || "booking@resend.dev";
      const resendApiKey = process.env.RESEND_API_KEY;

      if (resendApiKey) {
        // Format new date/time for email
        const fmtDateObj = new Date(newYear, newMonth - 1, newDay);
        const formattedDate = fmtDateObj.toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        });
        const timeFormatted = `${newH > 12 ? newH - 12 : newH}:${String(newM).padStart(2, "0")} ${newH >= 12 ? "PM" : "AM"}`;
        const manageUrl = `${appUrl}/manage/${appointmentId}?token=${appointment.managementToken}`;

        // Format previous date/time
        const prevDateObj = new Date(curYear, curMonth - 1, curDay);
        const prevFormattedDate = prevDateObj.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
        });
        const prevTimeFormatted = `${curH > 12 ? curH - 12 : curH}:${String(curM).padStart(2, "0")} ${curH >= 12 ? "PM" : "AM"}`;

        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `Anees Hairdressers <${senderEmail}>`,
            to: [customerEmail],
            subject: `Appointment Rescheduled - ${timeFormatted} on ${fmtDateObj.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <style>
                  body { background-color: #0a0a0a; color: #ededed; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; }
                  .container { max-width: 600px; margin: 30px auto; background-color: #111111; border: 1px solid rgba(201, 168, 76, 0.2); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
                  .header { background-color: #1a1a1a; padding: 25px; text-align: center; border-bottom: 1px solid #222222; }
                  .header h1 { color: #c9a84c; margin: 0 0 5px 0; font-size: 24px; font-family: Georgia, serif; }
                  .header p { color: #8a8a8a; margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em; }
                  .content { padding: 35px 25px; line-height: 1.6; }
                  .details-card { background-color: #0a0a0a; border: 1px solid #222222; border-radius: 12px; padding: 20px; margin-bottom: 25px; }
                  .footer { background-color: #1a1a1a; padding: 25px; text-align: center; font-size: 11px; color: #8a8a8a; border-top: 1px solid #222222; }
                  .footer p { margin: 5px 0; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1>Appointment Rescheduled</h1>
                    <p>Anees Hairdressers</p>
                  </div>
                  <div class="content">
                    <div style="font-size: 16px; font-weight: 600; margin-bottom: 15px; color: #ffffff;">Hi ${customerName},</div>
                    <div style="color: #b5b5b5; font-size: 14px; margin-bottom: 25px;">Your appointment has been successfully rescheduled. Here are your updated booking details:</div>
                    
                    <div style="font-size: 12px; color: #8a8a8a; margin-bottom: 15px; padding: 8px 12px; background: rgba(255,255,255,0.03); border-radius: 6px;">
                      <span style="text-decoration: line-through;">Previously: ${prevFormattedDate} at ${prevTimeFormatted}</span>
                    </div>

                    <div class="details-card">
                      <table style="width: 100%; border-collapse: collapse; border-spacing: 0;">
                        <tr style="border-bottom: 1px solid #222222;">
                          <td style="padding: 12px 0; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #8a8a8a;">Barber</td>
                          <td style="padding: 12px 0; text-align: right; font-size: 14px; font-weight: 600; color: #ffffff;">${barberName}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #222222;">
                          <td style="padding: 12px 0; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #8a8a8a;">New Date</td>
                          <td style="padding: 12px 0; text-align: right; font-size: 14px; font-weight: 600; color: #c9a84c;">${formattedDate}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #222222;">
                          <td style="padding: 12px 0; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #8a8a8a;">New Time</td>
                          <td style="padding: 12px 0; text-align: right; font-size: 14px; font-weight: 600; color: #c9a84c;">${timeFormatted}</td>
                        </tr>
                        <tr>
                          <td style="padding: 12px 0 0 0; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #8a8a8a;">Duration</td>
                          <td style="padding: 12px 0 0 0; text-align: right; font-size: 14px; font-weight: 600; color: #ffffff;">20 Minutes</td>
                        </tr>
                      </table>
                    </div>

                    <div style="text-align: center; margin-top: 25px; margin-bottom: 5px;">
                      <p style="font-size: 13px; color: #b5b5b5; margin-bottom: 15px;">Need to make further changes?</p>
                      <a href="${manageUrl}" style="display: inline-block; background: linear-gradient(135deg, #c9a84c, #a68a3a); color: #0a0a0a; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px; text-decoration: none;">Manage Appointment</a>
                    </div>

                    <div style="font-size: 12px; color: #8a8a8a; background-color: rgba(201, 168, 76, 0.05); border-left: 3px solid #c9a84c; padding: 12px 15px; border-radius: 4px; margin-top: 25px;">
                      <strong>Cancellation Policy:</strong> You can reschedule or cancel up to 1 hour before your scheduled time. In the event of a no-show, a £5.00 fee may be charged.
                    </div>
                  </div>
                  <div class="footer">
                    <p>&copy; 2026 Anees Hairdressers. All rights reserved.</p>
                    <p>Precision Cuts. Premium Experience.</p>
                  </div>
                </div>
              </body>
              </html>
            `,
          }),
        }).catch((err) => console.error("Reschedule email failed:", err));
      }
    }

    return Response.json({
      success: true,
      message: "Appointment has been rescheduled successfully",
      newDate,
      newTime,
    });
  } catch (error) {
    console.error("Reschedule appointment error:", error);
    return Response.json(
      { error: "Failed to reschedule appointment. Please try again." },
      { status: 500 }
    );
  }
}
