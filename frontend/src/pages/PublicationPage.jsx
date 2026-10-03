import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAjouterCommentaire, useCommentaires, usePublication, useSupprimerCommentaire } from "../api/publications";
import { tousMessages } from "../api/erreurs";
import { ilYa } from "../utils/date";
import Avatar from "../components/Avatar";
import PublicationCard from "../components/PublicationCard";
import { Bouton } from "../components/ui";
import { SqListe, SqPublication } from "../components/Squelettes";

export default function PublicationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();
  const pub = usePublication(id);
  const coms = useCommentaires(id);
  const ajouter = useAjouterCommentaire(id);
  const retirer = useSupprimerCommentaire();
  const [texte, setTexte] = useState("");
  const [erreur, setErreur] = useState("");
  const zone = useRef(null);

  useEffect(() => { if (state?.focus && pub.data) zone.current?.focus(); }, [state, pub.data]);

  if (pub.isPending) return <SqPublication />;
  if (pub.isError) {
    return (
      <div>
        <p role="alert" className="erreur">Cette publication n'est pas disponible.</p>
        <Bouton secondaire onClick={() => navigate("/fil")}>Retour au fil</Bouton>
      </div>
    );
  }

  const liste = coms.data?.pages.flatMap((p) => p.results) ?? [];
  const peutCommenter = pub.data.statut === "publie" && !pub.data.masquee;

  async function envoyer(e) {
    e.preventDefault();
    if (!texte.trim() || ajouter.isPending) return;
    setErreur("");
    try { await ajouter.mutateAsync(texte.trim()); setTexte(""); } catch (err) { setErreur(tousMessages(err)); }
  }

  return (
    <div>
      <button className="puce" onClick={() => navigate(-1)} style={{ marginBottom: "0.75rem" }}>
        <ArrowLeft size={18} /> Retour
      </button>
      <PublicationCard key={pub.data.id} p={pub.data} detail />

      <section id="commentaires" aria-label="Commentaires">
        <h2 style={{ fontSize: "1.05rem" }}>Commentaires ({pub.data.nb_commentaires})</h2>
        {peutCommenter && (
          <form onSubmit={envoyer} style={{ marginBottom: "1rem" }}>
            <textarea ref={zone} className="champ" rows={3} maxLength={1000} placeholder="Écrire un commentaire"
              aria-label="Votre commentaire" value={texte} onChange={(e) => setTexte(e.target.value)} />
            {erreur && <p role="alert" className="erreur">{erreur}</p>}
            <div style={{ marginTop: "0.5rem" }}>
              <Bouton type="submit" chargement={ajouter.isPending} disabled={!texte.trim()}>Envoyer</Bouton>
            </div>
          </form>
        )}
        {coms.isPending ? <SqListe n={2} /> : liste.length === 0 ? (
          <p className="doux">Aucun commentaire pour le moment.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {liste.map((c) => (
              <li key={c.id} className="ligne-membre" style={{ alignItems: "flex-start" }}>
                <Link to={`/profil/${c.auteur.id}`}><Avatar prenom={c.auteur.prenom} nom={c.auteur.nom} photo={c.auteur.photo} taille={40} /></Link>
                <div className="infos">
                  <strong>{c.auteur.prenom} {c.auteur.nom}</strong>{" "}
                  <span className="doux" style={{ fontSize: "0.8rem" }}>{ilYa(c.cree_le)}</span>
                  <p style={{ margin: "0.2rem 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{c.texte}</p>
                  {c.est_auteur && (
                    <button className="lien" style={{ background: "none", border: 0, cursor: "pointer", font: "inherit", padding: 0 }}
                      disabled={retirer.isPending}
                      onClick={() => window.confirm("Supprimer ce commentaire ?") && retirer.mutate(c.id)}>
                      Supprimer
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {coms.hasNextPage && (
          <Bouton secondaire chargement={coms.isFetchingNextPage} onClick={() => coms.fetchNextPage()}>Voir plus de commentaires</Bouton>
        )}
      </section>
    </div>
  );
}
