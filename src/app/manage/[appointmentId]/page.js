import ManageAppointment from "@/components/manage/ManageAppointment";

export const metadata = {
  title: "Manage Your Appointment | Anees Hairdressers",
  description: "Reschedule or cancel your appointment at Anees Hairdressers.",
};

export default async function ManagePage({ params, searchParams }) {
  const { appointmentId } = await params;
  const { token } = await searchParams;

  return (
    <main className="flex-1">
      <ManageAppointment appointmentId={appointmentId} token={token || ""} />
    </main>
  );
}
