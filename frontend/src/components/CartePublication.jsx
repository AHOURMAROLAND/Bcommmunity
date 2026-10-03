import { useState } from "react";
import {
  Heart,
  MessageCircle,
  MoreHorizontal,
  Send,
  Share2,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  useAjouterCommentaire,
  useCommentaires,
  useSupprimerCommentaire,
  useSupprimerPublication,
  useToggleLike,
} from "../api/publications";
import { dateRelative } from "../utils/date";
import { Avatar } from "./Avatar";

export function CartePublication({ publication, onModifier, onPartager }) {
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [commentairesOuverts, setCommentairesOuverts] = useState(false);
  const [texteCommentaire, setTexteCommentaire] = useState("");
  const [texteEtendu, setTexteEtendu] = useState(false);

  const toggleLike = useToggleLike();
  const supprimerPub = useSupprimerPublication();
  const ajouterCom = useAjouterCommentaire(publication.id);
  const supprimerCom = useSupprimerCommentaire(publication.id);

  const { data: donneesCom } = useCommentaires(commentairesOuverts ? publication.id : null);
  const commentaires = donneesCom?.pages?.flatMap((p) => p.results) || [];

  const aAime = publication.a_aime;
  const nbLikes = publication.nb_likes;
  const nbCommentaires = publication.nb_commentaires;

  const handleLike = () => {
    toggleLike.mutate(publication.id);
  };

  const handleSupprimer = () => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cette publication ?")) {
      supprimerPub.mutate(publication.id);
    }
  };

  const handleEnvoyerCommentaire = (e) => {
    e.preventDefault();
    const t = texteCommentaire.trim();
    if (!t) return;
    ajouterCom.mutate(t, {
      onSuccess: () => setTexteCommentaire(""),
    });
  };

  const contenuLong = publication.contenu.length > 280;
  const contenuAffiche = contenuLong && !texteEtendu
    ? `${publication.contenu.slice(0, 280)}...`
    : publication.contenu;

  return (
    <article className="carte-publication" id={`pub-${publication.id}`}>
      {/* En-tête auteur */}
      <div className="carte-pub-entete">
        <Link
          to={`/profil/${publication.auteur.id}`}
          style={{ display: "flex", alignItems: "center", gap: "0.75rem", textDecoration: "none", color: "inherit" }}
        >
          <Avatar prenom={publication.auteur.prenom} nom={publication.auteur.nom} taille={42} />
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
              {publication.auteur.prenom} {publication.auteur.nom}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--texte-secondaire)" }}>
              {dateRelative(publication.cree_le)}
              {publication.statut === "brouillon" && " · Brouillon"}
            </div>
          </div>
        </Link>

        {/* Menu contextuel */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setMenuOuvert((v) => !v)}
            aria-label="Options"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--texte-secondaire)",
              cursor: "pointer",
              padding: "0.4rem",
              borderRadius: "50%",
            }}
          >
            <MoreHorizontal size={20} />
          </button>

          {menuOuvert && (
            <div
              className="carte-menu-pop"
              style={{
                position: "absolute",
                right: 0,
                top: "100%",
                background: "var(--carte)",
                border: "1px solid var(--bordure)",
                borderRadius: "0.75rem",
                boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
                zIndex: 20,
                minWidth: "160px",
                overflow: "hidden",
              }}
            >
              {publication.est_auteur ? (
                <>
                  <button
                    onClick={() => {
                      setMenuOuvert(false);
                      onModifier(publication);
                    }}
                    className="carte-menu-item"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => {
                      setMenuOuvert(false);
                      handleSupprimer();
                    }}
                    className="carte-menu-item"
                    style={{ color: "#f87171" }}
                  >
                    Supprimer
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setMenuOuvert(false);
                    onPartager(publication);
                  }}
                  className="carte-menu-item"
                >
                  Partager
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Titre */}
      <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0.5rem 0", lineHeight: 1.35 }}>
        {publication.titre}
      </h3>

      {/* Contenu */}
      <div style={{ fontSize: "0.95rem", lineHeight: 1.55, color: "var(--texte-principal, #e2e8f0)", whiteSpace: "pre-wrap" }}>
        {contenuAffiche}
        {contenuLong && (
          <button
            onClick={() => setTexteEtendu((v) => !v)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--primaire)",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer",
              marginLeft: "0.4rem",
            }}
          >
            {texteEtendu ? "Voir moins" : "Voir plus"}
          </button>
        )}
      </div>

      {/* Image éventuelle */}
      {publication.image && (
        <div style={{ marginTop: "0.85rem", borderRadius: "0.75rem", overflow: "hidden", border: "1px solid var(--bordure)" }}>
          <img
            src={publication.image}
            alt={publication.titre}
            style={{ width: "100%", maxHeight: "380px", objectFit: "cover", display: "block" }}
            loading="lazy"
          />
        </div>
      )}

      {/* Statistiques (compteurs) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.82rem",
          color: "var(--texte-secondaire)",
          padding: "0.75rem 0 0.5rem 0",
          borderBottom: "1px solid var(--bordure)",
          marginTop: "0.5rem",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <Heart size={14} fill={nbLikes > 0 ? "#ef4444" : "none"} color={nbLikes > 0 ? "#ef4444" : "currentColor"} />
          {nbLikes} {nbLikes > 1 ? "j'aime" : "j'aime"}
        </span>
        <button
          onClick={() => setCommentairesOuverts((v) => !v)}
          style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: "inherit" }}
        >
          {nbCommentaires} {nbCommentaires > 1 ? "commentaires" : "commentaire"}
        </button>
      </div>

      {/* Boutons d'action */}
      <div style={{ display: "flex", justifyContent: "space-around", paddingTop: "0.4rem" }}>
        <button
          onClick={handleLike}
          className={`bouton-action-pub ${aAime ? "pub-aime" : ""}`}
        >
          <Heart size={18} fill={aAime ? "#ef4444" : "none"} color={aAime ? "#ef4444" : "currentColor"} />
          <span>J'aime</span>
        </button>

        <button
          onClick={() => setCommentairesOuverts((v) => !v)}
          className="bouton-action-pub"
        >
          <MessageCircle size={18} />
          <span>Commenter</span>
        </button>

        <button
          onClick={() => onPartager(publication)}
          className="bouton-action-pub"
        >
          <Share2 size={18} />
          <span>Partager</span>
        </button>
      </div>

      {/* Section Commentaires dépliable */}
      {commentairesOuverts && (
        <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--bordure)" }}>
          {/* Formulaire ajout commentaire */}
          <form
            onSubmit={handleEnvoyerCommentaire}
            style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}
          >
            <input
              type="text"
              className="champ-input"
              value={texteCommentaire}
              onChange={(e) => setTexteCommentaire(e.target.value)}
              placeholder="Écrire un commentaire..."
              style={{ fontSize: "0.9rem", padding: "0.6rem 0.85rem" }}
              maxLength={1000}
            />
            <button
              type="submit"
              className="bouton bouton-primaire"
              disabled={ajouterCom.isPending || !texteCommentaire.trim()}
              style={{ padding: "0.6rem 0.9rem", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <Send size={16} />
            </button>
          </form>

          {/* Liste des commentaires */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {commentaires.length === 0 ? (
              <p style={{ fontSize: "0.85rem", color: "var(--texte-secondaire)", textAlign: "center", margin: "0.5rem 0" }}>
                Soyez le premier à commenter cette publication.
              </p>
            ) : (
              commentaires.map((com) => (
                <div key={com.id} className="ligne-commentaire">
                  <Avatar prenom={com.auteur.prenom} nom={com.auteur.nom} taille={32} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                        {com.auteur.prenom} {com.auteur.nom}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--texte-secondaire)" }}>
                        {dateRelative(com.cree_le)}
                      </span>
                    </div>
                    <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.88rem", color: "#cbd5e1" }}>
                      {com.texte}
                    </p>
                  </div>
                  {com.est_auteur && (
                    <button
                      onClick={() => supprimerCom.mutate(com.id)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--texte-secondaire)",
                        cursor: "pointer",
                        padding: "0.2rem",
                      }}
                      title="Supprimer mon commentaire"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </article>
  );
}
