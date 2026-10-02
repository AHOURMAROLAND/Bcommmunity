import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  useAjouterScolarite, useMajProfil, useMajSituation, useProfil,
  useReferentiels, useRetirerScolarite,
} from "../api/hooks";
import { Bouton, Champ, Chargement, Marque, Selecteur } from "../components/ui";
import { erreursChamps, tousMessages } from "../api/erreurs";

const ANNEE_MAX = new Date().getFullYear() + 1;
const num = (v) => (v === "" || v == null ? null : Number(v));

export default function Onboarding() {
  const { utilisateur } = useAuth();
  const ancien = utilisateur.statut === "ancien";
  const total = ancien ? 3 : 2;
  const [etape, setEtape] = useState(1);
  const profil = useProfil();
  const maj = useMajProfil();
  const navigate = useNavigate();

  if (profil.isPending) return <Chargement />;
  if (profil.data?.onboarding_termine) return <Navigate to="/fil" replace />;

  async function terminer(extra = {}) {
    await maj.mutateAsync({ onboarding_termine: true, ...extra });
    navigate("/fil", { replace: true });
  }

  return (
    <main className="page"><div className="boite">
      <Marque />
      <p className="doux" style={{ textAlign: "center" }}>Étape {etape} sur {total}</p>
      <div className="carte">
        {etape === 1 && <Etape1 profil={profil.data} onSuivant={() => setEtape(2)} />}
        {etape === 2 && (
          <Etape2 profil={profil.data} onRetour={() => setEtape(1)}
            onSuivant={() => (ancien ? setEtape(3) : terminer())} dernier={!ancien} />
        )}
        {etape === 3 && <Etape3 profil={profil.data} onRetour={() => setEtape(2)} onTerminer={terminer} />}
      </div>
    </div></main>
  );
}

function Etape1({ profil, onSuivant }) {
  const maj = useMajProfil();
  const [bio, setBio] = useState(profil?.bio ?? "");
  const [ville, setVille] = useState(profil?.ville ?? "");
  const [erreur, setErreur] = useState("");

  async function valider(e) {
    e.preventDefault();
    setErreur("");
    try { await maj.mutateAsync({ bio: bio.trim(), ville: ville.trim() }); onSuivant(); }
    catch (err) { setErreur(tousMessages(err)); }
  }

  return (
    <form onSubmit={valider}>
      <h1 style={{ marginTop: 0, fontSize: "1.3rem" }}>Parlez-nous de vous</h1>
      <Champ label="Ville" autoComplete="address-level2" maxLength={100} value={ville} onChange={(e) => setVille(e.target.value)} />
      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="bio" style={{ display: "block", marginBottom: "0.3rem", fontWeight: 600 }}>Présentation</label>
        <textarea id="bio" className="champ" rows={4} maxLength={500} value={bio} onChange={(e) => setBio(e.target.value)} />
        <span className="doux" style={{ fontSize: "0.8rem" }}>{bio.length} / 500</span>
      </div>
      {erreur && <p role="alert" className="erreur" style={{ marginBottom: "1rem" }}>{erreur}</p>}
      <Bouton type="submit" chargement={maj.isPending}>Suivant</Bouton>
    </form>
  );
}

function Etape2({ profil, onSuivant, onRetour, dernier }) {
  const ref = useReferentiels();
  const ajouter = useAjouterScolarite();
  const retirer = useRetirerScolarite();
  const [cycleId, setCycleId] = useState("");
  const [classeId, setClasseId] = useState("");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [erreur, setErreur] = useState("");
  const [fini, setFini] = useState(false);

  const cycles = ref.data?.cycles ?? [];
  const classes = cycles.find((c) => String(c.id) === cycleId)?.classes ?? [];
  const lignes = profil?.scolarites ?? [];

  async function ajouterLigne(e) {
    e.preventDefault();
    setErreur("");
    if (!classeId || !debut || !fin) { setErreur("Choisissez un cycle, une classe et les années."); return; }
    try {
      await ajouter.mutateAsync({ classe: Number(classeId), annee_debut: Number(debut), annee_fin: Number(fin) });
      setClasseId(""); setDebut(""); setFin("");
    } catch (err) { setErreur(tousMessages(err)); }
  }

  async function suivant() {
    setFini(true);
    try { await onSuivant(); } catch (err) { setErreur(tousMessages(err)); setFini(false); }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0, fontSize: "1.3rem" }}>Votre parcours dans l'école</h1>
      <p className="doux">Ajoutez les classes que vous avez faites. Elles servent à retrouver vos camarades.</p>

      {lignes.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1rem" }}>
          {lignes.map((l) => (
            <li key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid var(--bordure)" }}>
              <span>
                <strong>{l.classe_detail.nom} {l.classe_detail.filiere}</strong>{" "}
                <span className="doux">{l.classe_detail.cycle}, {l.annee_debut} - {l.annee_fin}</span>
              </span>
              <button type="button" className="lien" style={{ background: "none", border: 0, cursor: "pointer", font: "inherit" }}
                disabled={retirer.isPending} onClick={() => retirer.mutate(l.id)}
                aria-label={`Retirer ${l.classe_detail.nom}`}>Retirer</button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={ajouterLigne}>
        <Selecteur label="Cycle" value={cycleId} onChange={(e) => { setCycleId(e.target.value); setClasseId(""); }}>
          <option value="">Choisir...</option>
          {cycles.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </Selecteur>
        <Selecteur label="Classe" value={classeId} disabled={!cycleId} onChange={(e) => setClasseId(e.target.value)}>
          <option value="">Choisir...</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{`${c.nom} ${c.filiere}`.trim()}</option>)}
        </Selecteur>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <div style={{ flex: 1 }}><Champ label="Année de début" type="number" inputMode="numeric" min={1950} max={ANNEE_MAX} value={debut} onChange={(e) => setDebut(e.target.value)} /></div>
          <div style={{ flex: 1 }}><Champ label="Année de fin" type="number" inputMode="numeric" min={1950} max={ANNEE_MAX} value={fin} onChange={(e) => setFin(e.target.value)} /></div>
        </div>
        {erreur && <p role="alert" className="erreur" style={{ marginBottom: "1rem" }}>{erreur}</p>}
        <Bouton type="submit" secondaire chargement={ajouter.isPending}>Ajouter cette classe</Bouton>
      </form>

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
        <Bouton type="button" secondaire onClick={onRetour}>Retour</Bouton>
        <Bouton type="button" chargement={fini} onClick={suivant}>{dernier ? "Terminer" : "Suivant"}</Bouton>
      </div>
    </div>
  );
}

const TYPES = [
  { id: "emploi", titre: "J'ai un emploi" },
  { id: "etudes", titre: "Je suis en études ou en formation" },
  { id: "recherche", titre: "Je cherche un emploi" },
  { id: "autre", titre: "Autre / je préfère ne pas dire" },
];

function Etape3({ profil, onRetour, onTerminer }) {
  const ref = useReferentiels();
  const majSituation = useMajSituation();
  const s = profil?.situation;
  const [anneeSortie, setAnneeSortie] = useState(profil?.annee_sortie ?? "");
  const [type, setType] = useState(s?.type ?? "autre");
  const [d, setD] = useState({
    poste: s?.poste ?? "", entreprise: s?.entreprise ?? "", secteur: s?.secteur ?? "",
    ville_emploi: s?.ville_emploi ?? "", depuis: s?.depuis ?? "", independant: s?.independant ?? false,
    type_formation: s?.type_formation ?? "", etablissement: s?.etablissement ?? "", faculte: s?.faculte ?? "",
    domaine: s?.domaine ?? "", diplome: s?.diplome ?? "", niveau: s?.niveau ?? "",
    annee_debut: s?.annee_debut ?? "", annee_fin_prevue: s?.annee_fin_prevue ?? "", lieu_etudes: s?.lieu_etudes ?? "",
    objectif: s?.objectif ?? "",
  });
  const [erreurs, setErreurs] = useState({});
  const [general, setGeneral] = useState("");
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => { setErreurs({}); }, [type]);
  const m = (champ) => (e) => setD((v) => ({ ...v, [champ]: e.target.value }));
  const domaines = ref.data?.domaines ?? [];

  function charge() {
    if (type === "emploi") {
      return { type, poste: d.poste.trim(), entreprise: d.entreprise.trim(), secteur: d.secteur.trim(),
               ville_emploi: d.ville_emploi.trim(), depuis: num(d.depuis), independant: d.independant };
    }
    if (type === "etudes") {
      return { type, type_formation: d.type_formation, etablissement: d.etablissement.trim(),
               faculte: d.faculte.trim(), domaine: num(d.domaine), diplome: d.diplome.trim(),
               niveau: d.niveau.trim(), annee_debut: num(d.annee_debut),
               annee_fin_prevue: num(d.annee_fin_prevue), lieu_etudes: d.lieu_etudes.trim() };
    }
    if (type === "recherche") return { type, objectif: d.objectif, domaine: num(d.domaine) };
    return { type };
  }

  async function terminer(e) {
    e.preventDefault();
    if (envoi) return;
    setEnvoi(true); setErreurs({}); setGeneral("");
    try {
      await majSituation.mutateAsync(charge());
      await onTerminer(anneeSortie ? { annee_sortie: Number(anneeSortie) } : {});
    } catch (err) {
      const champs = erreursChamps(err);
      setErreurs(champs);
      if (!Object.keys(champs).length) setGeneral(tousMessages(err));
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={terminer}>
      <h1 style={{ marginTop: 0, fontSize: "1.3rem" }}>Votre situation actuelle</h1>
      <Champ label="Année de sortie de l'école" type="number" inputMode="numeric" min={1950} max={ANNEE_MAX}
        value={anneeSortie} onChange={(e) => setAnneeSortie(e.target.value)} erreur={erreurs.annee_sortie} />

      <div role="group" aria-label="Situation" style={{ display: "grid", gap: "0.5rem", marginBottom: "1rem" }}>
        {TYPES.map((t) => (
          <button key={t.id} type="button" className="choix" aria-pressed={type === t.id} onClick={() => setType(t.id)}>
            {t.titre}
          </button>
        ))}
      </div>

      {type === "emploi" && (<>
        <Champ label="Poste" value={d.poste} onChange={m("poste")} erreur={erreurs.poste} maxLength={120} />
        <Champ label="Entreprise" value={d.entreprise} onChange={m("entreprise")} maxLength={120} />
        <Champ label="Secteur" value={d.secteur} onChange={m("secteur")} maxLength={120} />
        <Champ label="Ville" value={d.ville_emploi} onChange={m("ville_emploi")} maxLength={100} />
        <Champ label="Depuis (année)" type="number" inputMode="numeric" min={1950} max={ANNEE_MAX} value={d.depuis} onChange={m("depuis")} />
        <label style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <input type="checkbox" checked={d.independant} onChange={(e) => setD((v) => ({ ...v, independant: e.target.checked }))} />
          <span>Indépendant ou entrepreneur</span>
        </label>
      </>)}

      {type === "etudes" && (<>
        <Selecteur label="Type de formation" value={d.type_formation} onChange={m("type_formation")} erreur={erreurs.type_formation}>
          <option value="">Choisir...</option>
          <option value="universite">Université</option>
          <option value="ecole">École supérieure</option>
          <option value="professionnelle">Formation professionnelle</option>
          <option value="autre">Autre</option>
        </Selecteur>
        <Champ label={d.type_formation === "universite" ? "Université" : "Établissement"} value={d.etablissement}
          onChange={m("etablissement")} erreur={erreurs.etablissement} maxLength={160} />
        {d.type_formation === "universite" && (
          <Champ label="Faculté" value={d.faculte} onChange={m("faculte")} erreur={erreurs.faculte} maxLength={160} />
        )}
        <Selecteur label="Domaine" value={d.domaine} onChange={m("domaine")} erreur={erreurs.domaine}>
          <option value="">Choisir...</option>
          {domaines.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
        </Selecteur>
        <Champ label="Diplôme préparé" value={d.diplome} onChange={m("diplome")} erreur={erreurs.diplome} maxLength={120} />
        <Champ label="Niveau" value={d.niveau} onChange={m("niveau")} maxLength={60} />
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <div style={{ flex: 1 }}><Champ label="Début" type="number" inputMode="numeric" min={1950} max={ANNEE_MAX} value={d.annee_debut} onChange={m("annee_debut")} /></div>
          <div style={{ flex: 1 }}><Champ label="Fin prévue" type="number" inputMode="numeric" min={1950} max={ANNEE_MAX + 10} value={d.annee_fin_prevue} onChange={m("annee_fin_prevue")} /></div>
        </div>
        <Champ label="Ville ou pays" value={d.lieu_etudes} onChange={m("lieu_etudes")} maxLength={120} />
      </>)}

      {type === "recherche" && (<>
        <Selecteur label="Je cherche" value={d.objectif} onChange={m("objectif")}>
          <option value="">Choisir...</option>
          <option value="emploi">Un emploi</option>
          <option value="stage">Un stage</option>
          <option value="formation">Une formation</option>
        </Selecteur>
        <Selecteur label="Domaine souhaité (facultatif)" value={d.domaine} onChange={m("domaine")}>
          <option value="">Aucun</option>
          {domaines.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
        </Selecteur>
      </>)}

      {general && <p role="alert" className="erreur" style={{ marginBottom: "1rem" }}>{general}</p>}
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Bouton type="button" secondaire onClick={onRetour}>Retour</Bouton>
        <Bouton type="submit" chargement={envoi}>Terminer</Bouton>
      </div>
    </form>
  );
}
