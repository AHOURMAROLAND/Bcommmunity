export function erreursChamps(err) {
  const d = err?.data;
  if (!d || typeof d !== "object") return {};
  const sortie = {};
  for (const [cle, valeur] of Object.entries(d)) {
    sortie[cle] = Array.isArray(valeur) ? valeur.join(" ") : String(valeur);
  }
  return sortie;
}

export function tousMessages(err) {
  if (err?.status === 429) return "Trop de requêtes. Réessayez dans un instant.";
  const texte = Object.values(erreursChamps(err)).join(" ");
  if (texte) return texte;
  return err?.status >= 500 ? "Erreur du serveur. Réessayez plus tard." : "Une erreur est survenue.";
}
