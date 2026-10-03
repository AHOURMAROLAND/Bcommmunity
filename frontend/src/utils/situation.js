export const LIBELLES_SITUATION = { emploi: "Emploi", etudes: "Études", recherche: "En recherche" };

export function resumeSituation(s) {
  if (!s || s.type === "autre") return null;
  if (s.type === "emploi") return [s.poste, s.entreprise].filter(Boolean).join(" chez ");
  if (s.type === "etudes") return [s.domaine_nom, s.etablissement].filter(Boolean).join(", ");
  const o = { emploi: "un emploi", stage: "un stage", formation: "une formation" }[s.objectif] ?? "";
  return `Recherche ${o}`.trim();
}
