import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Briefcase,
  ChevronRight,
  GraduationCap,
  MoreHorizontal,
  Pencil,
  Settings,
  LogOut,
  Building2,
  BookOpen,
  Compass,
  Images,
  Share2,
} from "lucide-react";
import { useMesPublications } from "../api/publications";
import { useProfil } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { ilYa } from "../utils/date";
import { LIBELLES_SITUATION, resumeSituation } from "../utils/situation";
import { Bouton } from "../components/ui";
import { SqListe, SqProfil } from "../components/Squelettes";
import { MesAmis } from "./Amis";
import { partagerProfil } from "../utils/partager";
import { afficherToast } from "../utils/toast";

function MesPublications() {
  const q = useMesPublications();
  if (q.isPending) return <SqListe n={3} />;
  const items = q.data?.pages.flatMap((p) => p.results) ?? [];

  if (!items.length) {
    return (
      <div className="carte-vide-profil">
        <p style={{ margin: 0, fontWeight: 600 }}>Vous n'avez aucune publication pour le moment.</p>
        <Link className="lien-creer-pub-profil" to="/publier">
          Écrire une publication
        </Link>
      </div>
    );
  }

  return (
    <div>
      <ul className="liste-publications-profil">
        {items.map((p) => (
          <li key={p.id}>
            <Link
              to={p.statut === "brouillon" ? `/publier/${p.id}` : `/publications/${p.id}`}
              className="ligne-publication-profil"
            >
              {p.image ? (
                <img
                  src={p.image.mini ?? p.image.src}
                  alt=""
                  className="vignette-publication-profil"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="vignette-placeholder-profil">
                  <BookOpen size={24} color="#8b949e" />
                </div>
              )}
              <div className="infos-publication-profil">
                <strong className="titre-publication-profil">{p.titre}</strong>
                <span className="date-publication-profil">{ilYa(p.cree_le)}</span>
              </div>
              {p.statut === "brouillon" && (
                <span className="badge-statut-brouillon">Brouillon</span>
              )}
              {p.statut === "programmee" && (
                <span className="badge-statut-brouillon">Programmée</span>
              )}
              <ChevronRight size={18} className="chevron-publication-profil" />
            </Link>
          </li>
        ))}
      </ul>
      {q.hasNextPage && (
        <Bouton
          secondaire
          chargement={q.isFetchingNextPage}
          onClick={() => q.fetchNextPage()}
          style={{ marginTop: "1rem" }}
        >
          Voir plus
        </Bouton>
      )}
    </div>
  );
}

export default function MonProfil() {
  const { deconnexion, utilisateur } = useAuth();
  const navigate = useNavigate();
  const { data } = useProfil();
  const [onglet, setOnglet] = useState("publications");
  const [menu, setMenu] = useState(false);

  if (!data) return <SqProfil />;

  const resume = resumeSituation(data.situation);
  const type = data.situation?.type;
  const poste = data.situation?.poste;
  const entreprise = data.situation?.entreprise;
  const etablissement = data.situation?.etablissement;
  const diplome = data.situation?.diplome;

  const texteSituation =
    type === "emploi" && poste && entreprise
      ? `${poste} chez ${entreprise}`
      : type === "etudes" && diplome && etablissement
      ? `${diplome} · ${etablissement}`
      : resume ?? "Non renseignée";

  async function partagerMonProfil() {
    const resultat = await partagerProfil({ ...data, id: utilisateur.id });
    if (resultat === "copie") afficherToast("Lien du profil copié.", "succes");
  }

  return (
    <div className="page-mon-profil">
      {/* 1. En-tête : Titre + Bouton Options */}
      <div className="entete-mon-profil">
        <h1 className="titre-mon-profil">Mon profil</h1>
        <div style={{ position: "relative" }}>
          <button
            className="bouton-options-profil"
            aria-label="Plus d'options"
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
          >
            <MoreHorizontal size={20} />
          </button>
          {menu && (
            <div className="menu-deroulant-profil">
              <button
                type="button"
                className="item-menu-profil"
                onClick={() => {
                  setMenu(false);
                  navigate("/parametres");
                }}
              >
                <Settings size={16} />
                <span>Paramètres</span>
              </button>
              <button
                type="button"
                className="item-menu-profil item-menu-danger"
                onClick={() => {
                  setMenu(false);
                  deconnexion();
                }}
              >
                <LogOut size={16} />
                <span>Se déconnecter</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Hero Card Photo avec overlay dark et badge Bakhita */}
      <div className="carte-hero-profil">
        {data.photo ? (
          <img
            src={data.photo}
            alt={`${data.prenom} ${data.nom}`}
            className="image-hero-profil"
            loading="lazy"
          />
        ) : (
          <div className="placeholder-hero-profil">
            <span>{`${data.prenom?.[0] ?? ""}${data.nom?.[0] ?? ""}`.toUpperCase()}</span>
          </div>
        )}

        {/* Badge Bakhita en haut à droite */}
        <div className="badge-hero-bakhita">
          <GraduationCap size={15} />
          <span>Bakhita</span>
        </div>

        {/* Dégradé et infos superposées en bas */}
        <div className="overlay-hero-profil">
          <h2 className="nom-hero-profil">
            {data.prenom} {data.nom}
          </h2>
          <p className="sous-titre-hero-profil">
            {data.statut === "ancien" ? "Ancienne élève" : "Élève"}
            {data.annee_sortie ? ` • promo ${data.annee_sortie}` : ""}
          </p>
          {data.badges?.length > 0 && (
            <div className="profil-badges">
              {data.badges.map((badge) => <span key={badge.type}>{badge.libelle}</span>)}
            </div>
          )}
          {(poste || diplome || resume) && (
            <p className="poste-hero-profil">
              {poste || diplome || resume}
            </p>
          )}
        </div>
      </div>
      <Link
        to="/profil/galerie"
        className="puce"
        style={{ display: "inline-flex", alignItems: "center", gap: ".5rem", margin: "1rem 0" }}
      >
        <Images size={18} /> Galerie ({data.galerie?.length ?? 0})
      </Link>
      <button type="button" className="puce" onClick={partagerMonProfil}>
        <Share2 size={16} /> Partager mon profil
      </button>

      {/* 3. Bouton Modifier le profil avec bordure dorée/ambrée */}
      <Link to="/profil/modifier" className="bouton-modifier-profil-dore">
        <Pencil size={18} className="icone-crayon-dore" />
        <span>Modifier le profil</span>
      </Link>

      {/* 4. Section Situation actuelle */}
      <section className="carte-situation-profil" aria-label="Situation actuelle">
        <div className="entete-situation-profil">
          <h3 className="titre-situation-profil">Situation actuelle</h3>
          <div className="actions-type-situation">
            <span className="icone-briefcase-subtile">
              <Briefcase size={16} />
            </span>
            {type && type !== "autre" && (
              <span className="badge-type-situation">
                {LIBELLES_SITUATION[type]}
              </span>
            )}
          </div>
        </div>

        <div className="corps-situation-profil">
          <div className="boite-logo-situation">
            {type === "emploi" ? (
              <Building2 size={22} color="#10b981" />
            ) : type === "etudes" ? (
              <BookOpen size={22} color="#06b6d4" />
            ) : (
              <Compass size={22} color="#f59e0b" />
            )}
          </div>
          <span className="texte-situation-profil">{texteSituation}</span>
          <Link
            to="/profil/modifier?section=situation"
            className="bouton-modifier-situation"
          >
            Modifier
          </Link>
        </div>
      </section>

      {/* 5. Onglets segmentés : Mes publications / Mes amis */}
      <div className="onglets-segmentes-profil" role="tablist">
        <button
          type="button"
          role="tab"
          className={`onglet-segmente ${onglet === "publications" ? "actif" : ""}`}
          aria-selected={onglet === "publications"}
          onClick={() => setOnglet("publications")}
        >
          Mes publications
        </button>
        <button
          type="button"
          role="tab"
          className={`onglet-segmente ${onglet === "amis" ? "actif" : ""}`}
          aria-selected={onglet === "amis"}
          onClick={() => setOnglet("amis")}
        >
          Mes amis
        </button>
      </div>

      {/* 6. Contenu de l'onglet actif */}
      {onglet === "publications" ? <MesPublications /> : <MesAmis />}
    </div>
  );
}
