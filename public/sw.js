// Minimal service worker — no cache strategy. Its purpose is to make the app
// installable via beforeinstallprompt. Requests pass through to the network.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass-through — let the browser handle the request normally.
  event.respondWith(fetch(event.request));
});
