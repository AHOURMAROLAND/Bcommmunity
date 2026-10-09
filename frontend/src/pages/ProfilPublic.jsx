import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Flag,
  GraduationCap,
  MessageCircle,
  MoreHorizontal,
  Images,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useAnnulerDemande, useBloquer, useProfilPublic, useRetirerAmi } from "../api/amis";
import { useAccepterInvitation, useAnnulerInvitation, useRefuserInvitation } from "../api/discussions";
import { useFil } from "../api/publications";
import { useAuth } from "../auth/AuthContext";
import InvitationModale from "../components/InvitationModale";
import ModaleSignalement from "../components/ModaleSignalement";
import PublicationCard from "../components/PublicationCard";
import { Bouton } from "../components/ui";
import { SqCartes, SqProfil } from "../components/Squelettes";

function PublicationsDe({ id }) {
  const q = useFil(id);
  const items = q.data?.pages.flatMap((p) => p.results) ?? [];
  if (q.isPending) return <SqCartes n={1} />;
  if (!items.length) return <p className="doux" style={{ margin: "1rem 0" }}>Aucune publication pour le moment.</p>;
  return (
    <div style={{ marginTop: "1rem" }}>
      {items.map((p) => <PublicationCard key={p.id} p={p} />)}
      {q.hasNextPage && (
        <Bouton secondaire chargement={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
          Voir plus
        </Bouton>
      )}
    </div>
  );
}
export default function ProfilPublic() {
  const { id } = useParams();
  const { utilisateur } = useAuth();
  const navigate = useNavigate();
  const q = useProfilPublic(id);
  const bloquer = useBloquer();
  const annuler = useAnnulerDemande();
  const retirer = useRetirerAmi();
  const [menu, setMenu] = useState(false);
  const [tout, setTout] = useState(false);
  const [modaleInvitation, setModaleInvitation] = useState(false);
  const [signalement, setSignalement] = useState(false);

  const accepterDisc = useAccepterInvitation();
  const refuserDisc = useRefuserInvitation();
  const annulerDisc = useAnnulerInvitation();

  if (String(utilisateur.id) === id) return <Navigate to="/profil" replace />;
  if (q.isPending) return <SqProfil />;
  if (q.isError) {
    return (
      <div className="carte" style={{ margin: "2rem auto", textAlign: "center", maxWidth: "26rem" }}>
        <p role="alert" className="erreur">Ce profil n'est pas disponible ou est restreint.</p>
        <Bouton secondaire onClick={() => navigate(-1)}>Retour</Bouton>
      </div>
    );
  }

  const d = q.data;
  const photo = d.photo_grande ?? d.photo;
  const lignes = d.parcours ?? [];
  const visibles = tout ? lignes : lignes.slice(0, 3);
  const x = d.discussion;

  async function bloquerCompte() {
    if (!window.confirm(`Bloquer ${d.prenom} ${d.nom} ? Vous ne vous verrez plus mutuellement.`)) return;
    await bloquer.mutateAsync(d.id);
    navigate("/annuaire", { replace: true });
  }

  return (
    <div className="profil-public-page">
      {/* Hero Header immersif (comme sur la maquette 2) */}
      <div className="profil-hero-container">
        {/* Barre de navigation supérieure au-dessus de la photo */}
        <div className="profil-hero-topbar">
          <button
            type="button"
            className="btn-retour-hero"
            onClick={() => navigate("/annuaire")}
            aria-label="Retour à l'annuaire"
          >
            <ChevronLeft size={20} />
            <span>Annuaire</span>
          </button>

          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="btn-options-hero"
              aria-label="Plus d'options"
              aria-expanded={menu}
              onClick={() => setMenu((v) => !v)}
            >
              <MoreHorizontal size={20} />
            </button>

            {menu && (
              <div className="menu-contextuel" style={{ position: "absolute", right: 0, top: "2.8rem", width: "13rem" }}>
                {d.relation === "amis" && (
                  <button
                    type="button"
                    className="menu-item danger"
                    onClick={() => {
                      setMenu(false);
                      if (window.confirm("Retirer cet ami ?")) retirer.mutate(d.id);
                    }}
                  >
                    Retirer des amis
                  </button>
                )}
                <button type="button" className="menu-item danger" onClick={bloquerCompte}>
                  Bloquer cet utilisateur
                </button>
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => { setMenu(false); setSignalement(true); }}
                >
                  <Flag size={14} style={{ marginRight: "0.4rem" }} />
                  Signaler cet utilisateur
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Image hero avec fondu sombre dégradé */}
        <div className="profil-hero-image-wrapper">
          {photo ? (
            <img src={photo} alt={`Photo de ${d.prenom} ${d.nom}`} className="profil-hero-image" />
          ) : (
            <div className="profil-hero-placeholder">
              <span>{`${d.prenom?.[0] ?? ""}${d.nom?.[0] ?? ""}`.toUpperCase()}</span>
            </div>
          )}
          <div className="profil-hero-gradient" />
        </div>

        {/* Textes du profil incrustés en bas de l'image */}
        <div className="profil-hero-infos">
          <h1 className="profil-hero-nom">{d.prenom} {d.nom}</h1>
          <p className="profil-hero-statut">
            {d.statut === "ancien" ? "Ancienne élève" : "Élève actuel"}
            {d.annee_sortie ? ` · promo ${d.annee_sortie}` : ""}
          </p>
          {d.situation?.texte ? (
            <p className="profil-hero-situation">{d.situation.texte}</p>
          ) : d.ville ? (
            <p className="profil-hero-situation">{d.ville}</p>
          ) : null}
        </div>
      </div>

      {/* Contenu principal sous la photo */}
      <div className="profil-public-corps">
        {d.galerie?.length > 0 && (
          <Link
            to={`/profil/${d.id}/galerie`}
            className="puce"
            style={{ display: "inline-flex", alignItems: "center", gap: ".5rem", margin: "1rem 0" }}
          >
            <Images size={18} /> Galerie ({d.galerie.length})
          </Link>
        )}
        {/* Rangée des deux boutons d'action (Ajouter en ami + Message) */}
        <div className="profil-actions-row">
          {/* Bouton Relation */}
          {d.relation === "amis" ? (
            <button type="button" className="btn-action-ami deja-ami" disabled>
              <UserCheck size={18} />
              <span>Amis</span>
            </button>
          ) : d.relation === "envoyee" ? (
            <button
              type="button"
              className="btn-action-ami en-attente"
              onClick={() => annuler.mutate(d.demande_id)}
              title="Cliquer pour annuler"
            >
              <span>Demande envoyée</span>
            </button>
          ) : d.relation === "recue" ? (
            <button
              type="button"
              className="btn-action-ami accepter"
              onClick={() => navigate("/amis")}
            >
              <UserCheck size={18} />
              <span>Répondre à la demande</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn-action-ami ajouter"
              onClick={() => navigate(`/amis`)}
            >
              <UserPlus size={18} />
              <span>Ajouter en ami</span>
            </button>
          )}

          {/* Bouton Message */}
          {x?.etat === "conversation" ? (
            <button
              type="button"
              className="btn-action-msg"
              onClick={() => navigate(`/messages/${x.conversation}`)}
            >
              <MessageCircle size={18} />
              <span>Message</span>
            </button>
          ) : x?.etat === "recue" ? (
            <button
              type="button"
              className="btn-action-msg"
              onClick={async () => {
                const r = await accepterDisc.mutateAsync(x.invitation);
                navigate(`/messages/${r.conversation}`);
              }}
            >
              <MessageCircle size={18} />
              <span>Accepter invitation</span>
            </button>
          ) : x?.etat === "envoyee" ? (
            <button
              type="button"
              className="btn-action-msg"
              onClick={() => annulerDisc.mutate(x.invitation)}
            >
              <MessageCircle size={18} />
              <span>Invitation en attente</span>
            </button>
          ) : x?.etat === "indisponible" ? (
            <button type="button" className="btn-action-msg desactive" disabled>
              <MessageCircle size={18} />
              <span>Message désactivé</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn-action-msg"
              onClick={() => setModaleInvitation(true)}
            >
              <MessageCircle size={18} />
              <span>Message</span>
            </button>
          )}
        </div>

        {/* Modale d'invitation à discuter */}
        {modaleInvitation && (
          <InvitationModale utilisateur={d} onFermer={() => setModaleInvitation(false)} />
        )}

        {/* Section Parcours scolaire avec frise stepper conforme maquette 2 */}
        {d.restreint ? (
          <div className="carte" style={{ margin: "1.5rem 0", textAlign: "center" }}>
            <p className="doux" style={{ margin: 0 }}>Ce profil est réservé aux amis.</p>
          </div>
        ) : (
          <>
            <div className="profil-section-parcours">
              <h2 className="profil-section-titre">Parcours scolaire</h2>

              {d.parcours === null ? (
                <p className="doux">Cette personne ne partage pas son parcours.</p>
              ) : lignes.length === 0 ? (
                <p className="doux">Parcours scolaire non renseigné.</p>
              ) : (
                <>
                  <div className="frise-stepper-maquette">
                    {visibles.map((l, idx) => (
                      <div key={l.id} className="stepper-item">
                        {/* Ligne verticale de connexion */}
                        <div className="stepper-gauche">
                          <div className="stepper-noeud" />
                          {idx < visibles.length - 1 && <div className="stepper-ligne" />}
                        </div>

                        {/* Informations de la classe */}
                        <div className="stepper-droite">
                          <strong className="stepper-classe-nom">
                            {l.classe} {l.filiere ? l.filiere : ""}
                          </strong>
                          <div className="stepper-annees">
                            {l.annee_debut} – {l.annee_fin}
                          </div>
                          {l.en_commun && (
                            <div className="badge-en-commun-pill">
                              <Users size={13} />
                              <span>en commun avec vous</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Bouton voir tout le parcours */}
                  {lignes.length > 3 && (
                    <button
                      type="button"
                      className="carte-bouton-voir-tout"
                      onClick={() => setTout((v) => !v)}
                    >
                      <GraduationCap size={22} className="icone-mortier" />
                      <span className="texte-voir-tout">
                        {tout ? "Réduire le parcours" : "Voir tout le parcours"}
                      </span>
                      <ChevronRight size={18} className="fleche-voir-tout" />
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Bio de l'élève */}
            {d.bio && (
              <div className="carte" style={{ margin: "1.25rem 0" }}>
                <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>À propos</h3>
                <p style={{ margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{d.bio}</p>
              </div>
            )}

            {/* Publications */}
            <div style={{ marginTop: "1.5rem" }}>
              <h2 className="profil-section-titre">Publications</h2>
              <PublicationsDe id={d.id} />
            </div>
          </>
        )}
      </div>
      {signalement && d && (
        <ModaleSignalement type="utilisateur" id={d.id} onClose={() => setSignalement(false)} />
      )}
    </div>
  );
}
