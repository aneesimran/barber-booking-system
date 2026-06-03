const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;
const resendApiKey = process.env.RESEND_API_KEY;
const senderEmail = process.env.RESEND_SENDER_EMAIL || "booking@resend.dev";

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

async function sendEmail(to, name, messageBody) {
  if (!resendApiKey) {
    throw new Error("Resend API key is not configured.");
  }
  // Convert newlines in the message to HTML paragraph tags
  const formattedBody = messageBody
    .split("\n")
    .map(para => `<p style="margin: 0 0 15px 0;">${para}</p>`)
    .join("");

  const htmlContent = `
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
          background-color: #161616;
          padding: 30px 25px;
          text-align: center;
          border-bottom: 1px solid #222222;
        }
        .header h1 {
          color: #c9a84c;
          margin: 0 0 5px 0;
          font-size: 26px;
          font-family: Georgia, serif;
          letter-spacing: 0.05em;
        }
        .header p {
          color: #8a8a8a;
          margin: 0;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.15em;
        }
        .content {
          padding: 40px 30px;
          line-height: 1.6;
          font-size: 15px;
          color: #d1d1d1;
        }
        .greeting {
          font-size: 17px;
          font-weight: 600;
          margin-bottom: 20px;
          color: #ffffff;
        }
        .message-body {
          margin-bottom: 30px;
          color: #ededed;
        }
        .footer {
          background-color: #161616;
          padding: 25px;
          text-align: center;
          font-size: 11px;
          color: #8a8a8a;
          border-top: 1px solid #222222;
        }
        .footer p {
          margin: 5px 0;
        }
        .footer a {
          color: #c9a84c;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Important Update</h1>
          <p>Anees Hairdressers</p>
        </div>
        <div class="content">
          <div class="greeting">Hello ${name},</div>
          <div class="message-body">
            ${formattedBody}
          </div>
        </div>
        <div class="footer">
          <p>You received this message because you are a registered customer at Anees Hairdressers.</p>
          <p>&copy; 2026 Anees Hairdressers. All rights reserved.</p>
          <p>Need assistance? Call us on <a href="tel:07930383297">07930383297</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: `Anees Hairdressers <${senderEmail}>`,
      to: [to],
      subject: "Important Update from Anees Hairdressers",
      html: htmlContent
    }),
    cache: "no-store"
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Resend email sending failed");
  }
  return data.id;
}

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
    const { message, channels = [], recipients = [] } = await request.json();

    if (!message || channels.length === 0 || recipients.length === 0) {
      return Response.json(
        { error: "Missing required details: message, channels, or recipients" },
        { status: 400 }
      );
    }

    const sendSmsChannel = channels.includes("sms");
    const sendEmailChannel = channels.includes("email");

    const results = [];

    // 3. Process Batch
    for (const r of recipients) {
      const resItem = { name: r.name, email: r.email, phone: r.phone };
      
      // Send SMS
      if (sendSmsChannel && r.phone) {
        try {
          const smsSid = await sendSms(r.phone, message);
          resItem.smsSuccess = true;
          resItem.smsSid = smsSid;
        } catch (err) {
          console.error(`Failed to send SMS to ${r.name} (${r.phone}):`, err);
          resItem.smsSuccess = false;
          resItem.smsError = err.message || "Unknown error";
        }
      }

      // Send Email
      if (sendEmailChannel && r.email) {
        try {
          const emailId = await sendEmail(r.email, r.name, message);
          resItem.emailSuccess = true;
          resItem.emailId = emailId;
        } catch (err) {
          console.error(`Failed to send Email to ${r.name} (${r.email}):`, err);
          resItem.emailSuccess = false;
          resItem.emailError = err.message || "Unknown error";
        }
      }

      results.push(resItem);
    }

    return Response.json({
      success: true,
      results
    });

  } catch (error) {
    console.error("Blast sending error:", error);
    return Response.json(
      { error: error.message || "Failed to process blast messages batch" },
      { status: 500 }
    );
  }
}
