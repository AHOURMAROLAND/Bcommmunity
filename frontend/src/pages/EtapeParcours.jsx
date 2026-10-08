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
  return { saute: false, premiereClasseId: "", derniereClasseId: "", anneeArrivee: "", durees: {} };
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
      return calculerParcours(definitions, { toujoursALEcole: donnees.toujoursAEcole });
    } catch {
      return [];
    }
  }, [cycles, donnees]);

  const anneeCyclePrecedent = useMemo(() => {
    if (!donnees || indexCycle === 0) return null;
    try {
      const definitions = cycles.slice(0, indexCycle).map((cycle) => ({
        ...donnees.cycles[cycle.id],
        id: cycle.id,
        nom: cycle.nom,
        classes: classesDuCycle(cycle, donnees.filiereId),
      }));
      return calculerParcours(definitions).at(-1)?.anneeFin ?? null;
    } catch {
      return null;
    }
  }, [cycles, donnees, indexCycle]);

  if (referentiels.isPending || brouillon.isPending || !donnees) return <SqFormulaire champs={5} />;
  if (referentiels.isError || brouillon.isError) {
    return <p role="alert" className="erreur">Impossible de charger votre parcours scolaire. Réessayez.</p>;
  }

  const cycle = cycles[indexCycle];
  const config = cycle ? donnees.cycles[cycle.id] : null;
  const listeClasses = cycle ? classesDuCycle(cycle, donnees.filiereId) : [];
  const indexPremiere = listeClasses.findIndex((classe) => String(classe.id) === String(config?.premiereClasseId));
  const indexDerniere = listeClasses.findIndex((classe) => String(classe.id) === String(config?.derniereClasseId));
  const cycleCalcule = parcours.find((item) => String(item.id) === String(cycle?.id));
  const precedent = cycles[indexCycle - 1];
  const precedentSaute = precedent && donnees.cycles[precedent.id]?.saute;
  const anneeAuto = anneeCyclePrecedent ?? cycleCalcule?.anneeDebut;
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
    const debut = listeClasses.findIndex((classe) => String(classe.id) === String(config.premiereClasseId));
    const fin = listeClasses.findIndex((classe) => String(classe.id) === String(config.derniereClasseId));
    if (debut < 0 || fin < debut) return null;
    const arrival = anneeAuto ?? Number(config.anneeArrivee);
    if (!Number.isInteger(arrival) || arrival < 1950 || arrival > ANNEE_COURANTE) return null;
    return { debut, fin, arrival };
  }

  async function terminerParcours() {
    setErreur("");
    const donneesValides = cycles.map((item) => {
      const choix = donnees.cycles[item.id] ?? configVide();
      if (choix.saute) return { cycle_id: item.id, saute: true };
      const trouve = parcours.find((resultat) => String(resultat.id) === String(item.id));
      if (!trouve || !choix.premiereClasseId || !choix.derniereClasseId) {
        throw new Error(`Complétez le parcours ${item.nom} ou indiquez que vous n'avez pas fait ce cycle.`);
      }
      return {
        cycle_id: item.id,
        premiere_classe_id: Number(choix.premiereClasseId),
        derniere_classe_id: Number(choix.derniereClasseId),
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
    const first = indexPremiere < 0 ? listeClasses[0].id : config.premiereClasseId;
    majCycle({
      saute: false,
      premiereClasseId: String(first),
      derniereClasseId: String(listeClasses.at(-1).id),
    });
  }

  async function validerEtape() {
    try {
      await terminerParcours();
    } catch (cause) {
      setErreur(tousMessages(cause));
    }
  }

  return (
    <section>
      <p className="doux" style={{ textAlign: "center", marginTop: 0 }}>
        Parcours scolaire · {Math.min(indexCycle + 1, cycles.length + 1)} / {cycles.length + 1}
      </p>
      {indexCycle < cycles.length ? (
        <>
          <h1 style={{ marginTop: 0, fontSize: "1.3rem" }}>{cycle.nom}</h1>
          {estLycee(cycle) && (
            <>
              <Selecteur
                label="Type de lycée"
                value={donnees.typeLycee}
                onChange={(event) => setDonnees((actuel) => ({
                  ...actuel,
                  typeLycee: event.target.value,
                  filiereId: "",
                  cycles: {
                    ...actuel.cycles,
                    [cycle.id]: { ...actuel.cycles[cycle.id], premiereClasseId: "", derniereClasseId: "" },
                  },
                }))}
              >
                <option value="">Choisir...</option>
                <option value="moderne">Lycée moderne</option>
                <option value="technique">Lycée technique</option>
              </Selecteur>
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
            </>
          )}

          {!config.saute && (
            <>
              <Selecteur
                label="Ma première classe dans ce cycle"
                value={config.premiereClasseId}
                disabled={!listeClasses.length}
                onChange={(event) => {
                  const premiere = event.target.value;
                  const premiereIndex = listeClasses.findIndex((item) => String(item.id) === premiere);
                  const derniereValide = listeClasses.findIndex((item) => String(item.id) === String(config.derniereClasseId)) >= premiereIndex;
                  majCycle({
                    saute: false,
                    premiereClasseId: premiere,
                    derniereClasseId: derniereValide ? config.derniereClasseId : premiere,
                  });
                }}
              >
                <option value="">Choisir...</option>
                {listeClasses.map((item) => <option key={item.id} value={item.id}>{libelleClasse(item)}</option>)}
              </Selecteur>
              <Selecteur
                label="Ma dernière classe dans ce cycle"
                value={config.derniereClasseId}
                disabled={indexPremiere < 0}
                onChange={(event) => majCycle({ derniereClasseId: event.target.value })}
              >
                <option value="">Choisir...</option>
                {listeClasses.slice(Math.max(indexPremiere, 0)).map((item) => (
                  <option key={item.id} value={item.id}>{libelleClasse(item)}</option>
                ))}
              </Selecteur>
              {anneeAuto && !precedentSaute ? (
                <p className="doux">Début proposé automatiquement : {anneeAuto}</p>
              ) : (
                <Champ
                  label="Année d'arrivée"
                  type="number"
                  min={1950}
                  max={ANNEE_COURANTE}
                  value={config.anneeArrivee}
                  onChange={(event) => majCycle({ anneeArrivee: event.target.value })}
                />
              )}
              <button type="button" className="lien" onClick={cocherJusquaDerniere}>
                Tout cocher jusqu'à ma dernière classe
              </button>
              {listeClasses.map((item, index) => {
                const grise = indexPremiere >= 0 && index < indexPremiere;
                const retenue = index >= indexPremiere && index <= indexDerniere;
                if (grise || !retenue) {
                  return (
                    <div key={item.id} aria-disabled={grise} style={{
                      padding: "0.55rem 0.7rem",
                      marginTop: "0.35rem",
                      borderRadius: "0.6rem",
                      background: grise ? "var(--fond)" : "transparent",
                      color: grise ? "var(--texte-doux)" : "var(--texte)",
                      opacity: grise ? 0.55 : 1,
                    }}>
                      {libelleClasse(item)}{grise ? " · avant mon arrivée" : ""}
                    </div>
                  );
                }
                const duree = Number(config.durees[item.id] ?? 1);
                return (
                  <div key={item.id} style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.55rem 0.7rem",
                    marginTop: "0.35rem",
                    border: "1px solid var(--bordure)",
                    borderRadius: "0.6rem",
                  }}>
                    <span>{libelleClasse(item)}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.55rem" }}>
                      <button type="button" className="lien" aria-label={`Retirer une année à ${libelleClasse(item)}`}
                        disabled={duree <= 1}
                        onClick={() => majCycle({ durees: { ...config.durees, [item.id]: 1 } })}>−</button>
                      <span>{duree} an{duree > 1 ? "s" : ""}{duree === 2 ? " · redoublée" : ""}</span>
                      <button type="button" className="lien" aria-label={`Ajouter une année à ${libelleClasse(item)}`}
                        disabled={duree >= 2}
                        onClick={() => majCycle({ durees: { ...config.durees, [item.id]: 2 } })}>+</button>
                    </span>
                  </div>
                );
              })}
            </>
          )}
          {config.saute && <p className="doux">Ce cycle sera ignoré dans votre parcours.</p>}
          {erreur && <p role="alert" className="erreur">{erreur}</p>}
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            {indexCycle === 0
              ? <Bouton type="button" secondaire onClick={revenir}>Retour</Bouton>
              : <Bouton type="button" secondaire onClick={() => setIndexCycle((index) => index - 1)}>Retour</Bouton>}
            {!config.saute && <Bouton type="button" secondaire onClick={passerCycle}>Je n'ai pas fait ce cycle</Bouton>}
            {config.saute && <Bouton type="button" secondaire onClick={() => majCycle({ saute: false })}>Saisir ce cycle</Bouton>}
            <Bouton type="button" onClick={avancerCycle}>Suivant</Bouton>
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
