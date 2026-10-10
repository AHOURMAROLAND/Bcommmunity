import { useEffect, useMemo, useState } from "react";
import { useParcoursBrouillon, useReferentiels, useSauverParcoursBrouillon, useValiderParcours } from "../api/hooks";
import { Bouton, Champ, Selecteur } from "../components/ui";
import { SqFormulaire } from "../components/Squelettes";
import { tousMessages } from "../api/erreurs";
import { calculerParcours } from "../utils/calculParcours";

const ANNEE_COURANTE = new Date().getFullYear();
const CYCLES_VIDES = [];
const FILIERES_VIDES = [];

function configVide() {
  return {
    saute: false,
    premiereClasseId: "",
    derniereClasseId: "",
    classeIds: [],
    anneeArrivee: "",
    durees: {},
  };
}

function estLycee(cycle) {
  return cycle.nom.toLocaleLowerCase("fr").includes("lycée");
}

function classesDuCycle(cycle, filiereId) {
  if (!estLycee(cycle)) return cycle.classes;
  if (!filiereId) return [];
  return cycle.classes.filter((classe) => String(classe.filiere_ref) === String(filiereId));
}

function libelleClasse(classe) {
  return `${classe.nom}${classe.filiere ? ` ${classe.filiere}` : ""}`;
}

function classesSelectionnees(config, classes) {
  if (Array.isArray(config.classeIds)) {
    const selection = new Set(config.classeIds.map(String));
    return classes.filter((classe) => selection.has(String(classe.id)));
  }
  const debut = classes.findIndex((classe) => String(classe.id) === String(config.premiereClasseId));
  const fin = classes.findIndex((classe) => String(classe.id) === String(config.derniereClasseId));
  return debut >= 0 && fin >= debut ? classes.slice(debut, fin + 1) : [];
}

export default function EtapeParcours({ onSuivant, onRetour }) {
  const referentiels = useReferentiels();
  const brouillon = useParcoursBrouillon();
  const sauverBrouillon = useSauverParcoursBrouillon();
  const valider = useValiderParcours();
  const cycles = referentiels.data?.cycles ?? CYCLES_VIDES;
  const filieres = referentiels.data?.filieres ?? FILIERES_VIDES;
  const [donnees, setDonnees] = useState(null);
  const [indexCycle, setIndexCycle] = useState(0);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    if (donnees || brouillon.isPending || referentiels.isPending) return;
    const sauvegarde = brouillon.data?.donnees;
    const configurations = Object.fromEntries(
      cycles.map((cycle) => [
        String(cycle.id),
        sauvegarde?.cycles?.[cycle.id] ?? configVide(),
      ]),
    );
    setDonnees({
      typeLycee: sauvegarde?.typeLycee ?? "",
      filiereId: sauvegarde?.filiereId ?? "",
      toujoursAEcole: sauvegarde?.toujoursAEcole ?? false,
      cycles: configurations,
    });
    if (Number.isInteger(sauvegarde?.indexCycle)) {
      setIndexCycle(Math.min(Math.max(sauvegarde.indexCycle, 0), cycles.length));
    }
  }, [brouillon.data, brouillon.isPending, cycles, donnees, referentiels.isPending]);

  useEffect(() => {
    if (!donnees) return undefined;
    const timer = window.setTimeout(() => {
      sauverBrouillon.mutate({
        etape: 2,
        donnees: { ...donnees, indexCycle },
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [donnees, indexCycle]);

  const filieresLycee = useMemo(
    () => filieres.filter((filiere) => filiere.type_lycee === donnees?.typeLycee),
    [donnees?.typeLycee, filieres],
  );

  const parcours = useMemo(() => {
    if (!donnees || cycles.length === 0) return [];
    try {
      const definitions = cycles.map((cycle) => {
        const config = donnees.cycles[cycle.id] ?? configVide();
        const classes = classesDuCycle(cycle, donnees.filiereId);
        return {
          ...config,
          id: cycle.id,
          nom: cycle.nom,
          classes,
          premiereClasseId: config.premiereClasseId,
          derniereClasseId: config.derniereClasseId,
          anneeArrivee: config.anneeArrivee,
          durees: config.durees,
        };
      });
      const dernierCycleActif = definitions.filter((item) => !item.saute).at(-1);
      let anneeSuivante = null;
      return definitions.map((definition) => {
        if (definition.saute) {
          anneeSuivante = null;
          return { ...definition, classes: [], anneeDebut: null, anneeFin: null };
        }
        try {
          const calcule = calculerParcours([{
            ...definition,
            anneeArrivee: definition.anneeArrivee || anneeSuivante,
          }], {
            toujoursALEcole: donnees.toujoursAEcole && definition === dernierCycleActif,
          })[0];
          anneeSuivante = calcule.anneeFin;
          return calcule;
        } catch {
          anneeSuivante = null;
          return { ...definition, classes: [], anneeDebut: null, anneeFin: null };
        }
      });
    } catch {
      return [];
    }
  }, [cycles, donnees]);

  if (referentiels.isPending || brouillon.isPending || !donnees) return <SqFormulaire champs={5} />;
  if (referentiels.isError || brouillon.isError) {
    return <p role="alert" className="erreur">Impossible de charger votre parcours scolaire. Réessayez.</p>;
  }

  const cycle = cycles[indexCycle];
  const config = cycle ? donnees.cycles[cycle.id] : null;
  const listeClasses = cycle ? classesDuCycle(cycle, donnees.filiereId) : [];
  const selectionClasses = cycle ? classesSelectionnees(config, listeClasses) : [];
  const idsClassesSelectionnees = new Set(selectionClasses.map((item) => String(item.id)));
  const indexPremiere = listeClasses.findIndex((classe) => String(classe.id) === String(config?.premiereClasseId));
  const cycleCalcule = parcours.find((item) => String(item.id) === String(cycle?.id));
  const anneeAuto = cycleCalcule?.anneeDebut;
  function majCycle(changements) {
    setDonnees((actuel) => ({
      ...actuel,
      cycles: {
        ...actuel.cycles,
        [cycle.id]: { ...actuel.cycles[cycle.id], ...changements },
      },
    }));
  }

  function choisirCycleSuivant() {
    if (indexCycle < cycles.length) setIndexCycle((index) => index + 1);
  }

  async function passerCycle() {
    const prochainesDonnees = {
      ...donnees,
      cycles: { ...donnees.cycles, [cycle.id]: { ...config, saute: true } },
    };
    setDonnees(prochainesDonnees);
    setErreur("");
    try {
      await sauverBrouillon.mutateAsync({ etape: 2, donnees: { ...prochainesDonnees, indexCycle: indexCycle + 1 } });
    } catch (cause) {
      setErreur(tousMessages(cause));
      return;
    }
    choisirCycleSuivant();
  }

  function preparerClasses() {
    const selection = classesSelectionnees(config, listeClasses);
    if (!selection.length) return null;
    const debut = listeClasses.findIndex((classe) => String(classe.id) === String(selection[0].id));
    const fin = listeClasses.findIndex((classe) => String(classe.id) === String(selection.at(-1).id));
    const valeurArrivee = config.anneeArrivee || anneeAuto;
    const arrival = Number(valeurArrivee);
    if (!Number.isInteger(arrival) || arrival < 1950 || arrival > ANNEE_COURANTE) return null;
    return { debut, fin, arrival, classeIds: selection.map((item) => String(item.id)) };
  }

  async function terminerParcours() {
    setErreur("");
    const donneesValides = cycles.map((item) => {
      const choix = donnees.cycles[item.id] ?? configVide();
      if (choix.saute) return { cycle_id: item.id, saute: true };
      const trouve = parcours.find((resultat) => String(resultat.id) === String(item.id));
      const selection = classesSelectionnees(choix, classesDuCycle(item, donnees.filiereId));
      if (!trouve || !selection.length) {
        throw new Error(`Complétez le parcours ${item.nom} ou indiquez que vous n'avez pas fait ce cycle.`);
      }
      return {
        cycle_id: item.id,
        premiere_classe_id: Number(selection[0].id),
        derniere_classe_id: Number(selection.at(-1).id),
        classe_ids: selection.map((classe) => Number(classe.id)),
        annee_arrivee: trouve.anneeDebut,
        durees: choix.durees,
      };
    });
    const cycleLycee = cycles.find(estLycee);
    const configLycee = cycleLycee && donnees.cycles[cycleLycee.id];
    if (configLycee && !configLycee.saute && (!donnees.typeLycee || !donnees.filiereId)) {
      throw new Error("Choisissez le type de lycée et une filière.");
    }
    await valider.mutateAsync({
      cycles: donneesValides,
      toujours_a_ecole: donnees.toujoursAEcole,
      ...(configLycee && !configLycee.saute
        ? { type_lycee: donnees.typeLycee, filiere_id: Number(donnees.filiereId) }
        : {}),
    });
    await onSuivant();
  }

  async function avancerCycle() {
    setErreur("");
    if (!cycle) return;
    if (config.saute) {
      try {
        await sauverBrouillon.mutateAsync({ etape: 2, donnees: { ...donnees, indexCycle: indexCycle + 1 } });
      } catch (cause) {
        setErreur(tousMessages(cause));
        return;
      }
      choisirCycleSuivant();
      return;
    }
    if (estLycee(cycle) && (!donnees.typeLycee || !donnees.filiereId)) {
      setErreur("Choisissez d'abord le type de lycée et la filière.");
      return;
    }
    if (!preparerClasses()) {
      setErreur("Choisissez votre première classe, votre dernière classe et une année d'arrivée valide.");
      return;
    }
    try {
      await sauverBrouillon.mutateAsync({ etape: 2, donnees: { ...donnees, indexCycle: indexCycle + 1 } });
    } catch (cause) {
      setErreur(tousMessages(cause));
      return;
    }
    setIndexCycle((index) => index + 1);
  }

  async function revenir() {
    try {
      await sauverBrouillon.mutateAsync({ etape: 2, donnees: { ...donnees, indexCycle } });
      onRetour();
    } catch (cause) {
      setErreur(tousMessages(cause));
    }
  }

  function cocherJusquaDerniere() {
    if (!listeClasses.length) return;
    if (selectionClasses.length === listeClasses.length) {
      majCycle({ premiereClasseId: "", derniereClasseId: "", classeIds: [] });
      return;
    }
    const classeIds = listeClasses.map((classe) => String(classe.id));
    majCycle({
      saute: false,
      premiereClasseId: classeIds[0],
      derniereClasseId: classeIds.at(-1),
      classeIds,
    });
  }

  function choisirSelectionClasse(classeId, cochee) {
    const selection = new Set(idsClassesSelectionnees);
    if (cochee) selection.add(String(classeId));
    else selection.delete(String(classeId));
    const classeIds = listeClasses
      .filter((classe) => selection.has(String(classe.id)))
      .map((classe) => String(classe.id));
    majCycle({
      saute: false,
      premiereClasseId: classeIds[0] ?? "",
      derniereClasseId: classeIds.at(-1) ?? "",
      classeIds,
    });
  }

  async function validerEtape() {
    try {
      await terminerParcours();
    } catch (cause) {
      setErreur(tousMessages(cause));
    }
  }

  const couleurCycle = "#102654";
  const stylePanneau = {
    marginTop: ".75rem",
    padding: ".7rem",
    border: "1px solid #e3e9f5",
    borderRadius: ".8rem",
    background: "#f1f4fa",
  };

  return (
    <section style={{ maxWidth: "42rem", margin: "0 auto" }}>
      <p className="doux" style={{ textAlign: "center", margin: "0 0 .85rem" }}>
        Mon parcours scolaire
      </p>
      <nav
        aria-label="Étapes du parcours scolaire"
        style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(cycles.length, 1)}, minmax(0, 1fr))`, gap: ".5rem", marginBottom: "1.25rem" }}
      >
        {cycles.map((etape, index) => {
          const active = index === indexCycle;
          const complete = index < indexCycle;
          return (
            <button
              key={etape.id}
              type="button"
              aria-current={active ? "step" : undefined}
              aria-label={`${etape.nom}${complete ? " (complété ou passé)" : ""}`}
              disabled={index > indexCycle}
              onClick={() => setIndexCycle(index)}
              style={{ border: 0, padding: 0, color: active ? couleurCycle : "var(--texte-doux)", background: "none", cursor: index > indexCycle ? "default" : "pointer", minWidth: 0 }}
            >
              <span style={{
                display: "block", height: ".3rem", borderRadius: "1rem",
                background: active || complete ? couleurCycle : "#dbe2f1",
                marginBottom: ".35rem",
              }} />
              <span style={{ fontSize: ".75rem", whiteSpace: "nowrap" }}>{etape.nom}</span>
            </button>
          );
        })}
      </nav>
      {indexCycle < cycles.length ? (
        <>
          <h1 style={{ margin: "0 0 .8rem", fontSize: "1.35rem", color: couleurCycle }}>
            Cycle {cycle.nom}
          </h1>
          {estLycee(cycle) && (
            <div style={{ display: "grid", gap: ".65rem", marginBottom: ".8rem" }}>
              <div role="group" aria-label="Type de lycée" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".4rem" }}>
                {[
                  ["moderne", "Lycée moderne"],
                  ["technique", "Lycée technique"],
                ].map(([valeur, libelle]) => (
                  <button
                    key={valeur}
                    type="button"
                    aria-pressed={donnees.typeLycee === valeur}
                    onClick={() => setDonnees((actuel) => ({
                      ...actuel,
                      typeLycee: valeur,
                      filiereId: "",
                      cycles: {
                        ...actuel.cycles,
                        [cycle.id]: { ...actuel.cycles[cycle.id], premiereClasseId: "", derniereClasseId: "" },
                      },
                    }))}
                    style={{
                      minHeight: "2.7rem", borderRadius: ".7rem",
                      border: `1px solid ${donnees.typeLycee === valeur ? couleurCycle : "#dbe2f1"}`,
                      background: donnees.typeLycee === valeur ? couleurCycle : "#fff",
                      color: donnees.typeLycee === valeur ? "#fff" : couleurCycle,
                      fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    {libelle}
                  </button>
                ))}
              </div>
              <Selecteur
                label="Filière"
                value={donnees.filiereId}
                disabled={!donnees.typeLycee}
                onChange={(event) => setDonnees((actuel) => ({
                  ...actuel,
                  filiereId: event.target.value,
                  cycles: {
                    ...actuel.cycles,
                    [cycle.id]: { ...actuel.cycles[cycle.id], premiereClasseId: "", derniereClasseId: "" },
                  },
                }))}
              >
                <option value="">Choisir...</option>
                {filieresLycee.map((filiere) => (
                  <option key={filiere.id} value={filiere.id}>{filiere.nom}</option>
                ))}
              </Selecteur>
            </div>
          )}

          {!config.saute && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".6rem" }}>
                <Selecteur
                  label="Première classe"
                  value={config.premiereClasseId}
                  disabled={!listeClasses.length}
                  onChange={(event) => {
                    const premiere = event.target.value;
                    if (!premiere) {
                      majCycle({
                        saute: false,
                        premiereClasseId: "",
                        derniereClasseId: "",
                        classeIds: [],
                      });
                      return;
                    }
                    const premiereIndex = listeClasses.findIndex((item) => String(item.id) === premiere);
                    const derniereIndex = listeClasses.findIndex((item) => String(item.id) === String(config.derniereClasseId));
                    const fin = derniereIndex >= premiereIndex ? derniereIndex : premiereIndex;
                    const classeIds = listeClasses
                      .slice(premiereIndex, fin + 1)
                      .map((item) => String(item.id));
                    majCycle({
                      saute: false,
                      premiereClasseId: premiere,
                      derniereClasseId: classeIds.at(-1) ?? "",
                      classeIds,
                    });
                  }}
                >
                  <option value="">Choisir...</option>
                  {listeClasses.map((item) => <option key={item.id} value={item.id}>{libelleClasse(item)}</option>)}
                </Selecteur>
                <Selecteur
                  label="Dernière classe"
                  value={config.derniereClasseId}
                  disabled={indexPremiere < 0}
                  onChange={(event) => {
                    if (!event.target.value) {
                      majCycle({
                        saute: false,
                        premiereClasseId: "",
                        derniereClasseId: "",
                        classeIds: [],
                      });
                      return;
                    }
                    const fin = listeClasses.findIndex((item) => String(item.id) === event.target.value);
                    const classeIds = listeClasses
                      .slice(indexPremiere, fin + 1)
                      .map((item) => String(item.id));
                    majCycle({
                      derniereClasseId: event.target.value,
                      classeIds,
                    });
                  }}
                >
                  <option value="">Choisir...</option>
                  {listeClasses.slice(Math.max(indexPremiere, 0)).map((item) => (
                    <option key={item.id} value={item.id}>{libelleClasse(item)}</option>
                  ))}
                </Selecteur>
              </div>
              <Champ
                label="Année d'arrivée dans ce cycle"
                type="number"
                min={1950}
                max={ANNEE_COURANTE}
                value={config.anneeArrivee || anneeAuto || ""}
                onChange={(event) => majCycle({ anneeArrivee: event.target.value })}
              />
              {anneeAuto && !config.anneeArrivee && (
                <p className="doux" style={{ margin: ".2rem 0" }}>
                  Année proposée d'après le cycle précédent : {anneeAuto}. Vous pouvez la modifier.
                </p>
              )}
              <button
                type="button"
                onClick={cocherJusquaDerniere}
                disabled={!listeClasses.length}
                style={{
                  width: "100%", minHeight: "2.7rem", borderRadius: ".7rem",
                  border: `1px solid ${config.premiereClasseId && config.derniereClasseId ? couleurCycle : "#9aa9c8"}`,
                  color: config.premiereClasseId && config.derniereClasseId ? "#fff" : couleurCycle,
                  background: config.premiereClasseId && config.derniereClasseId ? couleurCycle : "#fff",
                  fontWeight: 600, cursor: "pointer",
                }}
              >
                {selectionClasses.length === listeClasses.length && listeClasses.length
                  ? "Désélectionner toutes les classes"
                  : "Sélectionner toutes les classes"}
              </button>
              <p className="doux" style={{ margin: ".35rem 0" }}>
                Une classe décochée entre deux classes suivies représente un saut de classe; son année
                est comptée dans le calendrier.
              </p>
              {listeClasses.map((item) => {
                const retenue = idsClassesSelectionnees.has(String(item.id));
                const duree = Number(config.durees?.[item.id] ?? 1);
                return (
                  <article
                    key={item.id}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      gap: ".5rem", minHeight: "3.15rem", padding: ".4rem .7rem",
                      marginTop: ".4rem", borderRadius: ".8rem",
                      border: `1px solid ${retenue ? couleurCycle : "#e3e9f5"}`,
                      background: retenue ? "#f1f4fa" : "#fff",
                      color: retenue ? couleurCycle : "var(--texte-doux)",
                    }}
                  >
                    <span style={{ fontWeight: retenue ? 600 : 500, display: "flex", alignItems: "center", gap: ".4rem", minWidth: 0 }}>
                      <input
                        type="checkbox"
                        checked={retenue}
                        aria-label={`Inclure ${libelleClasse(item)} dans mon parcours`}
                        onChange={(event) => choisirSelectionClasse(item.id, event.target.checked)}
                      />
                      <span>{libelleClasse(item)}</span>
                      {retenue && duree === 2 && (
                        <span style={{ padding: ".1rem .35rem", borderRadius: ".6rem", background: couleurCycle, color: "#fff", fontSize: ".65rem" }}>
                          Redoublé
                        </span>
                      )}
                    </span>
                    {retenue && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: ".45rem", flexShrink: 0 }}>
                        <small className="doux">
                          {cycleCalcule?.classes.find((classe) => String(classe.id) === String(item.id))?.anneeDebut ?? "—"}
                          –
                          {cycleCalcule?.classes.find((classe) => String(classe.id) === String(item.id))?.anneeFin
                            ?? (donnees.toujoursAEcole && String(item.id) === String(selectionClasses.at(-1)?.id)
                              ? "en cours"
                              : "—")}
                        </small>
                        <button
                          type="button"
                          aria-label={`Retirer une année à ${libelleClasse(item)}`}
                          disabled={duree <= 1}
                          onClick={() => majCycle({ durees: { ...config.durees, [item.id]: 1 } })}
                          style={{
                            width: "2rem", height: "2rem", borderRadius: "50%",
                            border: `1px solid ${couleurCycle}`, background: "#fff", color: couleurCycle,
                            fontSize: "1.15rem", cursor: duree <= 1 ? "not-allowed" : "pointer",
                          }}
                        >−</button>
                        <span style={{ minWidth: "2.4rem", textAlign: "center", fontSize: ".85rem" }}>
                          {duree}<small style={{ display: "block", color: "var(--texte-doux)", fontSize: ".65rem" }}>
                            {duree > 1 ? "ans" : "an"}
                          </small>
                        </span>
                        <button
                          type="button"
                          aria-label={`Ajouter une année à ${libelleClasse(item)}`}
                          disabled={duree >= 2}
                          onClick={() => majCycle({ durees: { ...config.durees, [item.id]: 2 } })}
                          style={{
                            width: "2rem", height: "2rem", borderRadius: "50%",
                            border: `1px solid ${couleurCycle}`, background: "#fff", color: couleurCycle,
                            fontSize: "1.15rem", cursor: duree >= 2 ? "not-allowed" : "pointer",
                          }}
                        >+</button>
                      </span>
                    )}
                  </article>
                );
              })}
              <div style={{ ...stylePanneau, display: "grid", gap: ".45rem", marginTop: ".75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem" }}>
                  <span>Année de début</span>
                  <strong>{cycleCalcule?.anneeDebut ?? "—"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem" }}>
                  <span>Année de fin</span>
                  <strong>{cycleCalcule?.anneeFin ?? (cycleCalcule?.anneeDebut ? "En cours" : "—")}</strong>
                </div>
              </div>
            </>
          )}
          {config.saute && <p className="doux">Ce cycle sera ignoré dans votre parcours.</p>}
          {erreur && <p role="alert" className="erreur">{erreur}</p>}
          <div style={{ display: "grid", gap: ".65rem", marginTop: "1.25rem" }}>
            <Bouton type="button" onClick={avancerCycle} style={{ background: couleurCycle }}>
              Cycle suivant →
            </Bouton>
            {!config.saute ? (
              <button type="button" className="lien" onClick={passerCycle} style={{ justifySelf: "center" }}>
                Passer ce cycle
              </button>
            ) : (
              <button type="button" className="lien" onClick={() => majCycle({ saute: false })} style={{ justifySelf: "center" }}>
                Saisir ce cycle
              </button>
            )}
            {indexCycle === 0
              ? <button type="button" className="lien" onClick={revenir} style={{ justifySelf: "center" }}>Retour</button>
              : <button type="button" className="lien" onClick={() => setIndexCycle((index) => index - 1)} style={{ justifySelf: "center" }}>Cycle précédent</button>}
          </div>
        </>
      ) : (
        <>
          <h1 style={{ marginTop: 0, fontSize: "1.3rem" }}>Résumé de votre parcours</h1>
          <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", margin: "1rem 0" }}>
            <input type="checkbox" checked={donnees.toujoursAEcole}
              onChange={(event) => setDonnees((actuel) => ({ ...actuel, toujoursAEcole: event.target.checked }))} />
            Je suis toujours à l'école
          </label>
          <div style={{ display: "grid", gap: "0.65rem" }}>
            {parcours.map((item) => (
              <div key={item.id} style={{ padding: "0.7rem", border: "1px solid var(--bordure)", borderRadius: "0.65rem" }}>
                <strong>{item.nom}</strong>
                {item.saute ? <span className="doux"> · non suivi</span> : (
                  <div className="doux">
                    {item.classes.map((classe) => (
                      <div key={classe.id}>
                        {libelleClasse(classe)} · {classe.anneeDebut}–{classe.anneeFin ?? `${ANNEE_COURANTE}-${ANNEE_COURANTE + 1} (en cours)`}
                      </div>
                    ))}
                  </div>
                )}
                {item.anneeDebut && <small className="doux">Cycle : {item.anneeDebut}–{item.anneeFin ?? "en cours"}</small>}
              </div>
            ))}
          </div>
          {erreur && <p role="alert" className="erreur">{erreur}</p>}
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <Bouton type="button" secondaire onClick={() => setIndexCycle(Math.max(cycles.length - 1, 0))}>Retour</Bouton>
            <Bouton type="button" chargement={valider.isPending} onClick={validerEtape}>Valider mon parcours</Bouton>
          </div>
        </>
      )}
      {sauverBrouillon.isError && (
        <p role="alert" className="erreur">Le brouillon n'a pas pu être sauvegardé. Vérifiez votre connexion.</p>
      )}
    </section>
  );
}
