import { getAvailableSlots } from "@/lib/appointments";

/**
 * GET /api/available-slots?barberId=imran&date=2026-05-06
 * Returns available time slots for a barber on a specific date.
 */
export async function GET(request) {
  const { searchParams } = request.nextUrl;
  const barberId = searchParams.get("barberId");
  const dateString = searchParams.get("date");

  if (!barberId || !dateString) {
    return Response.json(
      { error: "barberId and date are required" },
      { status: 400 }
    );
  }

  // Parse the date string
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (isNaN(date.getTime())) {
    return Response.json({ error: "Invalid date format" }, { status: 400 });
  }

  try {
    const slots = await getAvailableSlots(barberId, date);
    return Response.json({ slots, date: dateString, barberId });
  } catch (error) {
    console.error("Error fetching available slots:", error);
    return Response.json(
      { error: "Failed to fetch available slots" },
      { status: 500 }
    );
  }
}
