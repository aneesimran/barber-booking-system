// Service Worker to satisfy PWA installability requirements for Anees Admin
const CACHE_NAME = "anees-admin-v2";

const STATIC_ASSETS = [
  "/manifest.json",
  "/icon-192x192.png",
  "/icon-512x512.png"
];

self.addEventListener("install", (event) => {
  // Pre-cache only PWA manifest and icons
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("PWA asset caching skipped on install:", err);
      });
    })
  );
  // Force active immediately without waiting for existing tabs to close
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Purge all legacy caches including the old 'anees-hairdressers-v1'
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("Purging old service worker cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Network-first for static icons; NEVER cache HTML documents / navigations
self.addEventListener("fetch", (event) => {
  // 1. Navigation requests (HTML pages) ALWAYS go directly to the network.
  // This guarantees customers and admins never see stale booking pages or missing barbers.
  if (event.request.mode === "navigate") {
    return;
  }

  // 2. Skip non-GET, API calls, and Next.js dynamic data
  if (
    event.request.method !== "GET" ||
    event.request.url.includes("/api/") ||
    event.request.url.includes("/_next/data/")
  ) {
    return;
  }

  // 3. For manifest/icons only, use Network-First with cache fallback
  const url = new URL(event.request.url);
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
