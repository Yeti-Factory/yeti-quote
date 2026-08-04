// Minimal service worker with no cache strategy. Its purpose is to keep the
// published application installable as a PWA.

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
    })(),
  );
});
