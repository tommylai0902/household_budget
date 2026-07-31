/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

// Custom service worker, replacing vite-plugin-pwa's generated one (the config
// switched from generateSW to injectManifest for this file). Everything below
// the precache block is why: generateSW can cache, but it cannot be taught to
// handle a push event, and a second service worker can't be registered on the
// same scope to do it separately.

// The precache list vite-plugin-pwa injects at build time. Keeping this means
// the offline behaviour is exactly what generateSW gave us before.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Was workbox: { skipWaiting, clientsClaim } in vite.config.js — under
// injectManifest that option is ignored, so the same two behaviours are
// declared here instead. Without them an update sits idle until every tab is
// closed, which for an installed PWA can be weeks.
self.skipWaiting();
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// A reminder arriving while the app is closed. Payload is written by
// api/send-reminders.js and is already in the subscriber's own language —
// there is no i18n here on purpose, the server picked the words.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* non-JSON payload: fall through to defaults */ }
  // A push event MUST show a notification (userVisibleOnly), or the browser
  // eventually revokes the subscription — hence a title fallback rather than
  // an early return on a malformed payload.
  event.waitUntil(
    self.registration.showNotification(data.title || "Monira", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Collapses repeats of the same reminder into one entry rather than
      // stacking duplicates if a send is ever retried.
      tag: data.tag || undefined,
      data: { url: data.url || "/" },
    }),
  );
});

// Focus the app if it's already open somewhere, rather than opening a second
// window on top of the one the user already has.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = clients.find((c) => c.url.startsWith(self.location.origin));
    if (open) { await open.focus(); return; }
    await self.clients.openWindow(url);
  })());
});
