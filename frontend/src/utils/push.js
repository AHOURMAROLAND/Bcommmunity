import { api } from "../api/client";
import { estNatif } from "./plateforme";

const CLE_ACTIF = "bk_push_natif", CLE_JETON = "bk_fcm_jeton";
const lire = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const ecrire = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* indisponible */ } };

const versBytes = (s) => {
  const r = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(r, (c) => c.charCodeAt(0));
};

export const estIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const estInstalle = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
export const pushSupporte = () =>
  estNatif() || ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window);

// ---------- Android (Capacitor) ----------
let ecouteurs = [];

async function enregistrerNatif(PN) {
  await Promise.all(ecouteurs.map((h) => h.remove()));
  let ok, ko;
  const attente = new Promise((a, b) => { ok = a; ko = b; });
  ecouteurs = [
    await PN.addListener("registration", async (t) => {
      try {
        await api("/notifications/push/fcm/", { method: "POST", body: { jeton: t.value } });
        ecrire(CLE_ACTIF, "1"); ecrire(CLE_JETON, t.value);
        ok();
      } catch (e) { ko(e); }
    }),
    await PN.addListener("registrationError", () => ko(new Error("refuse"))),
  ];
  await PN.register();
  return attente;
}

async function activerNatif() {
  const { PushNotifications: PN } = await import("@capacitor/push-notifications");
  let p = await PN.checkPermissions();
  if (p.receive.startsWith("prompt")) p = await PN.requestPermissions();
  if (p.receive !== "granted") throw new Error("refuse");
  await enregistrerNatif(PN);
}

async function desactiverNatif() {
  const { PushNotifications: PN } = await import("@capacitor/push-notifications");
  const jeton = lire(CLE_JETON);
  if (jeton) await api("/notifications/push/", { method: "DELETE", body: { cible: jeton } }).catch(() => {});
  ecrire(CLE_ACTIF, null); ecrire(CLE_JETON, null);
  await PN.unregister().catch(() => {});
}

// Au démarrage de l'APK : ouvre la bonne page au toucher d'une alerte, rafraîchit le jeton si l'alerte est activée.
export async function initialiserPushNatif(navigate) {
  const { PushNotifications: PN } = await import("@capacitor/push-notifications");
  await PN.removeAllListeners();
  PN.addListener("pushNotificationActionPerformed", (a) => {
    const u = a.notification?.data?.url;
    if (typeof u === "string" && u.startsWith("/") && !u.startsWith("//")) navigate(u);
  });
  const p = await PN.checkPermissions();
  if (p.receive === "granted" && lire(CLE_ACTIF)) await enregistrerNatif(PN).catch(() => {});
}

// ---------- Web ----------
async function activerWeb() {
  if (estIOS() && !estInstalle()) throw new Error("ios_installer");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("refuse");
  const reg = await navigator.serviceWorker.ready;
  const { cle } = await api("/notifications/push/cle/");
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: versBytes(cle) }));
  const { endpoint, keys } = sub.toJSON();
  await api("/notifications/push/web/", { method: "POST", body: { endpoint, keys } });
}

async function desactiverWeb() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api("/notifications/push/", { method: "DELETE", body: { cible: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe();
}

// ---------- Interface commune ----------
export async function pushActif() {
  if (estNatif()) {
    const { PushNotifications: PN } = await import("@capacitor/push-notifications");
    return (await PN.checkPermissions()).receive === "granted" && !!lire(CLE_ACTIF);
  }
  if (!pushSupporte() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}
export const activerPush = () => (estNatif() ? activerNatif() : activerWeb());
export const desactiverPush = () => (!pushSupporte() ? Promise.resolve() : estNatif() ? desactiverNatif() : desactiverWeb());
