import { barbers } from "@/config/barbers";
import BookingWizard from "@/components/booking/BookingWizard";
import Link from "next/link";

export async function generateMetadata({ params }) {
  const { barberId } = await params;
  const barber = barbers.find((b) => b.id === barberId);
  if (!barber) return { title: "Barber Not Found | Anees Hairdressers" };
  return {
    title: `Book with ${barber.name} | Anees Hairdressers`,
    description: `Book a ${barber.role === "Senior Barber & Owner" ? "premium" : ""} haircut with ${barber.name} at Anees Hairdressers. Choose your date and time.`,
  };
}

export default async function BookingPage({ params }) {
  const { barberId } = await params;
  const barber = barbers.find((b) => b.id === barberId);

  if (!barber) {
    return (
      <main className="flex-1 flex items-center justify-center min-h-screen px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
            Barber Not Found
          </h1>
          <p className="text-[var(--text-muted)] mb-6">
            The barber you&apos;re looking for doesn&apos;t exist.
          </p>
          <Link href="/" className="btn-gold inline-block text-sm">
            &larr; Back to Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <BookingWizard barber={barber} />
    </main>
  );
}
