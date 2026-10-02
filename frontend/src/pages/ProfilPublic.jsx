import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, GraduationCap, MessageCircle, MoreHorizontal } from "lucide-react";
import { useAnnulerDemande, useBloquer, useProfilPublic, useRetirerAmi } from "../api/amis";
import { useAuth } from "../auth/AuthContext";
import Avatar from "../components/Avatar";
import BoutonRelation from "../components/BoutonRelation";
import { Bouton, Chargement } from "../components/ui";

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

  if (String(utilisateur.id) === id) return <Navigate to="/profil" replace />;
  if (q.isPending) return <Chargement />;
  if (q.isError) {
    return (
      <div>
        <p role="alert" className="erreur">Ce profil n'est pas disponible.</p>
        <Bouton secondaire onClick={() => navigate(-1)}>Retour</Bouton>
      </div>
    );
  }

  const d = q.data;
  const lignes = d.parcours ?? [];
  const visibles = tout ? lignes : lignes.slice(0, 3);

  async function bloquerCompte() {
    if (!window.confirm(`Bloquer ${d.prenom} ${d.nom} ? Vous ne vous verrez plus mutuellement.`)) return;
    await bloquer.mutateAsync(d.id);
    navigate("/annuaire", { replace: true });
  }

  return (
    <div>
      <div className="entete">
        <button className="puce" onClick={() => navigate(-1)} aria-label="Retour"><ArrowLeft size={18} /> Retour</button>
        <div style={{ position: "relative" }}>
          <button className="puce" aria-label="Plus d'options" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            <MoreHorizontal size={18} />
          </button>
          {menu && (
            <div className="carte" style={{ position: "absolute", right: 0, zIndex: 5, width: "14rem" }}>
              {d.relation === "amis" && (
                <Bouton secondaire onClick={() => window.confirm("Retirer cet ami ?") && retirer.mutate(d.id)}>
                  Retirer des amis
                </Bouton>
              )}
              <div style={{ height: "0.5rem" }} />
              <Bouton secondaire onClick={bloquerCompte}>Bloquer</Bouton>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "0.3rem" }}>
        <Avatar prenom={d.prenom} nom={d.nom} taille={112} />
        <h1 style={{ margin: "0.5rem 0 0" }}>{d.prenom} {d.nom}</h1>
        <p className="doux" style={{ margin: 0 }}>
          {d.statut === "ancien" ? "Ancien élève" : "Élève"}{d.annee_sortie ? `, promo ${d.annee_sortie}` : ""}
        </p>
        {d.situation?.texte && <p style={{ margin: 0, fontWeight: 600 }}>{d.situation.texte}</p>}
        {d.ville && <p className="doux" style={{ margin: 0 }}>{d.ville}</p>}
      </div>

      <div className="duo" style={{ margin: "1rem 0" }}>
        <div style={{ flex: 1 }}><BoutonRelation c={d} /></div>
        <div style={{ flex: 1 }}>
          <button className="btn btn-sec" disabled title="Disponible prochainement">
            <MessageCircle size={16} /> Inviter à discuter
          </button>
        </div>
      </div>
      {d.relation === "envoyee" && (
        <button className="lien" style={{ background: "none", border: 0, font: "inherit", cursor: "pointer" }}
          onClick={() => annuler.mutate(d.demande_id)}>Annuler la demande</button>
      )}

      {d.restreint ? (
        <p className="carte doux">Ce profil est réservé aux amis.</p>
      ) : (
        <>
          {d.bio && <p>{d.bio}</p>}
          <h2>Parcours scolaire</h2>
          {d.parcours === null ? (
            <p className="doux">Cette personne ne partage pas son parcours.</p>
          ) : lignes.length === 0 ? (
            <p className="doux">Parcours non renseigné.</p>
          ) : (
            <>
              <ol className="frise">
                {visibles.map((l) => (
                  <li key={l.id}>
                    <strong>{l.classe} {l.filiere}</strong>
                    <div className="doux">{l.annee_debut} - {l.annee_fin}</div>
                    {l.en_commun && <span className="badge-commun">en commun avec vous</span>}
                  </li>
                ))}
              </ol>
              {lignes.length > 3 && (
                <button className="carte" style={{ display: "flex", width: "100%", alignItems: "center", gap: "0.75rem",
                  cursor: "pointer", font: "inherit", color: "inherit" }} onClick={() => setTout((v) => !v)}>
                  <GraduationCap size={22} />
                  <span style={{ flex: 1, textAlign: "left" }}>
                    {tout ? "Réduire le parcours" : `Voir tout le parcours (${lignes.length})`}
                  </span>
                  <ChevronRight size={18} />
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
