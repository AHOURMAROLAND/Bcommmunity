import { estNatif } from "./plateforme";

async function partagerLien({ url, titre, texte, dialogue }) {
  try {
    if (estNatif()) {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: titre, text: texte, url, dialogTitle: dialogue });
      return "partage";
    }
    if (navigator.share) {
      await navigator.share({ title: titre, text: texte, url });
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

export function partager(pub) {
  const base = import.meta.env.VITE_SITE_URL || window.location.origin;
  return partagerLien({
    url: `${base}/p/${pub.id}/`,
    titre: pub.titre,
    texte: (pub.extrait || "").slice(0, 120),
    dialogue: "Partager la publication",
  });
}

export function partagerProfil(profil) {
  const base = import.meta.env.VITE_SITE_URL || window.location.origin;
  const titre = `${profil.prenom} ${profil.nom} · Bakhita Community`;
  return partagerLien({
    url: `${base}/profil-partage/${profil.id}/`,
    titre,
    texte: profil.bio || `Découvrez le profil de ${profil.prenom} ${profil.nom} sur Bakhita Community.`,
    dialogue: "Partager le profil",
  });
}
