import Hero from "@/components/Hero";
import BarberSelection from "@/components/BarberSelection";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="flex-1">
      <Hero />
      <BarberSelection />
      <Footer />
    </main>
  );
}
