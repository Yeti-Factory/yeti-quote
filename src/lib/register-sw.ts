// Guarded service worker registration. Never registers in Lovable preview,
// iframes, dev builds, or non-secure contexts.
export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const unregisterAppServiceWorkers = () => {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((registration) => {
        const scriptUrl =
          registration.active?.scriptURL ??
          registration.waiting?.scriptURL ??
          registration.installing?.scriptURL ??
          "";
        if (scriptUrl.endsWith("/sw.js")) registration.unregister();
      });
    });
  };

  const { hostname, protocol } = window.location;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  const isSecure = protocol === "https:" || isLocalhost;
  if (!isSecure) return;

  const inIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();
  if (inIframe) {
    unregisterAppServiceWorkers();
    return;
  }

  const isLovablePreview =
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev");
  if (isLovablePreview) {
    unregisterAppServiceWorkers();
    return;
  }

  if (!import.meta.env.PROD) {
    unregisterAppServiceWorkers();
    return;
  }

  if (new URL(window.location.href).searchParams.get("sw") === "off") {
    unregisterAppServiceWorkers();
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("SW registration failed", err);
    });
  });
}
