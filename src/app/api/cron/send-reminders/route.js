import { barbers } from "@/config/barbers";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

async function sendSms(to, body) {
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Twilio credentials are not configured in environment variables.");
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
 * GET /api/cron/send-reminders?secret=YOUR_CRON_SECRET
 * Scans today's appointments, filters for confirmed appointments starting within the next 2.5 hours
 * that have not yet had a reminder sent, sends them an SMS via Twilio, and updates the reminderSent flag.
 */
export async function GET(request) {
  const { searchParams } = request.nextUrl;
  const secret = searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET || "temp_secret";

  if (secret !== cronSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    
    // Format today as local YYYY-MM-DD
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const todayStr = `${year}-${month}-${day}`;

    // Query appointments for today via Firestore REST API
    const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
    const queryBody = {
      structuredQuery: {
        from: [{ collectionId: "appointments" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "date" },
            op: "EQUAL",
            value: { stringValue: todayStr }
          }
        }
      }
    };

    const resAppts = await fetch(queryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(queryBody),
      cache: "no-store"
    });

    if (!resAppts.ok) {
      throw new Error(`Failed to query appointments via REST: ${resAppts.statusText}`);
    }

    const apptsResults = await resAppts.json();
    const now = new Date();
    let sentCount = 0;
    const errors = [];

    for (const item of apptsResults) {
      if (!item.document) continue;

      const docName = item.document.name;
      const apptId = docName.split("/").pop();
      const fields = item.document.fields || {};

      const status = fields.status?.stringValue;
      const reminderSent = fields.reminderSent?.booleanValue;
      const time = fields.time?.stringValue;
      const customerId = fields.customerId?.stringValue;
      const barberId = fields.barberId?.stringValue;

      // Filter in-memory to bypass index requirements
      if (status !== "confirmed" || reminderSent === true || !time || !customerId) {
        continue;
      }

      // Check if the appointment time is within the next 2.5 hours (150 minutes)
      const [h, m] = time.split(":").map(Number);
      const apptDateTime = new Date(year, today.getMonth(), today.getDate(), h, m, 0, 0);
      const diffMs = apptDateTime.getTime() - now.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      // Trigger if starting between now and next 150 mins
      if (diffMins > 0 && diffMins <= 150) {
        // Fetch customer details via Firestore REST API
        const customerUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/customers/${customerId}`;
        const resCust = await fetch(customerUrl, { cache: "no-store" });
        
        if (!resCust.ok) {
          console.error(`Failed to fetch customer ${customerId} via REST`);
          continue;
        }

        const custData = await resCust.json();
        const custFields = custData.fields || {};
        const customerName = custFields.name?.stringValue;
        const customerPhone = custFields.phone?.stringValue;

        if (customerPhone) {
          const barber = barbers.find(b => b.id === barberId);
          const barberName = barber ? barber.name : barberId;

          // Format readable time (e.g. 10:00 AM)
          const timeFormatted = `${h > 12 ? h - 12 : h}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
          const message = `Hi ${customerName || "there"}, this is a reminder for your appointment with ${barberName} today at ${timeFormatted} at Anees Hairdressers. Need to reschedule or cancel? Please call us directly on 07930383297. See you soon!`;

          try {
            // Send SMS
            await sendSms(customerPhone, message);

            // Update reminderSent status in Firestore via REST PATCH
            const updateUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/appointments/${apptId}?updateMask.fieldPaths=reminderSent&updateMask.fieldPaths=updatedAt`;
            const updateBody = {
              fields: {
                reminderSent: { booleanValue: true },
                updatedAt: { timestampValue: new Date().toISOString() }
              }
            };

            await fetch(updateUrl, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updateBody),
              cache: "no-store"
            });

            sentCount++;
          } catch (err) {
            console.error(`Failed to process reminder for appointment ${apptId}:`, err);
            errors.push({ id: apptId, error: err.message });
          }
        }
      }
    }

    return Response.json({
      success: true,
      sentCount,
      errors
    });
  } catch (error) {
    console.error("Reminder cron endpoint error:", error);
    return Response.json(
      { error: error.message || "Failed to process reminder cron job" },
      { status: 500 }
    );
  }
}
