import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Flag, Heart, MessageCircle, MoreHorizontal, Send, Share2, Trash2 } from "lucide-react";
import { api } from "../api/client";
import {
  useAjouterCommentaire,
  useCommentaires,
  useSupprimerCommentaire,
  useSupprimerPublication,
} from "../api/publications";
import { ilYa } from "../utils/date";
import { partager } from "../utils/partager";
import Avatar from "./Avatar";
import HtmlSur from "./HtmlSur";
import ImageHD, { ImageZoom } from "./ImageHD";
import ModaleSignalement from "./ModaleSignalement";

export default function PublicationCard({ p, detail = false }) {
  const navigate = useNavigate();
  const supprimer = useSupprimerPublication();
  const [aime, setAime] = useState(p.a_aime);
  const [nb, setNb] = useState(p.nb_likes);
  const [nbCom, setNbCom] = useState(p.nb_commentaires);
  const [occupe, setOccupe] = useState(false);
  const [menu, setMenu] = useState(false);
  const [info, setInfo] = useState("");
  const [signalement, setSignalement] = useState(false);
  const [commentairesOuverts, setCommentairesOuverts] = useState(false);
  const [nouveauCommentaire, setNouveauCommentaire] = useState("");

  const coms = useCommentaires(p.id, !detail && commentairesOuverts);
  const ajouterCom = useAjouterCommentaire(p.id);
  const retirerCom = useSupprimerCommentaire();

  const listeCom = coms.data?.pages.flatMap((pg) => pg.results) ?? [];

  async function basculer() {
    if (occupe) return;
    setOccupe(true);
    const suivant = !aime;
    setAime(suivant);
    setNb((n) => Math.max(0, n + (suivant ? 1 : -1)));
    try {
      const rep = await api(`/publications/${p.id}/like/`, { method: suivant ? "POST" : "DELETE" });
      if (rep && typeof rep.nb_likes === "number") {
        setNb(rep.nb_likes);
        setAime(rep.a_aime);
      }
    } catch {
      setAime(!suivant);
      setNb((n) => Math.max(0, n + (suivant ? -1 : 1)));
    } finally {
      setOccupe(false);
    }
  }

  async function partagerLien() {
    const r = await partager(p);
    if (r === "copie") {
      setInfo("Lien copié dans le presse-papiers !");
      setTimeout(() => setInfo(""), 2500);
    }
  }

  async function effacer() {
    if (!window.confirm("Supprimer définitivement cette publication ?")) return;
    await supprimer.mutateAsync(p.id);
    if (detail) navigate("/fil", { replace: true });
  }

  async function posterCommentaire(e) {
    e.preventDefault();
    const texte = nouveauCommentaire.trim();
    if (!texte || ajouterCom.isPending) return;
    try {
      await ajouterCom.mutateAsync(texte);
      setNouveauCommentaire("");
      setNbCom((n) => n + 1);
    } catch {
      // Erreur affichée via formulaire ou toast
    }
  }

  const a = p.auteur;
  return (
    <article className="carte-pub" id={`pub-${p.id}`}>
      <header className="entete-pub">
        <Link to={`/profil/${a.id}`} style={{ display: "flex", flexShrink: 0 }}>
          <Avatar prenom={a.prenom} nom={a.nom} photo={a.photo} taille={44} />
        </Link>
        <div style={{ flex: 1, minWidth: 0, paddingLeft: "0.2rem" }}>
          <Link to={`/profil/${a.id}`} style={{ color: "inherit", textDecoration: "none" }}>
            <strong style={{ fontSize: "0.95rem" }}>{a.prenom} {a.nom}</strong>
          </Link>
          <div className="doux" style={{ fontSize: "0.8rem", marginTop: "1px" }}>
            {ilYa(p.publie_le ?? p.cree_le)}
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <button
            className="puce-options"
            aria-label="Options de la publication"
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
          >
            <MoreHorizontal size={20} />
          </button>
          {menu && (
            <div className="menu-contextuel">
              {p.est_auteur ? (
                <>
                  <Link className="menu-item" to={`/publier/${p.id}`}>Modifier</Link>
                  <button className="menu-item danger" onClick={effacer} disabled={supprimer.isPending}>
                    Supprimer
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => { setMenu(false); setSignalement(true); }}
                >
                  <Flag size={14} style={{ marginRight: "0.4rem" }} />
                  Signaler
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {detail ? (
        <h1 className="titre-pub">{p.titre}</h1>
      ) : (
        <h2 className="titre-pub">
          <Link to={`/publications/${p.id}`} style={{ color: "inherit", textDecoration: "none" }}>
            {p.titre}
          </Link>
        </h2>
      )}

      {detail ? <HtmlSur html={p.contenu} /> : <p className="extrait">{p.extrait || p.contenu}</p>}
      {p.masquee && <span className="badge-masque" title="Masquée par la modération">⚠️ Masquée</span>}

      {p.image && (
        <div style={{ margin: "0.6rem 0" }}>
          {detail ? <ImageZoom img={p.image} /> : <ImageHD img={p.image} />}
        </div>
      )}

      {/* Ligne des compteurs avec emoji coeur rouge comme sur la maquette */}
      <div className="compteurs-pub">
        <span className="coeur-stats" aria-hidden="true">❤️</span>
        <span>
          {nb} {nb > 1 ? "j'aime" : "j'aime"} · {nbCom} commentaire{nbCom > 1 ? "s" : ""}
        </span>
      </div>

      {/* 3 boutons d'actions */}
      <div className="actions-pub-bar">
        <button
          type="button"
          onClick={basculer}
          className={`btn-action-pub ${aime ? "actif-like" : ""}`}
          aria-pressed={aime}
          aria-label="J'aime"
        >
          <Heart size={19} fill={aime ? "#ef4444" : "none"} color={aime ? "#ef4444" : "currentColor"} />
          <span>J'aime</span>
        </button>

        {detail ? (
          <a href="#commentaires" className="btn-action-pub">
            <MessageCircle size={19} />
            <span>Commenter</span>
          </a>
        ) : (
          <button
            type="button"
            className={`btn-action-pub ${commentairesOuverts ? "actif" : ""}`}
            onClick={() => setCommentairesOuverts((v) => !v)}
          >
            <MessageCircle size={19} />
            <span>Commenter</span>
          </button>
        )}

        <button type="button" className="btn-action-pub" onClick={partagerLien}>
          <Share2 size={19} />
          <span>Partager</span>
        </button>
      </div>

      {info && <p role="status" className="toast-info">{info}</p>}

      {/* Accordéon commentaires en ligne sur le fil */}
      {!detail && commentairesOuverts && (
        <div className="tiroir-commentaires">
          <form onSubmit={posterCommentaire} className="form-commentaire-inline">
            <input
              type="text"
              className="champ-com-inline"
              placeholder="Écrire un commentaire..."
              value={nouveauCommentaire}
              onChange={(e) => setNouveauCommentaire(e.target.value)}
              maxLength={1000}
            />
            <button
              type="submit"
              className="btn-envoyer-com"
              disabled={!nouveauCommentaire.trim() || ajouterCom.isPending}
              aria-label="Publier le commentaire"
            >
              <Send size={16} />
            </button>
          </form>

          {coms.isPending ? (
            <p className="doux" style={{ fontSize: "0.85rem", padding: "0.5rem 0" }}>Chargement des commentaires...</p>
          ) : listeCom.length === 0 ? (
            <p className="doux" style={{ fontSize: "0.85rem", padding: "0.5rem 0" }}>Soyez le premier à commenter !</p>
          ) : (
            <div className="liste-commentaires-inline">
              {listeCom.map((c) => (
                <div key={c.id} className="item-commentaire-inline">
                  <Avatar prenom={c.auteur.prenom} nom={c.auteur.nom} photo={c.auteur.photo} taille={32} />
                  <div className="bulle-commentaire">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <strong style={{ fontSize: "0.85rem" }}>{c.auteur.prenom} {c.auteur.nom}</strong>
                      <span className="doux" style={{ fontSize: "0.75rem" }}>{ilYa(c.cree_le)}</span>
                    </div>
                    <p style={{ margin: "0.2rem 0 0", fontSize: "0.88rem", whiteSpace: "pre-wrap" }}>{c.texte}</p>
                    {c.est_auteur && (
                      <button
                        type="button"
                        className="btn-suppr-com"
                        onClick={async () => {
                          if (window.confirm("Supprimer votre commentaire ?")) {
                            await retirerCom.mutateAsync(c.id);
                            setNbCom((n) => Math.max(0, n - 1));
                          }
                        }}
                      >
                        <Trash2 size={12} /> Supprimer
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {signalement && <ModaleSignalement type="publication" id={p.id} onClose={() => setSignalement(false)} />}
    </article>
  );
}
