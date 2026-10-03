import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Heart, MessageCircle, MoreHorizontal, Share2 } from "lucide-react";
import { api } from "../api/client";
import { useSupprimerPublication } from "../api/publications";
import { ilYa } from "../utils/date";
import { partager } from "../utils/partager";
import Avatar from "./Avatar";
import HtmlSur from "./HtmlSur";

export default function PublicationCard({ p, detail = false }) {
  const navigate = useNavigate();
  const supprimer = useSupprimerPublication();
  const [aime, setAime] = useState(p.a_aime);
  const [nb, setNb] = useState(p.nb_likes);
  const [occupe, setOccupe] = useState(false);
  const [menu, setMenu] = useState(false);
  const [info, setInfo] = useState("");

  async function basculer() {
    if (occupe) return;
    setOccupe(true);
    const suivant = !aime;
    setAime(suivant);
    setNb((n) => n + (suivant ? 1 : -1));
    try {
      await api(`/publications/${p.id}/like/`, { method: suivant ? "POST" : "DELETE" });
    } catch {
      setAime(!suivant);
      setNb((n) => n + (suivant ? -1 : 1));
    } finally {
      setOccupe(false);
    }
  }

  async function partagerLien() {
    const r = await partager(p);
    if (r === "copie") { setInfo("Lien copié."); setTimeout(() => setInfo(""), 2500); }
  }

  async function effacer() {
    if (!window.confirm("Supprimer définitivement cette publication ?")) return;
    await supprimer.mutateAsync(p.id);
    if (detail) navigate("/fil", { replace: true });
  }

  const a = p.auteur;
  return (
    <article className="carte-pub">
      <header className="entete-pub">
        <Link to={`/profil/${a.id}`}><Avatar prenom={a.prenom} nom={a.nom} photo={a.photo} taille={44} /></Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link to={`/profil/${a.id}`} style={{ color: "inherit", textDecoration: "none" }}><strong>{a.prenom} {a.nom}</strong></Link>
          <div className="doux" style={{ fontSize: "0.82rem" }}>{ilYa(p.publie_le ?? p.cree_le)}</div>
        </div>
        {p.est_auteur && (
          <div style={{ position: "relative" }}>
            <button className="puce" aria-label="Options de la publication" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
              <MoreHorizontal size={18} />
            </button>
            {menu && (
              <div className="carte" style={{ position: "absolute", right: 0, zIndex: 5, width: "12rem" }}>
                <Link className="btn btn-sec" to={`/publier/${p.id}`}>Modifier</Link>
                <div style={{ height: "0.5rem" }} />
                <button className="btn btn-sec" onClick={effacer} disabled={supprimer.isPending}>Supprimer</button>
              </div>
            )}
          </div>
        )}
      </header>

      {detail ? <h1 className="titre-pub">{p.titre}</h1>
        : <h2 className="titre-pub"><Link to={`/publications/${p.id}`} style={{ color: "inherit", textDecoration: "none" }}>{p.titre}</Link></h2>}
      {detail ? <HtmlSur html={p.contenu} /> : <p className="extrait">{p.extrait}</p>}
      {p.image && (
        <img className="image-pub" src={p.image} alt="" loading={detail ? "eager" : "lazy"} decoding="async" />
      )}

      <p className="doux compteurs">
        {nb} j'aime · {p.nb_commentaires} commentaire{p.nb_commentaires > 1 ? "s" : ""}
      </p>
      <div className="actions-pub">
        <button onClick={basculer} aria-pressed={aime} aria-label="J'aime">
          <Heart size={20} fill={aime ? "var(--danger)" : "none"} color={aime ? "var(--danger)" : "currentColor"} /> J'aime
        </button>
        <Link to={`/publications/${p.id}`} state={{ focus: true }}><MessageCircle size={20} /> Commenter</Link>
        <button onClick={partagerLien}><Share2 size={20} /> Partager</button>
      </div>
      {info && <p role="status" className="doux" style={{ margin: "0.5rem 0 0" }}>{info}</p>}
    </article>
  );
}
