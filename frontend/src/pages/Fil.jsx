import { Link, useNavigate } from "react-router-dom";
import { Bell, ChevronRight, Plus, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useFil } from "../api/publications";
import { useSuggestions, useAnnuaire } from "../api/amis";
import { useProfil } from "../api/hooks";
import { useCompteurNotifs } from "../api/notifications";
import { useTempsReel } from "../temps-reel/TempsReel";
import useSentinelle from "../hooks/useSentinelle";
import Avatar from "../components/Avatar";
import PublicationCard from "../components/PublicationCard";
import { SqCartes, SqCamarades } from "../components/Squelettes";

export default function Fil() {
  const { data: profil } = useProfil();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fil = useFil();
  const sugg = useSuggestions();
  const annuaire = useAnnuaire({});
  const nbNotifs = useCompteurNotifs().data?.non_lues ?? 0;
  const { nouvelles, effacerNouvelles } = useTempsReel() ?? { nouvelles: 0, effacerNouvelles: () => {} };
  const items = fil.data?.pages.flatMap((p) => p.results) ?? [];

  const cartesSugg = sugg.data?.pages[0]?.results ?? [];
  const cartesFallback = (annuaire.data?.pages[0]?.results ?? [])
    .filter((u) => u.id !== profil?.id && u.relation !== "ami")
    .slice(0, 10);
  const cartes = cartesSugg.length > 0 ? cartesSugg : cartesFallback;
  const sentinelle = useSentinelle(() => fil.fetchNextPage(), !!fil.hasNextPage && !fil.isFetchingNextPage);

  return (
    <div className="fil-conteneur">
      {/* En-tête : Titre Fil + Icônes Cloche & Recherche */}
      <div className="fil-entete">
        <h1 className="fil-titre">Fil</h1>
        <div className="fil-entete-actions">
          <button
            className="bouton-icone-fil"
            aria-label={`Notifications${nbNotifs ? `, ${nbNotifs} non lues` : ""}`}
            onClick={() => navigate("/notifications")}
          >
            <div style={{ position: "relative", display: "inline-flex" }}>
              <Bell size={20} />
              {nbNotifs > 0 && <span className="point-notif-orange" />}
            </div>
          </button>
          <button
            className="bouton-icone-fil"
            aria-label="Rechercher dans l'annuaire"
            onClick={() => navigate("/annuaire")}
          >
            <Search size={20} />
          </button>
        </div>
      </div>

      {nouvelles > 0 && (
        <button
          type="button"
          className="bandeau-nouvelles-fil"
          onClick={() => {
            qc.invalidateQueries({ queryKey: ["fil"] });
            effacerNouvelles();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          {nouvelles} nouvelle{nouvelles > 1 ? "s" : ""} publication{nouvelles > 1 ? "s" : ""}
        </button>
      )}

      {/* Carte Écrire une publication */}
      <Link to="/publier" className="carte-composer-fil">
        <Avatar prenom={profil?.prenom} nom={profil?.nom} photo={profil?.photo_mini ?? profil?.photo} taille={44} />
        <div className="composer-textes">
          <strong className="composer-titre">Écrire une publication</strong>
          <span className="composer-sous-titre">Partagez des nouvelles avec votre classe</span>
        </div>
        <div className="bouton-plus-orange" aria-hidden="true">
          <Plus size={22} strokeWidth={2.6} />
        </div>
      </Link>

      {/* Suggestions de camarades (carrousel horizontal) */}
      {sugg.isPending && cartes.length === 0 ? (
        <section aria-label="Suggestions de camarades" className="section-suggestions-fil">
          <div className="suggestions-entete">
            <h2 className="suggestions-titre">Suggestions de camarades</h2>
          </div>
          <SqCamarades />
        </section>
      ) : cartes.length > 0 ? (
        <section aria-label="Suggestions de camarades" className="section-suggestions-fil">
          <div className="suggestions-entete">
            <h2 className="suggestions-titre">Suggestions de camarades</h2>
            <Link className="lien-tout-voir" to="/annuaire">
              Tout voir <ChevronRight size={15} style={{ display: "inline-block", verticalAlign: "middle" }} />
            </Link>
          </div>
          <div className="carrousel-camarades">
            {cartes.map((c) => (
              <Link key={c.id} to={`/profil/${c.id}`} className="item-camarade">
                <div className="anneau-dore-camarade">
                  <Avatar prenom={c.prenom} nom={c.nom} photo={c.photo} taille={60} />
                </div>
                <span className="nom-camarade">{c.prenom} {c.nom?.[0] ? `${c.nom[0]}.` : ""}</span>
                {c.classes_communes > 0 && (
                  <span className="badge-classes-cyan">
                    {c.classes_communes} classe{c.classes_communes > 1 ? "s" : ""} en commun
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Publications */}
      <div className="liste-publications-fil">
        {fil.isPending ? (
          <SqCartes />
        ) : fil.isError ? (
          <p role="alert" className="erreur">Impossible de charger le fil d'actualités. Réessayez.</p>
        ) : items.length === 0 ? (
          <div className="carte" style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
            <p style={{ fontWeight: 600, fontSize: "1.05rem", margin: "0 0 0.5rem" }}>Bienvenue sur Bakhita Community !</p>
            <p className="doux" style={{ margin: 0 }}>Aucune publication pour le moment. Soyez le premier à partager des nouvelles.</p>
          </div>
        ) : (
          <>
            {items.map((p) => <PublicationCard key={p.id} p={p} />)}
            <div ref={sentinelle} style={{ height: 1 }} />
            {fil.isFetchingNextPage && <SqCartes n={1} />}
          </>
        )}
      </div>
    </div>
  );
}
