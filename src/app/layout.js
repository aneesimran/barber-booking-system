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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (window.location.pathname.startsWith('/admin')) {
                // Add the manifest dynamically
                var link = document.createElement('link');
                link.rel = 'manifest';
                link.href = '/manifest.json';
                document.head.appendChild(link);

                // Add Apple PWA meta tags
                var appleIcon = document.createElement('link');
                appleIcon.rel = 'apple-touch-icon';
                appleIcon.href = '/apple-icon.png';
                document.head.appendChild(appleIcon);

                var appleCapable = document.createElement('meta');
                appleCapable.name = 'apple-mobile-web-app-capable';
                appleCapable.content = 'yes';
                document.head.appendChild(appleCapable);

                var appleStyle = document.createElement('meta');
                appleStyle.name = 'apple-mobile-web-app-status-bar-style';
                appleStyle.content = 'black-translucent';
                document.head.appendChild(appleStyle);

                var themeColor = document.createElement('meta');
                themeColor.name = 'theme-color';
                themeColor.content = '#0a0a0a';
                document.head.appendChild(themeColor);

                // Register service worker
                if ('serviceWorker' in navigator) {
                  window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js').then(
                      function(registration) {
                        console.log('Admin ServiceWorker registration successful');
                      },
                      function(err) {
                        console.error('Admin ServiceWorker registration failed: ', err);
                      }
                    );
                  });
                }
              }
            `
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
