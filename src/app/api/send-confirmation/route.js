import { barbers } from "@/config/barbers";

/**
 * POST /api/send-confirmation
 * Sends a premium HTML booking confirmation email to the customer via Resend.
 * Body: { email, name, barberId, date, time }
 */
export async function POST(request) {
  try {
    const { email, name, barberId, date, time, appointmentId, managementToken } = await request.json();

    if (!email || !name || !barberId || !date || !time) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.warn("Resend API Key is missing. Skipping email sending.");
      return Response.json({ success: true, message: "Email skipped (API Key missing)" });
    }

    // Resolve barber display name
    const barber = barbers.find((b) => b.id === barberId);
    const barberName = barber ? barber.name : barberId;

    // Format Date (e.g. Friday, 29 May 2026)
    const [y, m, d] = date.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const formattedDate = dateObj.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });

    // Format Time (e.g. 10:00 AM)
    const [h, min] = time.split(":").map(Number);
    const timeFormatted = `${h > 12 ? h - 12 : h}:${String(min).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;

    // Sender email (use verified domain email or fallback)
    const senderEmail = process.env.RESEND_SENDER_EMAIL || "booking@resend.dev";

    // Build manage appointment URL
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") || "https";
    const requestUrl = host ? `${proto}://${host}` : null;

    const defaultAppUrl = "https://barber-booking-system--barber-booking-d6dd5.europe-west4.hosted.app";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes("aneeshairdressers.co.uk")
      ? process.env.NEXT_PUBLIC_APP_URL
      : requestUrl || defaultAppUrl;

    const manageUrl = appointmentId && managementToken
      ? `${appUrl}/manage/${appointmentId}?token=${managementToken}`
      : null;

    // Manage appointment button HTML (only shown if manage URL is available)
    const manageButtonHtml = manageUrl ? `
                <div style="text-align: center; margin-top: 25px; margin-bottom: 5px;">
                  <p style="font-size: 13px; color: #b5b5b5; margin-bottom: 15px;">Need to make changes to your appointment?</p>
                  <a href="${manageUrl}" style="display: inline-block; background: linear-gradient(135deg, #c9a84c, #a68a3a); color: #0a0a0a; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px; text-decoration: none; letter-spacing: 0.02em;">Manage Appointment</a>
                  <p style="font-size: 11px; color: #6a6a6a; margin-top: 12px;">Reschedule or cancel up to 1 hour before your appointment</p>
                </div>
    ` : "";

    // Send email using Resend REST API
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: `Anees Hairdressers <${senderEmail}>`,
        to: [email],
        subject: `Appointment Confirmed - ${timeFormatted} on ${dateObj.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body {
                background-color: #0a0a0a;
                color: #ededed;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                margin: 0;
                padding: 0;
              }
              .container {
                max-width: 600px;
                margin: 30px auto;
                background-color: #111111;
                border: 1px solid rgba(201, 168, 76, 0.2);
                border-radius: 16px;
                overflow: hidden;
                box-shadow: 0 20px 40px rgba(0,0,0,0.5);
              }
              .header {
                background-color: #1a1a1a;
                padding: 25px;
                text-align: center;
                border-bottom: 1px solid #222222;
              }
              .header h1 {
                color: #c9a84c;
                margin: 0 0 5px 0;
                font-size: 24px;
                font-family: Georgia, serif;
              }
              .header p {
                color: #8a8a8a;
                margin: 0;
                font-size: 13px;
                text-transform: uppercase;
                letter-spacing: 0.1em;
              }
              .content {
                padding: 35px 25px;
                line-height: 1.6;
              }
              .greeting {
                font-size: 16px;
                font-weight: 600;
                margin-bottom: 15px;
                color: #ffffff;
              }
              .intro {
                color: #b5b5b5;
                font-size: 14px;
                margin-bottom: 25px;
              }
              .details-card {
                background-color: #0a0a0a;
                border: 1px solid #222222;
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 25px;
              }
              .policy-note {
                font-size: 12px;
                color: #8a8a8a;
                background-color: rgba(201, 168, 76, 0.05);
                border-left: 3px solid #c9a84c;
                padding: 12px 15px;
                border-radius: 4px;
                margin-top: 25px;
              }
              .footer {
                background-color: #1a1a1a;
                padding: 25px;
                text-align: center;
                font-size: 11px;
                color: #8a8a8a;
                border-top: 1px solid #222222;
              }
              .footer p {
                margin: 5px 0;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Booking Confirmed</h1>
                <p>Anees Hairdressers</p>
              </div>
              <div class="content">
                <div class="greeting">Hi ${name},</div>
                <div class="intro">Your appointment has been successfully scheduled! We look forward to seeing you. Below are your booking details:</div>
                
                <div class="details-card">
                  <table style="width: 100%; border-collapse: collapse; border-spacing: 0;">
                    <tr style="border-bottom: 1px solid #222222;">
                      <td style="padding: 12px 0; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #8a8a8a;">Barber</td>
                      <td style="padding: 12px 0; text-align: right; font-size: 14px; font-weight: 600; color: #ffffff;">${barberName}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #222222;">
                      <td style="padding: 12px 0; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #8a8a8a;">Date</td>
                      <td style="padding: 12px 0; text-align: right; font-size: 14px; font-weight: 600; color: #ffffff;">${formattedDate}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #222222;">
                      <td style="padding: 12px 0; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #8a8a8a;">Time</td>
                      <td style="padding: 12px 0; text-align: right; font-size: 14px; font-weight: 600; color: #ffffff;">${timeFormatted}</td>
                    </tr>
                    <tr>
                      <td style="padding: 12px 0 0 0; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #8a8a8a;">Duration</td>
                      <td style="padding: 12px 0 0 0; text-align: right; font-size: 14px; font-weight: 600; color: #ffffff;">20 Minutes</td>
                    </tr>
                  </table>
                </div>
                
                ${manageButtonHtml}

                <div class="policy-note">
                  <strong>Cancellation Policy:</strong> You can reschedule or cancel your appointment up to 1 hour before your scheduled time using the link above. In the event of a no-show, a £5.00 fee may be charged to your card.
                </div>
              </div>
              <div class="footer">
                <p>&copy; 2026 Anees Hairdressers. All rights reserved.</p>
                <p>Precision Cuts. Premium Experience.</p>
              </div>
            </div>
          </body>
          </html>
        `
      }),
      cache: "no-store"
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || "Failed to send email via Resend");
    }

    return Response.json({ success: true, message: "Confirmation email sent!", id: data.id });
  } catch (error) {
    console.error("Email API Route error:", error);
    return Response.json(
      { error: error.message || "Failed to process confirmation email" },
      { status: 500 }
    );
  }
}
