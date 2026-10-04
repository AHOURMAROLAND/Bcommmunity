import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";

// Mise à jour à la demande : le bandeau envoie SKIP_WAITING.
self.addEventListener("message", (e) => { if (e.data?.type === "SKIP_WAITING") self.skipWaiting(); });
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Pages de l'application : l'interface précachée. Jamais l'API, le temps réel, les médias ni l'administration.
const ADMIN = new RegExp(`^/${import.meta.env.VITE_ADMIN_URL || "admin/"}`);
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), {
  denylist: [/^\/api\//, /^\/ws\//, /^\/media\//, /^\/static\//, /^\/p\/\d+/, ADMIN],
}));

// Polices des polices de l'éditeur : chargées une fois, gardées un an.
registerRoute(({ request, sameOrigin }) => sameOrigin && request.destination === "font",
  new CacheFirst({ cacheName: "polices", plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 86400 })] }));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data.json(); } catch { /* charge vide */ }
  event.waitUntil(self.registration.showNotification(d.titre || "Bakhita Community", {
    body: d.corps || "", tag: d.tag, renotify: !!d.tag, data: { url: d.url || "/fil" },
    icon: "/icons/192.png", badge: "/icons/192.png",
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/fil", self.location.origin).href;
  event.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const ouverte = fenetres.find((c) => c.url.startsWith(self.location.origin));
    if (ouverte) { await ouverte.focus(); ouverte.navigate?.(url); } else await self.clients.openWindow(url);
  })());
});
