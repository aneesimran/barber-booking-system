import "./globals.css";

export const metadata = {
  title: "Anees Hairdressers | Book Your Appointment",
  description:
    "Book your next haircut at Anees Hairdressers. Choose your barber, pick a time, and get a precision cut. Online booking available 24/7.",
  keywords: ["barber", "haircut", "barbershop", "booking", "Anees Hairdressers"],
  openGraph: {
    title: "Anees Hairdressers | Book Your Appointment",
    description:
      "Precision cuts. Premium experience. Book online with Imran, Ali, or Mudni.",
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
              // Immediate self-healing: Purge all caches domain-wide
              if ('caches' in window) {
                caches.keys().then(function(names) {
                  for (var i = 0; i < names.length; i++) {
                    caches.delete(names[i]);
                  }
                }).catch(function() {});
              }

              // Unregister all legacy service workers domain-wide
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  for (var i = 0; i < registrations.length; i++) {
                    registrations[i].unregister();
                  }
                }).catch(function() {});

                // If page was controlled by a legacy worker, reload once when it unregisters/changes
                var hadController = !!navigator.serviceWorker.controller;
                navigator.serviceWorker.addEventListener('controllerchange', function() {
                  if (hadController) {
                    hadController = false;
                    window.location.reload();
                  }
                });
              }

              if (window.location.pathname.startsWith('/admin')) {
                // Add manifest and Apple PWA tags for Admin standalone installation
                var link = document.createElement('link');
                link.rel = 'manifest';
                link.href = '/manifest.json';
                document.head.appendChild(link);

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
              }
            `
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
