import { api } from "../api/client";

/** Convertit une cle VAPID Base64url en Uint8Array. */
const versBytes = (s) => {
  const b64 = (s + "=".repeat((4 - (s.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export const pushSupporte = () =>
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export const estIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent);

export const estInstalle = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  navigator.standalone === true;

/** Vrai si l'abonnement push est actif sur cet appareil. */
export async function pushActif() {
  if (!pushSupporte() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  return !!(await reg?.pushManager.getSubscription());
}

/**
 * Demande la permission, enregistre le SW, cree l'abonnement et
 * l'enregistre sur le serveur.
 * Lance une erreur avec message "non_supporte", "ios_installer" ou "refuse".
 */
export async function activerPush() {
  if (!pushSupporte()) throw new Error("non_supporte");
  if (estIOS() && !estInstalle()) throw new Error("ios_installer");

  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("refuse");

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const { cle } = await api("/notifications/push/cle/");
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: versBytes(cle),
    }));

  const { endpoint, keys } = sub.toJSON();
  await api("/notifications/push/web/", {
    method: "POST",
    body: { endpoint, keys },
  });
}

/**
 * Retire l'abonnement push de cet appareil.
 * Appele a la deconnexion pour que le compte suivant ne recoit pas les alertes.
 */
export async function desactiverPush() {
  if (!pushSupporte()) return;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api("/notifications/push/", {
    method: "DELETE",
    body: { cible: sub.endpoint },
  }).catch(() => {});
  await sub.unsubscribe();
}

/**
 * Initialise le push natif Capacitor (APK Android - jalon M7).
 * Sur le web, cette fonction ne fait rien.
 */
export async function initialiserPushNatif(navigate) {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.requestPermissions();
    await PushNotifications.register();
    PushNotifications.addListener("registration", async (token) => {
      await api("/notifications/push/fcm/", {
        method: "POST",
        body: { jeton: token.value },
      }).catch(() => {});
    });
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const url = action.notification?.data?.url;
      if (url) navigate(url);
    });
  } catch {
    // @capacitor/push-notifications non disponible en mode web : ignore
  }
}
