import { api } from "../api/client";

const APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID;
const SCRIPT_URL = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
let sdkPromise;
let ecouteurAjoute = false;

export const pushSupporte = () =>
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export const estIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent);

export const estInstalle = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  navigator.standalone === true;

function chargerOneSignal() {
  if (!APP_ID) throw new Error("onesignal_non_configure");
  if (!sdkPromise) {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.querySelector('script[data-onesignal-sdk="true"]');
      const timeout = window.setTimeout(() => reject(new Error("onesignal_echec")), 15000);
      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
          await OneSignal.init({
            appId: APP_ID,
            serviceWorkerPath: "/onesignal/OneSignalSDKWorker.js",
            serviceWorkerParam: { scope: "/onesignal/" },
            welcomeNotification: { disable: true },
            notifyButton: { enable: false },
          });
          window.clearTimeout(timeout);
          resolve(OneSignal);
        } catch (error) {
          window.clearTimeout(timeout);
          reject(error);
        }
      });
      if (!script) {
        const element = document.createElement("script");
        element.src = SCRIPT_URL;
        element.defer = true;
        element.dataset.onesignalSdk = "true";
        element.onerror = () => {
          window.clearTimeout(timeout);
          reject(new Error("onesignal_echec"));
        };
        document.head.append(element);
      }
    }).catch((error) => {
      sdkPromise = null;
      throw error;
    });
  }
  return sdkPromise;
}

async function enregistrerAbonnement(OneSignal) {
  const abonnement = OneSignal.User.PushSubscription;
  if (!abonnement.id || !abonnement.optedIn) return false;
  await api("/notifications/push/onesignal/", {
    method: "POST",
    body: { subscription_id: abonnement.id },
  });
  return true;
}

async function lierCompte(OneSignal, utilisateurId) {
  if (!utilisateurId) return;
  await OneSignal.login(String(utilisateurId));
  if (!ecouteurAjoute) {
    OneSignal.User.PushSubscription.addEventListener("change", (event) => {
      if (event.current.id && event.current.optedIn) {
        enregistrerAbonnement(OneSignal).catch((error) => {
          console.error("Impossible d'enregistrer l'abonnement OneSignal.", error);
        });
      } else if (event.previous.id && event.previous.optedIn) {
        api("/notifications/push/", {
          method: "DELETE",
          body: { cible: event.previous.id },
        }).catch((error) => {
          console.error("Impossible de retirer l'abonnement OneSignal.", error);
        });
      }
    });
    ecouteurAjoute = true;
  }
  await enregistrerAbonnement(OneSignal);
}

/** Lie l'abonnement deja actif au compte connecte. */
export async function synchroniserPushWeb(utilisateurId) {
  if (!APP_ID || !pushSupporte()) return;
  const OneSignal = await chargerOneSignal();
  await lierCompte(OneSignal, utilisateurId);
}

/** Vrai si les notifications OneSignal sont activees sur cet appareil. */
export async function pushActif(utilisateurId) {
  if (!APP_ID || !pushSupporte()) return false;
  const OneSignal = await chargerOneSignal();
  await lierCompte(OneSignal, utilisateurId);
  return OneSignal.User.PushSubscription.optedIn;
}

/** Demande la permission, active OneSignal et associe l'abonnement au compte. */
export async function activerPush(utilisateurId) {
  if (!pushSupporte()) throw new Error("non_supporte");
  if (estIOS() && !estInstalle()) throw new Error("ios_installer");
  if (!utilisateurId) throw new Error("onesignal_echec");

  const OneSignal = await chargerOneSignal();
  await lierCompte(OneSignal, utilisateurId);
  const autorise = await OneSignal.Notifications.requestPermission();
  if (!autorise) throw new Error("refuse");
  await OneSignal.User.PushSubscription.optIn();

  for (let tentative = 0; tentative < 40; tentative += 1) {
    if (await enregistrerAbonnement(OneSignal)) return;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  throw new Error("onesignal_echec");
}

/** Desactive l'abonnement de cet appareil avant la deconnexion du compte. */
export async function desactiverPush() {
  if (!APP_ID || !pushSupporte()) return;
  const OneSignal = await chargerOneSignal();
  const abonnement = OneSignal.User.PushSubscription;
  const id = abonnement.id;
  await abonnement.optOut();
  if (id) {
    await api("/notifications/push/", {
      method: "DELETE",
      body: { cible: id },
    });
  }
  await OneSignal.logout();
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
