export function calculerParcours(cycles, { toujoursALEcole = false } = {}) {
  let anneeSuivante = null;
  const parcours = [];

  for (const cycle of cycles) {
    if (cycle.saute) {
      parcours.push({ ...cycle, classes: [], saute: true });
      anneeSuivante = null;
      continue;
    }

    const classes = cycle.classes ?? [];
    const selection = Array.isArray(cycle.classeIds)
      ? new Set(cycle.classeIds.map(String))
      : null;
    const retenues = selection
      ? classes.filter((classe) => selection.has(String(classe.id)))
      : (() => {
        const debut = classes.findIndex((classe) => String(classe.id) === String(cycle.premiereClasseId));
        const fin = classes.findIndex((classe) => String(classe.id) === String(cycle.derniereClasseId));
        return debut >= 0 && fin >= debut ? classes.slice(debut, fin + 1) : [];
      })();
    if (!retenues.length) {
      throw new Error(`Choisissez une classe de départ et une dernière classe pour ${cycle.nom}.`);
    }

    const arriveeSaisie = cycle.anneeArrivee;
    const anneeArrivee = arriveeSaisie !== "" && arriveeSaisie != null
      ? Number(arriveeSaisie)
      : anneeSuivante ?? Number(arriveeSaisie);
    if (!Number.isInteger(anneeArrivee) || anneeArrivee < 1950) {
      throw new Error(`Année d'arrivée invalide pour ${cycle.nom}.`);
    }
    let annee = anneeArrivee;
    let indexClassePrecedente = null;
    const classesCalculees = retenues.map((classe, index) => {
      const indexDansCycle = classes.findIndex((item) => String(item.id) === String(classe.id));
      if (indexClassePrecedente !== null) {
        annee += indexDansCycle - indexClassePrecedente - 1;
      }
      indexClassePrecedente = indexDansCycle;
      const duree = Number(cycle.durees?.[classe.id] ?? 1);
      if (duree !== 1 && duree !== 2) {
        throw new Error("La durée d'une classe doit être d'un ou deux ans.");
      }
      const enCours = toujoursALEcole &&
        cycle === cycles.filter((item) => !item.saute).at(-1) &&
        index === retenues.length - 1;
      const anneeFin = enCours ? null : annee + duree;
      const resultat = { ...classe, anneeDebut: annee, anneeFin, duree };
      if (anneeFin !== null) annee = anneeFin;
      return resultat;
    });
    const anneeFinCycle = classesCalculees.at(-1)?.anneeFin ?? null;
    anneeSuivante = anneeFinCycle;
    parcours.push({ ...cycle, classes: classesCalculees, anneeDebut: anneeArrivee, anneeFin: anneeFinCycle });
  }

  return parcours;
}
