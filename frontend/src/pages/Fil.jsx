import { useState } from "react";
import { Bell, ChevronRight, Loader2, Plus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { useSuggestions } from "../api/amis";
import { usePublications } from "../api/publications";
import { useAuth } from "../auth/AuthContext";
import { Avatar } from "../components/Avatar";
import { CartePublication } from "../components/CartePublication";
import { ModalCreerPublication } from "../components/ModalCreerPublication";
import { ModalPartage } from "../components/ModalPartage";

export default function Fil() {
  const { utilisateur } = useAuth();
  const [modalCreationOuverte, setModalCreationOuverte] = useState(false);
  const [publicationAEditer, setPublicationAEditer] = useState(null);
  const [publicationAPartager, setPublicationAPartager] = useState(null);

  // Données du fil
  const {
    data: donneesPub,
    isLoading: chargementPub,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePublications();

  // Suggestions de camarades pour le carrousel horizontal
  const { data: donneesSuggestions } = useSuggestions();
  const suggestions = donneesSuggestions?.pages?.[0]?.results || [];

  const publications = donneesPub?.pages?.flatMap((p) => p.results) || [];

  const ouvrirEdition = (pub) => {
    setPublicationAEditer(pub);
    setModalCreationOuverte(true);
  };

  const fermerModalCreation = () => {
    setModalCreationOuverte(false);
    setPublicationAEditer(null);
  };

  return (
    <div className="page-fil" style={{ paddingBottom: "5rem" }}>
      {/* En-tête supérieur */}
      <header className="fil-entete">
        <h1 style={{ fontSize: "1.65rem", fontWeight: 700, margin: 0 }}>Fil</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
          <button
            aria-label="Notifications"
            className="bouton-icone"
            style={{ position: "relative" }}
          >
            <Bell size={22} />
            <span
              style={{
                position: "absolute",
                top: "4px",
                right: "4px",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "var(--accent, #f59e0b)",
              }}
            />
          </button>
          <Link to="/annuaire" className="bouton-icone" aria-label="Recherche">
            <Search size={22} />
          </Link>
        </div>
      </header>

      {/* Bannière "Écrire une publication" */}
      <div
        className="banniere-ecrire"
        onClick={() => setModalCreationOuverte(true)}
      >
        <Avatar prenom={utilisateur?.prenom} nom={utilisateur?.nom} taille={44} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: "0.98rem" }}>Écrire une publication</div>
          <div style={{ fontSize: "0.82rem", color: "var(--texte-secondaire)" }}>
            Partagez des nouvelles avec votre communauté
          </div>
        </div>
        <button
          className="bouton-plus"
          aria-label="Nouvelle publication"
          onClick={(e) => {
            e.stopPropagation();
            setModalCreationOuverte(true);
          }}
        >
          <Plus size={22} />
        </button>
      </div>

      {/* Section Suggestions de camarades (carrousel horizontal) */}
      {suggestions.length > 0 && (
        <section className="section-suggestions">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
            <h2 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>Suggestions de camarades</h2>
            <Link
              to="/annuaire"
              style={{
                fontSize: "0.85rem",
                color: "var(--accent, #f59e0b)",
                textDecoration: "none",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
              }}
            >
              Tout voir <ChevronRight size={16} />
            </Link>
          </div>

          <div className="carrousel-suggestions">
            {suggestions.slice(0, 10).map((sug) => (
              <Link
                key={sug.id}
                to={`/profil/${sug.id}`}
                className="carte-suggestion-ronde"
              >
                <div className="anneau-avatar">
                  <Avatar prenom={sug.prenom} nom={sug.nom} taille={58} />
                </div>
                <span className="nom-suggestion">
                  {sug.prenom} {sug.nom ? `${sug.nom.slice(0, 1)}.` : ""}
                </span>
                {sug.classes_en_commun ? (
                  <span className="badge-commun">
                    {sug.classes_en_commun} en commun
                  </span>
                ) : sug.annee_sortie ? (
                  <span className="badge-commun">Promo {sug.annee_sortie}</span>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Flux de publications */}
      <main style={{ marginTop: "1.25rem" }}>
        {chargementPub ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
            <Loader2 size={32} className="rotation" color="var(--primaire)" />
          </div>
        ) : publications.length === 0 ? (
          <div className="carte" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              Aucune publication pour l'instant
            </h3>
            <p style={{ color: "var(--texte-secondaire)", fontSize: "0.9rem", marginBottom: "1.25rem" }}>
              Soyez le premier à partager une actualité, une opportunité ou un souvenir avec vos camarades.
            </p>
            <button
              onClick={() => setModalCreationOuverte(true)}
              className="bouton bouton-primaire"
              style={{ margin: "0 auto" }}
            >
              Créer la première publication
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {publications.map((pub) => (
              <CartePublication
                key={pub.id}
                publication={pub}
                onModifier={ouvrirEdition}
                onPartager={(p) => setPublicationAPartager(p)}
              />
            ))}

            {hasNextPage && (
              <div style={{ textAlign: "center", marginTop: "1rem" }}>
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="bouton bouton-secondaire"
                  style={{ width: "100%", maxWidth: "280px" }}
                >
                  {isFetchingNextPage ? "Chargement..." : "Afficher plus de publications"}
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modale de création / édition */}
      {modalCreationOuverte && (
        <ModalCreerPublication
          publication={publicationAEditer}
          onClose={fermerModalCreation}
        />
      )}

      {/* Modale de partage */}
      {publicationAPartager && (
        <ModalPartage
          publication={publicationAPartager}
          onClose={() => setPublicationAPartager(null)}
        />
      )}
    </div>
  );
}
