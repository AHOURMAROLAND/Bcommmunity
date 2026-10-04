import { Capacitor } from "@capacitor/core";

export const estNatif = () => Capacitor.isNativePlatform();
export const plateforme = () => Capacitor.getPlatform(); // "web" | "android" | "ios"
