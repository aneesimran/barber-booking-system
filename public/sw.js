// Self-Destructing Service Worker Kill Switch
// Permanently clears all CacheStorage, unregisters itself, and commands open tabs to reload from network.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            console.log("Purging service worker cache:", cacheName);
            return caches.delete(cacheName);
          })
        );
      })
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) => {
        for (const client of clients) {
          if (client.url && "navigate" in client) {
            client.navigate(client.url);
          }
        }
      })
  );
  self.clients.claim();
});

// Pass through all fetch requests immediately to network without interception
self.addEventListener("fetch", (event) => {
  return;
});

