import { api } from "../api/client";

const versBytes = (s) => {
  const r = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(r, (c) => c.charCodeAt(0));
};

export const pushSupporte = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const estIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const estInstalle = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

export async function pushActif() {
  if (!pushSupporte() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  return !!(await reg?.pushManager.getSubscription());
}

export async function activerPush() {
  if (!pushSupporte()) throw new Error("non_supporte");
  if (estIOS() && !estInstalle()) throw new Error("ios_installer");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("refuse");
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const { cle } = await api("/notifications/push/cle/");
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: versBytes(cle) }));
  const { endpoint, keys } = sub.toJSON();
  await api("/notifications/push/web/", { method: "POST", body: { endpoint, keys } });
}

// Retire l'abonnement de cet appareil (à la déconnexion, pour ne pas notifier le compte suivant).
export async function desactiverPush() {
  if (!pushSupporte()) return;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api("/notifications/push/", { method: "DELETE", body: { cible: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe();
}
