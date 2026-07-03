// Minimal service worker — no cache strategy. Its purpose is to make the app
// installable on the published app. Requests pass through to the network.
const hostname = self.location.hostname;
const isLovablePreview =
  hostname.startsWith("id-preview--") ||
  hostname.startsWith("preview--") ||
  hostname === "lovableproject.com" ||
  hostname.endsWith(".lovableproject.com") ||
  hostname === "lovableproject-dev.com" ||
  hostname.endsWith(".lovableproject-dev.com") ||
  hostname === "beta.lovable.dev" ||
  hostname.endsWith(".beta.lovable.dev") ||
  hostname === "lovable.app" ||
  hostname.endsWith(".lovable.app");

function isWorkboxCacheForThisRegistration(name) {
  const hasWorkboxBucket = /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/.test(name);
  return hasWorkboxBucket && name.endsWith(self.registration.scope);
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      const workboxCacheNames = cacheNames.filter(isWorkboxCacheForThisRegistration);
      await Promise.allSettled(workboxCacheNames.map((name) => caches.delete(name)));
      await self.clients.claim();

      if (isLovablePreview) {
        try {
          const windowClients = await self.clients.matchAll({ type: "window" });
          await Promise.allSettled(windowClients.map((client) => client.navigate(client.url)));
        } finally {
          await self.registration.unregister();
        }
      }
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (!isLovablePreview) {
    // Pass-through — let the browser handle the request normally.
    event.respondWith(fetch(event.request));
  }
});
