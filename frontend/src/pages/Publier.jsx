import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Globe, ImageIcon, X } from "lucide-react";
import { useEnregistrerPublication, usePublication } from "../api/publications";
import { erreursChamps, tousMessages } from "../api/erreurs";
import { TYPES_IMAGE, verifierFichier } from "../utils/image";
import ChargementLong from "@/components/ChargementLong";
import { Bouton } from "../components/ui";
import { SqEditeur } from "../components/Squelettes";
import Editeur from "../components/Editeur";
import { useTempsReel } from "../temps-reel/TempsReel";
import { estErreurReseau } from "../api/stockage-hors-ligne";

// Chargement paresseux de l'editeur d'image (lourd)
const EditeurImage = lazy(() => import("../editeur/EditeurImage"));

function dateLocalePourChamp(valeur) {
  if (!valeur) return "";
  const date = new Date(valeur);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function Publier() {
  const { id } = useParams();
  const existante = usePublication(id, !!id);
  if (id && existante.isPending) return <SqEditeur />;
  if (id && existante.isError) return <p role="alert" className="erreur">Publication introuvable.</p>;
  return <Formulaire id={id} pub={existante.data} />;
}

function Formulaire({ id, pub }) {
  const navigate = useNavigate();
  const { mettreEnFile } = useTempsReel();
  const enregistrer = useEnregistrerPublication(id);
  const clientId = useRef(id ? "" : crypto.randomUUID());
  const [titre, setTitre] = useState(pub?.titre ?? "");
  const [html, setHtml] = useState(pub?.contenu ?? "");
  const [longueur, setLongueur] = useState(pub ? 1 : 0);
  const [apercu, setApercu] = useState(pub?.apercu_public ?? true);
  const [dateProgrammee, setDateProgrammee] = useState(() => dateLocalePourChamp(pub?.date_programmee));
  const [original, setOriginal] = useState(null);       // fichier choisi, avant edition
  const [image, setImage] = useState(null);              // fichier final pret a envoyer
  const [etatEdition, setEtatEdition] = useState(null);  // etat de l'editeur pour re-entree
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

  // Appele par EditeurImage quand l'utilisateur clique "Terminer"
  function termine(fichier, etatFinal) {
    setImage(fichier);
    setEtatEdition(etatFinal);
    setSupprimer(false);
    setRecadrage(false);
  }

  function annulerEditeur() {
    setRecadrage(false);
    if (!image) setOriginal(null);
  }

  async function envoyer(statut) {
    if (enregistrer.isPending) return;
    setErreurs({}); setGeneral("");
    if (titre.trim().length < 3) { setErreurs({ titre: "Le titre doit contenir au moins 3 caracteres." }); return; }
    if (statut === "publie" && longueur === 0) { setErreurs({ contenu: "Ecrivez du contenu avant de publier." }); return; }
    if (statut === "programmee") {
      if (!dateProgrammee || new Date(dateProgrammee).getTime() <= Date.now()) {
        setErreurs({ date_programmee: "Choisissez une date et une heure dans le futur." });
        return;
      }
      if (longueur === 0) { setErreurs({ contenu: "Ecrivez du contenu avant de programmer." }); return; }
    }
    const fd = new FormData();
    fd.append("titre", titre.trim());
    fd.append("contenu", html);
    fd.append("statut", statut);
    if (statut === "programmee") {
      fd.append("date_programmee", new Date(dateProgrammee).toISOString());
    }
    fd.append("apercu_public", apercu ? "true" : "false");
    if (!id) fd.append("client_id", clientId.current);
    if (image) fd.append("image", image);
    if (supprimer && !image) fd.append("supprimer_image", "true");
    const mettreEnAttente = async () => {
      await mettreEnFile({
        type: "publication",
        chemin: id ? `/publications/${id}/` : "/publications/",
        methode: id ? "PATCH" : "POST",
        entrees: Array.from(fd.entries()),
      });
      setFini(true);
      navigate("/fil", { replace: true });
    };
    if (!navigator.onLine) {
      try {
        await mettreEnAttente();
      } catch (err) {
        setGeneral(err.message || "Impossible d’enregistrer la publication hors ligne.");
      }
      return;
    }
    try {
      const r = await enregistrer.mutateAsync(fd);
      setFini(true);
      navigate(statut === "publie" ? `/publications/${r.id}` : "/profil", { replace: true });
    } catch (err) {
      if (estErreurReseau(err)) {
        try {
          await mettreEnAttente();
          return;
        } catch (erreurFile) {
          setGeneral(erreurFile.message || "Impossible de mettre la publication en attente.");
          return;
        }
      }
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
      {/* Editeur d'image en plein ecran (lazy) */}
      {recadrage && original && (
        <Suspense fallback={<div className="editeur"><SqEditeur /></div>}>
          <EditeurImage
            fichier={original}
            initial={etatEdition ?? undefined}
            onTerminer={termine}
            onAnnuler={annulerEditeur}
          />
        </Suspense>
      )}

      {/* Voile de publication */}
      <ChargementLong actif={enregistrer.isPending} label="Publication en cours..." />

      <div className="entete" style={{ justifyContent: "center", position: "relative" }}>
        <button className="puce" aria-label="Fermer" onClick={fermer} style={{ position: "absolute", left: 0 }}>
          <X size={18} />
        </button>
        <h1 style={{ margin: 0, fontSize: "1.2rem" }}>
          {id ? "Modifier la publication" : "Creer une publication"}
        </h1>
      </div>

      <input
        className="champ" placeholder="Titre" aria-label="Titre"
        maxLength={150} value={titre}
        aria-invalid={!!erreurs.titre}
        onChange={(e) => setTitre(e.target.value)}
      />
      {erreurs.titre && <p role="alert" className="erreur">{erreurs.titre}</p>}

      <div style={{ height: "0.75rem" }} />
      <Editeur initial={pub?.contenu} onChange={(h, n) => { setHtml(h); setLongueur(n); }} />
      {erreurs.contenu && <p role="alert" className="erreur">{erreurs.contenu}</p>}

      <div className="carte" style={{ marginTop: "0.75rem" }}>
        {imageAffichee && (
          <div style={{ position: "relative", marginBottom: "0.75rem" }}>
            <img
              src={imageAffichee} alt="Apercu de l'image choisie"
              style={{ width: "100%", borderRadius: "0.75rem", display: "block" }}
            />
            <button
              className="puce" aria-label="Retirer l'image"
              style={{ position: "absolute", top: 8, right: 8 }}
              onClick={() => { setImage(null); setOriginal(null); setEtatEdition(null); setSupprimer(true); }}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="duo">
          <label className="btn btn-sec" style={{ cursor: "pointer", flex: 1 }}>
            <ImageIcon size={18} /> {imageAffichee ? "Changer l'image" : "Ajouter une image"}
            <input type="file" accept={TYPES_IMAGE.join(",")} onChange={choisir} style={{ display: "none" }} />
          </label>
          {/* Bouton "Modifier l'image" si une image est deja presente */}
          {original && image && (
            <button type="button" className="btn btn-sec" style={{ flex: 1 }} onClick={() => setRecadrage(true)}>
              <ImageIcon size={18} /> Modifier l'image
            </button>
          )}
        </div>
        {erreurs.image && <p role="alert" className="erreur">{erreurs.image}</p>}
      </div>

      <label className="carte interrupteur">
        <Globe size={20} aria-hidden="true" />
        <span style={{ flex: 1 }}>Apercu public pour les non-connectes</span>
        <input type="checkbox" role="switch" checked={apercu} onChange={(e) => setApercu(e.target.checked)} />
      </label>
      <p className="doux" style={{ fontSize: "0.85rem" }}>
        {apercu
          ? "Les personnes sans compte verront seulement le titre, le debut du texte et l'image. Il faut un compte pour lire la suite."
          : "Seuls les membres connectes pourront voir cette publication."}
      </p>

      {!dejaPublie && (
        <div className="carte" style={{ marginTop: ".75rem" }}>
          <label htmlFor="date-publication-programmee" style={{ display: "block", fontWeight: 600, marginBottom: ".4rem" }}>
            Programmer la publication
          </label>
          <input
            id="date-publication-programmee"
            className="champ"
            type="datetime-local"
            value={dateProgrammee}
            onChange={(event) => setDateProgrammee(event.target.value)}
          />
          <p className="doux" style={{ marginBottom: 0, fontSize: ".85rem" }}>
            La publication apparaîtra dans le fil à la date choisie.
          </p>
          {erreurs.date_programmee && <p role="alert" className="erreur">{erreurs.date_programmee}</p>}
        </div>
      )}

      {general && <p role="alert" className="erreur">{general}</p>}
      <div style={{ display: "grid", gap: "0.5rem", marginTop: "1rem" }}>
        {!dejaPublie && (
          <Bouton secondaire chargement={enregistrer.isPending} onClick={() => envoyer("brouillon")}>
            Enregistrer en brouillon
          </Bouton>
        )}
        {!dejaPublie && (
          <Bouton secondaire chargement={enregistrer.isPending} onClick={() => envoyer("programmee")}>
            Programmer
          </Bouton>
        )}
        <Bouton chargement={enregistrer.isPending} onClick={() => envoyer("publie")}>
          {dejaPublie ? "Enregistrer" : pub?.statut === "programmee" ? "Publier maintenant" : "Publier"}
        </Bouton>
      </div>
    </div>
  );
}
