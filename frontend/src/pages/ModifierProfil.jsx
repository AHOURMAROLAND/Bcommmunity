import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useChangerPhoto } from "../api/publications";
import { useMajProfil, useProfil } from "../api/hooks";
import { tousMessages } from "../api/erreurs";
import { COTE_AVATAR, TYPES_IMAGE, verifierFichier } from "../utils/image";
import Avatar from "../components/Avatar";
import RecadrageImage from "../components/RecadrageImage";
import { Bouton, Champ, Selecteur } from "../components/ui";
import { SqFormulaire } from "../components/Squelettes";
import ChargementLong from "@/components/ChargementLong";
import { Etape2, Etape3 } from "./Onboarding";

const VISIBILITES = [["tous", "Tout le monde"], ["amis", "Mes amis"], ["personne", "Personne"]];

export default function ModifierProfil() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const profil = useProfil();
  const maj = useMajProfil();
  const photo = useChangerPhoto();
  const [section, setSection] = useState(params.get("section"));
  const [aRecadrer, setARecadrer] = useState(null);
  const [erreur, setErreur] = useState("");
  const [bio, setBio] = useState(null);
  const [ville, setVille] = useState(null);
  const [vis, setVis] = useState({});

  if (profil.isPending) return <SqFormulaire />;
  const p = profil.data;
  const ancien = p.statut === "ancien";
  const retour = () => (section ? setSection(null) : navigate("/profil"));

  async function sauver(e) {
    e.preventDefault();
    setErreur("");
    try {
      await maj.mutateAsync({ ...(bio !== null && { bio: bio.trim() }), ...(ville !== null && { ville: ville.trim() }), ...vis });
      navigate("/profil");
    } catch (err) { setErreur(tousMessages(err)); }
  }

  function choisirPhoto(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const probleme = verifierFichier(f);
    if (probleme) { setErreur(probleme); return; }
    setErreur("");
    setARecadrer(f);
  }

  async function envoyerPhoto(fichier) {
    setARecadrer(null);
    try { await photo.envoyer.mutateAsync(fichier); } catch (err) { setErreur(tousMessages(err)); }
  }

  return (
    <div>
      {aRecadrer && (
        <RecadrageImage fichier={aRecadrer} rond coteMax={COTE_AVATAR} titre="Recadrer la photo de profil"
          ratios={[{ id: "1-1", label: "Carré", valeur: 1 }]} ratioDefaut="1-1"
          onValider={envoyerPhoto} onAnnuler={() => setARecadrer(null)} />
      )}

      <button className="puce" onClick={retour} style={{ marginBottom: "0.75rem" }}><ArrowLeft size={18} /> Retour</button>

      {section === "parcours" && (
        <div className="carte"><Etape2 profil={p} dernier onRetour={() => setSection(null)} onSuivant={() => setSection(null)} /></div>
      )}
      {section === "situation" && ancien && (
        <div className="carte">
          <Etape3 profil={p} onRetour={() => setSection(null)}
            onTerminer={async (extra) => { if (extra.annee_sortie) await maj.mutateAsync(extra); navigate("/profil"); }} />
        </div>
      )}

      {!section && (
        <>
          <h1 style={{ marginTop: 0 }}>Modifier le profil</h1>
          <ChargementLong actif={photo.envoyer.isPending || maj.isPending} label="Enregistrement..." />
          <div className="carte" style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1rem" }}>
            <Avatar prenom={p.prenom} nom={p.nom} photo={p.photo_mini ?? p.photo} taille={72} />
            <div style={{ display: "grid", gap: "0.5rem", flex: 1 }}>
              <label className="btn btn-sec" style={{ cursor: "pointer" }}>
                {photo.envoyer.isPending ? "Envoi..." : "Changer la photo"}
                <input type="file" accept={TYPES_IMAGE.join(",")} onChange={choisirPhoto} style={{ display: "none" }} />
              </label>
              {p.photo && <Bouton secondaire chargement={photo.retirer.isPending} onClick={() => photo.retirer.mutate()}>Retirer la photo</Bouton>}
            </div>
          </div>

          <form onSubmit={sauver}>
            <Champ label="Ville" maxLength={100} value={ville ?? p.ville} onChange={(e) => setVille(e.target.value)} />
            <div style={{ marginBottom: "1rem" }}>
              <label htmlFor="bio" style={{ display: "block", marginBottom: "0.3rem", fontWeight: 600 }}>Présentation</label>
              <textarea id="bio" className="champ" rows={4} maxLength={500} value={bio ?? p.bio} onChange={(e) => setBio(e.target.value)} />
            </div>
            <h2 style={{ fontSize: "1.05rem" }}>Confidentialité</h2>
            {[["visibilite_profil", "Qui peut voir mon profil"], ["visibilite_parcours", "Qui peut voir mon parcours scolaire"],
              ["visibilite_situation", "Qui peut voir ma situation actuelle"], ["qui_peut_inviter", "Qui peut m'inviter à discuter"]].map(([k, l]) => (
              <Selecteur key={k} label={l} value={vis[k] ?? p[k]} onChange={(e) => setVis((v) => ({ ...v, [k]: e.target.value }))}>
                {VISIBILITES.map(([val, lib]) => <option key={val} value={val}>{lib}</option>)}
              </Selecteur>
            ))}
            {erreur && <p role="alert" className="erreur" style={{ marginBottom: "1rem" }}>{erreur}</p>}
            <Bouton type="submit" chargement={maj.isPending}>Enregistrer</Bouton>
          </form>

          <div style={{ display: "grid", gap: "0.5rem", marginTop: "1rem" }}>
            <Bouton secondaire onClick={() => setSection("parcours")}>Modifier mon parcours scolaire</Bouton>
            {ancien && <Bouton secondaire onClick={() => setSection("situation")}>Modifier ma situation actuelle</Bouton>}
          </div>
        </>
      )}
    </div>
  );
}
