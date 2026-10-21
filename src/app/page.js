import BarberSelection from "@/components/BarberSelection";
import Footer from "@/components/Footer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Home() {
  return (
    <main className="flex-1">
      <BarberSelection />
      <Footer />
    </main>
  );
}
