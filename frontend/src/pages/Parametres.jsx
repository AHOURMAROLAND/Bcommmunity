import { lazy, Suspense, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ChargementLong from "@/components/ChargementLong";
import { api } from "../api/client";
import { useMajProfil, useProfil } from "../api/hooks";
import { useMajPreferences, usePreferences } from "../api/notifications";
import { useAuth } from "../auth/AuthContext";
import {
  activerPush, desactiverPush, estIOS, estInstalle, pushActif, pushSupporte,
} from "../utils/push";
import { appliquerTheme, themeActuel } from "../utils/theme";
import { Bouton, Selecteur } from "../components/ui";
import { SqFormulaire } from "../components/Squelettes";
import { ImagePlus, Trash2 } from "lucide-react";
import DiscussionsSupport from "../components/DiscussionsSupport";
import { TYPES_IMAGE, verifierFichier } from "../utils/image";

const EditeurImage = lazy(() => import("../editeur/EditeurImage"));

const ERREURS_PUSH = {
  non_supporte: "Ce navigateur ne gere pas les notifications push.",
  ios_installer:
    "Sur iPhone, ajoutez d'abord l'application a l'ecran d'accueil (Partager, puis Sur l'ecran d'accueil), puis rouvrez-la.",
  refuse:
    "Vous avez refuse les notifications. Autorisez-les dans les reglages du navigateur.",
};

function Interrupteur({ label, valeur, onChange }) {
  return (
    <label className="interrupteur-ligne">
      <span style={{ flex: 1 }}>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={!!valeur}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export default function Parametres() {
  const { deconnexion } = useAuth();
  const qc = useQueryClient();
  const prefs = usePreferences();
  const majPref = useMajPreferences();
  const profil = useProfil();
  const majProfil = useMajProfil();
  const [theme, setTheme] = useState(themeActuel());
  const [push, setPush] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreurPush, setErreurPush] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [visibiliteWhatsapp, setVisibiliteWhatsapp] = useState("amis");
  const [anniversaire, setAnniversaire] = useState("");
  const [photoOriginale, setPhotoOriginale] = useState(null);
  const [etatEditionGalerie, setEtatEditionGalerie] = useState(null);
  const [photoGalerieAEditer, setPhotoGalerieAEditer] = useState(null);
  const [erreurGalerie, setErreurGalerie] = useState("");
  const [editeurGalerieOuvert, setEditeurGalerieOuvert] = useState(false);
  const galerie = useQuery({
    queryKey: ["galerie-profil"],
    queryFn: () => api("/profils/me/galerie/"),
  });
  const ajouterPhoto = useMutation({
    mutationFn: (fichier) => {
      const formData = new FormData();
      formData.append("image", fichier);
      return api("/profils/me/galerie/", { method: "POST", formData });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["galerie-profil"] });
      qc.invalidateQueries({ queryKey: ["profil"] });
    },
  });
  const supprimerPhoto = useMutation({
    mutationFn: (id) => api(`/profils/me/galerie/${id}/`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["galerie-profil"] });
      qc.invalidateQueries({ queryKey: ["profil"] });
    },
  });
  const modifierPhoto = useMutation({
    mutationFn: ({ id, fichier }) => {
      const formData = new FormData();
      formData.append("image", fichier);
      return api(`/profils/me/galerie/${id}/`, { method: "PATCH", formData });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["galerie-profil"] }),
  });

  const bloques = useQuery({
    queryKey: ["bloques"],
    queryFn: () => api("/blocages/"),
  });
  const debloquer = useMutation({
    mutationFn: (id) => api(`/blocages/${id}/`, { method: "DELETE" }),
    onSuccess: () =>
      ["bloques", "annuaire", "suggestions"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] })),
  });

  useEffect(() => {
    pushActif().then(setPush).catch(() => {});
  }, []);

  useEffect(() => {
    if (profil.data) {
      setWhatsapp(profil.data.whatsapp ?? "");
      setVisibiliteWhatsapp(profil.data.whatsapp_visibilite ?? "amis");
      setAnniversaire(profil.data.date_anniversaire ?? "");
    }
  }, [profil.data]);

  async function enregistrerWhatsapp() {
    if (!profil.data) return;
    await majProfil.mutateAsync({
      whatsapp,
      whatsapp_visibilite: visibiliteWhatsapp,
    });
  }

  function ouvrirEditeurGalerie(fichier, id = null) {
    const erreur = verifierFichier(fichier);
    if (erreur) {
      setErreurGalerie(erreur);
      return;
    }
    setErreurGalerie("");
    setEtatEditionGalerie(null);
    setPhotoOriginale(fichier);
    setPhotoGalerieAEditer(id);
    setEditeurGalerieOuvert(true);
  }

  function terminerEditionGalerie(fichier, etat) {
    setEtatEditionGalerie(etat);
    setEditeurGalerieOuvert(false);
    if (photoGalerieAEditer) modifierPhoto.mutate({ id: photoGalerieAEditer, fichier });
    else ajouterPhoto.mutate(fichier);
    setPhotoOriginale(null);
    setPhotoGalerieAEditer(null);
  }

  async function basculerPush() {
    setErreurPush("");
    setOccupe(true);
    try {
      if (push) {
        await desactiverPush();
        setPush(false);
      } else {
        await activerPush();
        setPush(true);
      }
    } catch (e) {
      setErreurPush(ERREURS_PUSH[e.message] ?? "Impossible de modifier les notifications.");
    } finally {
      setOccupe(false);
    }
  }

  if (prefs.isPending || profil.isPending) return <SqFormulaire champs={5} />;
  const p = prefs.data;
  const ios = estIOS() && !estInstalle();

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Paramètres</h1>
      {editeurGalerieOuvert && photoOriginale && (
        <Suspense fallback={<div className="editeur"><SqFormulaire champs={5} /></div>}>
          <EditeurImage
            fichier={photoOriginale}
            initial={etatEditionGalerie ?? undefined}
            onTerminer={terminerEditionGalerie}
            onAnnuler={() => {
              setEditeurGalerieOuvert(false);
              setPhotoOriginale(null);
              setPhotoGalerieAEditer(null);
            }}
          />
        </Suspense>
      )}

      <div className="carte" style={{ marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>Apparence</h2>
        <div className="puces" role="group" aria-label="Theme">
          {[['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']].map(([k, l]) => (
            <button
              key={k}
              type="button"
              className="puce"
              aria-pressed={theme === k}
              onClick={() => { setTheme(k); appliquerTheme(k); }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="carte" style={{ marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>Assistance et retours de test</h2>
        <p className="doux" style={{ marginTop: 0 }}>
          Retrouvez ici vos signalements, suggestions et réponses de l’équipe « admin ».
        </p>
        <DiscussionsSupport />
      </div>

      <div className="carte" style={{ marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>Anniversaire et galerie</h2>
        <label htmlFor="date-anniversaire" style={{ display: "block", fontWeight: 600, marginBottom: ".35rem" }}>
          Ma date d’anniversaire
        </label>
        <input
          id="date-anniversaire" className="champ" type="date"
          value={anniversaire}
          onChange={(e) => {
            setAnniversaire(e.target.value);
            majProfil.mutate({ date_anniversaire: e.target.value || null });
          }}
        />
        <p className="doux" style={{ margin: ".35rem 0 1rem", fontSize: ".88rem" }}>
          Cette date reste privée et sert à préparer les messages d’anniversaire.
        </p>
        {majProfil.isError && (
          <p role="alert" className="erreur">{majProfil.error.message}</p>
        )}
        {(profil.data.cadeaux_anniversaire ?? []).length > 0 && (
          <div style={{ margin: "1rem 0" }}>
            <strong>Bons reçus de l’administration</strong>
            {(profil.data.cadeaux_anniversaire ?? []).map((cadeau) => (
              <article key={cadeau.id} className="carte" style={{ marginTop: ".5rem" }}>
                {cadeau.message && <p>{cadeau.message}</p>}
                <strong>Code : {cadeau.code}</strong>
              </article>
            ))}
          </div>
        )}
        <strong>Photos de galerie ({galerie.data?.length ?? 0}/10)</strong>
        <p className="doux" style={{ margin: ".35rem 0 .75rem", fontSize: ".88rem" }}>
          Ajoutez jusqu’à 10 photos ; elles défileront sur votre profil.
        </p>
        <label className="puce" style={{ display: "inline-flex", alignItems: "center", gap: ".4rem", cursor: "pointer" }}>
          <ImagePlus size={16} /> Ajouter une photo
          <input
            type="file" accept={TYPES_IMAGE.join(",")} hidden
            disabled={ajouterPhoto.isPending || (galerie.data?.length ?? 0) >= 10}
            onChange={(e) => {
              if (e.target.files?.[0]) ouvrirEditeurGalerie(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </label>
        {erreurGalerie && <p role="alert" className="erreur">{erreurGalerie}</p>}
        {ajouterPhoto.isError && <p role="alert" className="erreur">{ajouterPhoto.error.message}</p>}
        {modifierPhoto.isError && <p role="alert" className="erreur">{modifierPhoto.error.message}</p>}
        {supprimerPhoto.isError && <p role="alert" className="erreur">{supprimerPhoto.error.message}</p>}
        {galerie.isError && <p role="alert" className="erreur">Impossible de charger la galerie.</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(5rem,1fr))", gap: ".5rem", marginTop: ".75rem" }}>
          {(galerie.data ?? []).map((photo) => (
            <div key={photo.id} style={{ position: "relative" }}>
              <img src={photo.image} alt="Photo de galerie" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: ".6rem" }} />
              <label
                className="puce"
                style={{ display: "block", marginTop: ".25rem", padding: ".2rem", textAlign: "center", cursor: "pointer", fontSize: ".75rem" }}
              >
                Modifier
                <input
                  type="file" accept={TYPES_IMAGE.join(",")} hidden
                  disabled={modifierPhoto.isPending}
                  onChange={(e) => {
                    if (e.target.files?.[0]) ouvrirEditeurGalerie(e.target.files[0], photo.id);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                type="button" className="puce" aria-label="Supprimer cette photo"
                onClick={() => supprimerPhoto.mutate(photo.id)}
                style={{ position: "absolute", right: ".2rem", top: ".2rem", padding: ".25rem" }}
              ><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </div>

      <div className="carte" style={{ marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>Notifications</h2>
        <div style={{ marginBottom: "0.75rem" }}>
          <label htmlFor="pref-pub" style={{ display: "block", fontWeight: 600, marginBottom: "0.3rem" }}>
            Nouvelles publications
          </label>
          <select
            id="pref-pub"
            className="champ"
            value={p.publications}
            onChange={(e) => majPref.mutate({ publications: e.target.value })}
          >
            <option value="immediat">Immédiatement</option>
            <option value="quotidien">Un résumé par jour</option>
            <option value="desactive">Désactivées</option>
          </select>
        </div>
        <Interrupteur label="J'aime sur mes publications" valeur={p.likes} onChange={(v) => majPref.mutate({ likes: v })} />
        <Interrupteur label="Commentaires" valeur={p.commentaires} onChange={(v) => majPref.mutate({ commentaires: v })} />
        <Interrupteur label="Demandes d'ami" valeur={p.amis} onChange={(v) => majPref.mutate({ amis: v })} />
        <Interrupteur label="Messages et invitations" valeur={p.discussions} onChange={(v) => majPref.mutate({ discussions: v })} />
        <Interrupteur label="Alertes sur cet appareil (application fermée)" valeur={p.push} onChange={(v) => majPref.mutate({ push: v })} />
      </div>

      <div className="carte" style={{ marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>Confidentialité</h2>
        <div style={{ display: "grid", gap: "0.75rem" }}>
          <Selecteur label="Qui peut voir mon profil" value={profil.data.visibilite_profil ?? "tous"} onChange={(e) => majProfil.mutate({ visibilite_profil: e.target.value })}>
            <option value="tous">Tout le monde</option>
            <option value="amis">Mes amis</option>
            <option value="personne">Personne</option>
          </Selecteur>
          <Selecteur label="Qui peut voir mon parcours scolaire" value={profil.data.visibilite_parcours ?? "tous"} onChange={(e) => majProfil.mutate({ visibilite_parcours: e.target.value })}>
            <option value="tous">Tout le monde</option>
            <option value="amis">Mes amis</option>
            <option value="personne">Personne</option>
          </Selecteur>
          <Selecteur label="Qui peut voir ma situation actuelle" value={profil.data.visibilite_situation ?? "tous"} onChange={(e) => majProfil.mutate({ visibilite_situation: e.target.value })}>
            <option value="tous">Tout le monde</option>
            <option value="amis">Mes amis</option>
            <option value="personne">Personne</option>
          </Selecteur>
          <Selecteur label="Qui peut m'inviter à discuter" value={profil.data.qui_peut_inviter ?? "tous"} onChange={(e) => majProfil.mutate({ qui_peut_inviter: e.target.value })}>
            <option value="tous">Tout le monde</option>
            <option value="amis">Mes amis</option>
            <option value="personne">Personne</option>
          </Selecteur>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            <label htmlFor="wa" style={{ display: "block", fontWeight: 600 }}>WhatsApp</label>
            <input
              id="wa"
              className="champ"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+22890000000"
            />
            <Selecteur label="Visibilité du WhatsApp" value={visibiliteWhatsapp} onChange={(e) => setVisibiliteWhatsapp(e.target.value)}>
              <option value="tous">Tout le monde</option>
              <option value="amis">Mes amis</option>
              <option value="personne">Personne</option>
            </Selecteur>
            <Bouton secondaire type="button" chargement={majProfil.isPending} onClick={enregistrerWhatsapp}>Enregistrer WhatsApp</Bouton>
          </div>
        </div>
      </div>

      <div className="carte" style={{ marginBottom: "1rem" }}>
        <strong>Alertes sur cet appareil</strong>
        {!pushSupporte() && !ios ? (
          <p className="doux" style={{ margin: "0.4rem 0 0" }}>Non disponibles sur ce navigateur.</p>
        ) : (
          <>
            <p className="doux" style={{ margin: "0.3rem 0 0.75rem" }}>
              {push ? "Les alertes sont actives sur cet appareil." : "Recevez une alerte même quand l'application est fermée."}
            </p>
            {ios && <p className="doux" style={{ margin: "0 0 0.75rem" }}>Sur iPhone, installez d'abord l'application sur l'écran d'accueil.</p>}
            <Bouton secondaire={push} chargement={occupe} onClick={basculerPush}>
              {push ? "Désactiver sur cet appareil" : "Activer sur cet appareil"}
            </Bouton>
          </>
        )}
        {erreurPush && <p role="alert" className="erreur" style={{ marginTop: "0.5rem" }}>{erreurPush}</p>}
      </div>

      <h2 style={{ fontSize: "1.05rem", marginTop: "1.5rem" }}>Utilisateurs bloqués</h2>
      {bloques.isPending ? (
        <SqFormulaire champs={1} />
      ) : !(bloques.data ?? []).length ? (
        <p className="doux">Vous n'avez bloqué personne.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {bloques.data.map((b) => (
            <li key={b.id} className="ligne-membre">
              <div className="infos"><strong>{b.prenom} {b.nom}</strong></div>
              <div className="actions">
                <Bouton secondaire chargement={debloquer.isPending} onClick={() => debloquer.mutate(b.id)}>
                  Débloquer
                </Bouton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: "1.5rem" }}>
        <Bouton secondaire onClick={deconnexion}>Se déconnecter</Bouton>
      </div>

      <ChargementLong actif={occupe} label="Activation des notifications..." />
    </div>
  );
}
