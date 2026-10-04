self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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
