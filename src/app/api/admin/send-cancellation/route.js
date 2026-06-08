import { barbers } from "@/config/barbers";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

async function sendSms(to, body) {
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Twilio credentials are not configured.");
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const authHeader = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const params = new URLSearchParams({
    To: to,
    From: fromNumber,
    Body: body
  });
  
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });
  
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Twilio SMS sending failed");
  }
  return data.sid;
}

/**
 * POST /api/admin/send-cancellation
 * Sends an SMS and Email notification to the customer when their booking is cancelled.
 */
export async function POST(request) {
  try {
    // 1. Verify Authorization Token
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return Response.json(
        { error: "Unauthorized: Missing token" },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    
    const authRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      }
    );

    if (!authRes.ok) {
      return Response.json(
        { error: "Unauthorized: Invalid token" },
        { status: 401 }
      );
    }

    const authData = await authRes.json();
    const email = authData.users?.[0]?.email;
    const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
      .split(",")
      .map(e => e.trim().toLowerCase());

    if (!email || !adminEmails.includes(email.toLowerCase())) {
      return Response.json(
        { error: "Forbidden: Unauthorized access" },
        { status: 403 }
      );
    }

    // 2. Parse Body Details
    const { customerName, customerPhone, customerEmail, barberId, date, time } = await request.json();

    if (!customerName || !barberId || !date || !time) {
      return Response.json(
        { error: "Missing required details" },
        { status: 400 }
      );
    }

    const barber = barbers.find((b) => b.id === barberId);
    const barberName = barber ? barber.name : barberId;
    const contactPhone = barberId === "ali" ? "07538270142" : "07930383297";

    // Format Date (e.g. Monday, 1 June 2026)
    const [y, m, d] = date.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const formattedDate = dateObj.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });

    // Format Time (e.g. 10:20 PM)
    const [h, min] = time.split(":").map(Number);
    const timeFormatted = `${h > 12 ? h - 12 : h}:${String(min).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;

    const smsText = `Hi ${customerName},\n\nYour appointment with ${barberName} on ${formattedDate} at ${timeFormatted} at Anees Hairdressers has been cancelled.\n\nIf you need to reach us, please call ${contactPhone}.\n\nThank you!`;

    let smsSent = false;
    let emailSent = false;

    // Send SMS
    if (customerPhone) {
      try {
        await sendSms(customerPhone, smsText);
        smsSent = true;
      } catch (err) {
        console.error("Cancellation SMS failed:", err);
      }
    }

    // Send Email via Resend (if email exists and API key is set)
    const resendApiKey = process.env.RESEND_API_KEY;
    const senderEmail = process.env.RESEND_SENDER_EMAIL || "booking@resend.dev";
    if (customerEmail && resendApiKey) {
      try {
        const mailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: `Anees Hairdressers <${senderEmail}>`,
            to: [customerEmail],
            subject: `Appointment Cancelled - ${timeFormatted} on ${dateObj.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
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
                    border: 1px solid rgba(220, 38, 38, 0.2);
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
                    color: #ef4444;
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
                    background-color: rgba(239, 68, 68, 0.05);
                    border-left: 3px solid #ef4444;
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
                    <h1>Booking Cancelled</h1>
                    <p>Anees Hairdressers</p>
                  </div>
                  <div class="content">
                    <div class="greeting">Hi ${customerName},</div>
                    <div class="intro">Your appointment has been cancelled. Below are the details of the cancelled booking:</div>
                    
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
                      </table>
                    </div>
                    
                    <div class="policy-note">
                      If you did not request this cancellation or have any questions, please call us directly on <strong>${contactPhone}</strong>.
                    </div>
                  </div>
                  <div class="footer">
                    <p>&copy; 2026 Anees Hairdressers. All rights reserved.</p>
                  </div>
                </div>
              </body>
              </html>
            `
          }),
          cache: "no-store"
        });
        if (mailRes.ok) {
          emailSent = true;
        }
      } catch (err) {
        console.error("Cancellation email failed:", err);
      }
    }

    return Response.json({
      success: true,
      smsSent,
      emailSent
    });

  } catch (error) {
    console.error("Cancellation notification error:", error);
    return Response.json(
      { error: error.message || "Failed to process cancellation notification" },
      { status: 500 }
    );
  }
}
