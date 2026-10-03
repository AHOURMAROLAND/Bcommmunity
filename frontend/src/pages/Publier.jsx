import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Crop, Globe, ImageIcon, X } from "lucide-react";
import { useEnregistrerPublication, usePublication } from "../api/publications";
import { erreursChamps, tousMessages } from "../api/erreurs";
import { COTE_PUBLICATION, TYPES_IMAGE, verifierFichier } from "../utils/image";
import Editeur from "../components/Editeur";
import RecadrageImage from "../components/RecadrageImage";
import { Bouton } from "../components/ui";
import { SqEditeur } from "../components/Squelettes";

export default function Publier() {
  const { id } = useParams();
  const existante = usePublication(id, !!id);
  if (id && existante.isPending) return <SqEditeur />;
  if (id && existante.isError) return <p role="alert" className="erreur">Publication introuvable.</p>;
  return <Formulaire id={id} pub={existante.data} />;
}

function Formulaire({ id, pub }) {
  const navigate = useNavigate();
  const enregistrer = useEnregistrerPublication(id);
  const [titre, setTitre] = useState(pub?.titre ?? "");
  const [html, setHtml] = useState(pub?.contenu ?? "");
  const [longueur, setLongueur] = useState(pub ? 1 : 0);
  const [apercu, setApercu] = useState(pub?.apercu_public ?? true);
  const [original, setOriginal] = useState(null); // fichier choisi, avant recadrage
  const [image, setImage] = useState(null); // fichier recadré, prêt à envoyer
  const [recadrage, setRecadrage] = useState(false);
  const [supprimer, setSupprimer] = useState(false);
  const [erreurs, setErreurs] = useState({});
  const [general, setGeneral] = useState("");
  const [fini, setFini] = useState(false);

  const urlLocale = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => urlLocale && URL.revokeObjectURL(urlLocale), [urlLocale]);
  const imageAffichee = urlLocale ?? (!supprimer ? (pub?.image?.moyenne ?? pub?.image?.src) : null);
  const dejaPublie = pub?.statut === "publie";

  function choisir(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const probleme = verifierFichier(f);
    if (probleme) { setErreurs({ image: probleme }); return; }
    setErreurs({});
    setOriginal(f);
    setRecadrage(true);
  }

  function recadree(fichier) {
    setImage(fichier);
    setSupprimer(false);
    setRecadrage(false);
  }

  function annulerRecadrage() {
    setRecadrage(false);
    if (!image) setOriginal(null);
  }

  async function envoyer(statut) {
    if (enregistrer.isPending) return;
    setErreurs({}); setGeneral("");
    if (titre.trim().length < 3) { setErreurs({ titre: "Le titre doit contenir au moins 3 caractères." }); return; }
    if (statut === "publie" && longueur === 0) { setErreurs({ contenu: "Écrivez du contenu avant de publier." }); return; }
    const fd = new FormData();
    fd.append("titre", titre.trim());
    fd.append("contenu", html);
    fd.append("statut", statut);
    fd.append("apercu_public", apercu ? "true" : "false");
    if (image) fd.append("image", image);
    if (supprimer && !image) fd.append("supprimer_image", "true");
    try {
      const r = await enregistrer.mutateAsync(fd);
      setFini(true);
      navigate(statut === "publie" ? `/publications/${r.id}` : "/profil", { replace: true });
    } catch (err) {
      const champs = erreursChamps(err);
      setErreurs(champs);
      if (!Object.keys(champs).length) setGeneral(tousMessages(err));
    }
  }

  function fermer() {
    const modifie = !fini && (titre.trim() || longueur > 0 || image);
    if (modifie && !window.confirm("Quitter sans enregistrer ?")) return;
    navigate(-1);
  }

  return (
    <div>
      {recadrage && original && (
        <RecadrageImage fichier={original} coteMax={COTE_PUBLICATION} onValider={recadree} onAnnuler={annulerRecadrage} />
      )}

      <div className="entete" style={{ justifyContent: "center", position: "relative" }}>
        <button className="puce" aria-label="Fermer" onClick={fermer} style={{ position: "absolute", left: 0 }}><X size={18} /></button>
        <h1 style={{ margin: 0, fontSize: "1.2rem" }}>{id ? "Modifier la publication" : "Créer une publication"}</h1>
      </div>

      <input className="champ" placeholder="Titre" aria-label="Titre" maxLength={150} value={titre}
        aria-invalid={!!erreurs.titre} onChange={(e) => setTitre(e.target.value)} />
      {erreurs.titre && <p role="alert" className="erreur">{erreurs.titre}</p>}

      <div style={{ height: "0.75rem" }} />
      <Editeur initial={pub?.contenu} onChange={(h, n) => { setHtml(h); setLongueur(n); }} />
      {erreurs.contenu && <p role="alert" className="erreur">{erreurs.contenu}</p>}

      <div className="carte" style={{ marginTop: "0.75rem" }}>
        {imageAffichee && (
          <div style={{ position: "relative", marginBottom: "0.75rem" }}>
            <img src={imageAffichee} alt="Aperçu de l'image choisie" style={{ width: "100%", borderRadius: "0.75rem", display: "block" }} />
            <button className="puce" aria-label="Retirer l'image" style={{ position: "absolute", top: 8, right: 8 }}
              onClick={() => { setImage(null); setOriginal(null); setSupprimer(true); }}><X size={16} /></button>
          </div>
        )}
        <div className="duo">
          <label className="btn btn-sec" style={{ cursor: "pointer", flex: 1 }}>
            <ImageIcon size={18} /> {imageAffichee ? "Changer l'image" : "Ajouter une image"}
            <input type="file" accept={TYPES_IMAGE.join(",")} onChange={choisir} style={{ display: "none" }} />
          </label>
          {original && image && (
            <button type="button" className="btn btn-sec" style={{ flex: 1 }} onClick={() => setRecadrage(true)}>
              <Crop size={18} /> Recadrer
            </button>
          )}
        </div>
        {erreurs.image && <p role="alert" className="erreur">{erreurs.image}</p>}
      </div>

      <label className="carte interrupteur">
        <Globe size={20} aria-hidden="true" />
        <span style={{ flex: 1 }}>Aperçu public pour les non-connectés</span>
        <input type="checkbox" role="switch" checked={apercu} onChange={(e) => setApercu(e.target.checked)} />
      </label>
      <p className="doux" style={{ fontSize: "0.85rem" }}>
        {apercu ? "Les personnes sans compte verront seulement le titre, le début du texte et l'image. Il faut un compte pour lire la suite."
                : "Seuls les membres connectés pourront voir cette publication."}
      </p>

      {general && <p role="alert" className="erreur">{general}</p>}
      <div style={{ display: "grid", gap: "0.5rem", marginTop: "1rem" }}>
        {!dejaPublie && <Bouton secondaire chargement={enregistrer.isPending} onClick={() => envoyer("brouillon")}>Enregistrer en brouillon</Bouton>}
        <Bouton chargement={enregistrer.isPending} onClick={() => envoyer("publie")}>{dejaPublie ? "Enregistrer" : "Publier"}</Bouton>
      </div>
    </div>
  );
}
