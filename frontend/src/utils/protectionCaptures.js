import { registerPlugin } from "@capacitor/core";
import { estNatif } from "./plateforme";

const ProtectionCaptures = registerPlugin("ScreenshotProtection");
let miseAJour = Promise.resolve();

export function definirBlocageCaptures(bloquees) {
  if (!estNatif()) return Promise.resolve();
  miseAJour = miseAJour.catch(() => {}).then(() =>
    ProtectionCaptures.setBlocked({ blocked: Boolean(bloquees) }));
  return miseAJour;
}
