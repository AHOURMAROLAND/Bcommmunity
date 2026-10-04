import { estNatif } from "./plateforme";

export async function partager(pub) {
  const base = import.meta.env.VITE_SITE_URL || window.location.origin;
  const url = `${base}/p/${pub.id}`;
  const texte = (pub.extrait || "").slice(0, 120);
  try {
    if (estNatif()) {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: pub.titre, text: texte, url, dialogTitle: "Partager la publication" });
      return "partage";
    }
    if (navigator.share) {
      await navigator.share({ title: pub.titre, text: texte, url });
      return "partage";
    }
  } catch (e) {
    if (e?.name === "AbortError" || /cancel/i.test(e?.message ?? "")) return "annule";
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copie";
  } catch {
    window.prompt("Copiez ce lien :", url);
    return "manuel";
  }
}
