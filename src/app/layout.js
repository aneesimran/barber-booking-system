import "./globals.css";

export const metadata = {
  title: "Anees Hairdressers | Book Your Appointment",
  description:
    "Book your next haircut at Anees Hairdressers. Choose your barber, pick a time, and get a precision cut. Online booking available 24/7.",
  keywords: ["barber", "haircut", "barbershop", "booking", "Anees Hairdressers"],
  openGraph: {
    title: "Anees Hairdressers | Book Your Appointment",
    description:
      "Precision cuts. Premium experience. Book online with Imran or Ali.",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
