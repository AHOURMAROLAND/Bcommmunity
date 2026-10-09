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
import {
  Bell, ChevronRight, CircleHelp, ImagePlus, Images, Laptop, LockKeyhole,
  LogOut, Palette, Shield, Trash2, UserRound, Users, X,
} from "lucide-react";
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

function GroupeParametres({ titre, Icon, children }) {
  return (
    <section className="parametres-groupe">
      <h2 className="parametres-groupe-titre"><Icon size={17} />{titre}</h2>
      <div className="parametres-groupe-liste">{children}</div>
    </section>
  );
}

function OptionParametres({ titre, description, Icon, children }) {
  return (
    <details className="parametres-option">
      <summary className="parametres-option-resume">
        <span className="parametres-option-icone"><Icon size={22} /></span>
        <span className="parametres-option-texte">
          <strong>{titre}</strong>
          <span>{description}</span>
        </span>
        <ChevronRight className="parametres-option-chevron" size={21} />
      </summary>
      <div className="parametres-option-contenu">{children}</div>
    </details>
  );
}

function dateLisible(valeur) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(valeur));
}

export default function Parametres() {
  const { deconnexion, utilisateur } = useAuth();
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
  const sessions = useQuery({
    queryKey: ["sessions-compte"],
    queryFn: () => api("/auth/sessions/"),
  });
  const fermerSession = useMutation({
    mutationFn: (id) => api(`/auth/sessions/${id}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions-compte"] }),
  });
  const [motDePasseActuel, setMotDePasseActuel] = useState("");
  const [nouveauMotDePasse, setNouveauMotDePasse] = useState("");
  const changerMotDePasse = useMutation({
    mutationFn: () => api("/auth/mot-de-passe/", {
      method: "POST",
      body: { actuel: motDePasseActuel, nouveau: nouveauMotDePasse },
    }),
    onSuccess: () => {
      setMotDePasseActuel("");
      setNouveauMotDePasse("");
      qc.invalidateQueries({ queryKey: ["sessions-compte"] });
    },
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
    <div className="page-parametres">
      <header className="parametres-entete">
        <h1>Menu principal</h1>
        <p>Gérez votre compte, votre confidentialité et vos préférences.</p>
      </header>
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

      <GroupeParametres titre="Compte et personnalisation" Icon={UserRound}>
        <OptionParametres
          titre="Apparence"
          description="Choisir le thème clair, sombre ou automatique"
          Icon={Palette}
        >
          <div className="puces" role="group" aria-label="Thème">
            {[["auto", "Automatique"], ["light", "Clair"], ["dark", "Sombre"]].map(([k, l]) => (
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
        </OptionParametres>
        <OptionParametres
          titre="Anniversaire et galerie"
          description="Votre date d’anniversaire et vos photos"
          Icon={Images}
        >
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
        </OptionParametres>
        <OptionParametres
          titre="Assistance et retours de test"
          description="Signaler un problème ou contacter l’équipe"
          Icon={CircleHelp}
        >
          <p className="doux" style={{ marginTop: 0 }}>
            Retrouvez ici vos signalements, suggestions et réponses de l’équipe « admin ».
          </p>
          <DiscussionsSupport />
        </OptionParametres>
      </GroupeParametres>

      <GroupeParametres titre="Notifications et confidentialité" Icon={Shield}>
        <OptionParametres
          titre="Notifications"
          description="Choisir les alertes reçues dans l’application"
          Icon={Bell}
        >
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
        </OptionParametres>

        <OptionParametres
          titre="Confidentialité et WhatsApp"
          description="Définir qui peut voir vos informations"
          Icon={LockKeyhole}
        >
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
        </OptionParametres>

        <OptionParametres
          titre="Alertes sur cet appareil"
          description="Activer les notifications même application fermée"
          Icon={Laptop}
        >
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
        </OptionParametres>

        <OptionParametres
          titre="Utilisateurs bloqués"
          description="Consulter les comptes bloqués et les débloquer"
          Icon={Users}
        >
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
        </OptionParametres>
      </GroupeParametres>

      <GroupeParametres titre="Sécurité du compte" Icon={Shield}>
        <OptionParametres
          titre="Modifier le mot de passe"
          description="Sécuriser l’accès avec un nouveau mot de passe"
          Icon={LockKeyhole}
        >
          {utilisateur?.a_mot_de_passe ? (
            <form
              className="parametres-formulaire-mot-de-passe"
              onSubmit={(event) => {
                event.preventDefault();
                changerMotDePasse.mutate();
              }}
            >
              <label>
                Mot de passe actuel
                <input
                  className="champ"
                  type="password"
                  autoComplete="current-password"
                  value={motDePasseActuel}
                  onChange={(event) => setMotDePasseActuel(event.target.value)}
                  required
                />
              </label>
              <label>
                Nouveau mot de passe
                <input
                  className="champ"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={nouveauMotDePasse}
                  onChange={(event) => setNouveauMotDePasse(event.target.value)}
                  required
                />
              </label>
              <Bouton chargement={changerMotDePasse.isPending}>Modifier le mot de passe</Bouton>
              {changerMotDePasse.isSuccess && (
                <p role="status" className="doux">Mot de passe modifié. Les autres sessions ont été déconnectées.</p>
              )}
              {changerMotDePasse.isError && (
                <p role="alert" className="erreur">{changerMotDePasse.error.message}</p>
              )}
            </form>
          ) : (
            <p className="doux">Ce compte utilise la connexion Google et n’a pas de mot de passe local.</p>
          )}
        </OptionParametres>
        <OptionParametres
          titre="Appareils et sessions"
          description="Jusqu’à 4 sessions ; fermeture après 7 jours d’inactivité"
          Icon={Laptop}
        >
          {sessions.isPending ? (
            <SqFormulaire champs={2} />
          ) : sessions.isError ? (
            <p role="alert" className="erreur">Impossible de charger les sessions actives.</p>
          ) : (
            <>
              <p className="doux">Sessions actives : {sessions.data.length}/4. Une session inactive pendant 7 jours expire automatiquement.</p>
              <ul className="parametres-sessions">
                {sessions.data.map((session) => (
                  <li key={session.id}>
                    <div>
                      <strong>{session.appareil}</strong>
                      <span>{session.adresse_ip || "Adresse inconnue"} · activité {dateLisible(session.derniere_activite)}</span>
                      {session.actuelle && <em>Session actuelle</em>}
                    </div>
                    {!session.actuelle && (
                      <button
                        type="button"
                        className="parametres-session-fermer"
                        aria-label={`Déconnecter ${session.appareil}`}
                        disabled={fermerSession.isPending}
                        onClick={() => fermerSession.mutate(session.id)}
                      >
                        <X size={18} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {fermerSession.isError && (
                <p role="alert" className="erreur">{fermerSession.error.message}</p>
              )}
            </>
          )}
        </OptionParametres>
        <OptionParametres
          titre="Se déconnecter"
          description="Fermer la session sur cet appareil"
          Icon={LogOut}
        >
          <Bouton secondaire onClick={deconnexion}>Se déconnecter</Bouton>
        </OptionParametres>
      </GroupeParametres>

      <ChargementLong actif={occupe} label="Activation des notifications..." />
    </div>
  );
}
