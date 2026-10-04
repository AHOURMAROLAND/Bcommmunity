import { Suspense } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Bell, Home, LogOut, MessageCircle, Plus, User, UserCheck, Users } from "lucide-react";
import { ChargementEnLigne } from "@/components/ChargementLong";
import { useCompteurs } from "../api/amis";
import { useCompteursDisc } from "../api/discussions";
import { useCompteurNotifs } from "../api/notifications";
import { useProfil } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { useTempsReel } from "../temps-reel/TempsReel";
import Avatar from "./Avatar";
import { SqRoute } from "./Squelettes";

const ONGLETS = [
  { to: "/fil",      label: "Fil",      Icone: Home },
  { to: "/annuaire", label: "Annuaire", Icone: Users },
  { to: "/amis",     label: "Amis",     Icone: UserCheck },
  { to: "/messages", label: "Messages", Icone: MessageCircle },
  { to: "/profil",   label: "Profil",   Icone: User },
];

const ONGLETS_DESKTOP = [
  { to: "/fil",           label: "Fil",           Icone: Home },
  { to: "/annuaire",      label: "Annuaire",      Icone: Users },
  { to: "/amis",          label: "Amis",          Icone: UserCheck },
  { to: "/messages",      label: "Messages",      Icone: MessageCircle },
  { to: "/notifications", label: "Notifications", Icone: Bell },
  { to: "/profil",        label: "Profil",        Icone: User },
];

export default function Coque() {
  const { utilisateur, deconnexion } = useAuth();
  const { data: profil } = useProfil(!!utilisateur);
  const { data: compteursAmis } = useCompteurs();
  const { data: compteursDisc } = useCompteursDisc();
  const { data: compteursNotifs } = useCompteurNotifs();
  const { etat: etatWs } = useTempsReel();

  const nbAmis     = compteursAmis?.demandes_recues ?? 0;
  const nbMessages = (compteursDisc?.invitations ?? 0) + (compteursDisc?.non_lus ?? 0);
  const nbNotifs   = compteursNotifs?.non_lues ?? 0;

  const prenom = profil?.prenom ?? utilisateur?.prenom;
  const nom    = profil?.nom    ?? utilisateur?.nom;
  const photo  = profil?.photo_mini ?? profil?.photo;
  const statut = profil?.statut ?? utilisateur?.statut;

  const badge = { Amis: nbAmis, Messages: nbMessages, Notifications: nbNotifs };

  return (
    <div className="coque">
      {/* ======= Barre laterale Desktop ======= */}
      <aside className="barre-laterale" aria-label="Navigation principale">
        <Link to="/fil" className="sidebar-marque">
          <picture>
            <source srcSet="/icon-dark.jpg" media="(prefers-color-scheme: dark)" />
            <img
              src="/icon-light.jpg"
              alt="Bakhita Community"
              width="40" height="40"
              style={{ borderRadius: "0.6rem", flexShrink: 0 }}
            />
          </picture>
          <span style={{ display: "flex", flexDirection: "column" }}>
            <span className="titre-bakhita">Bakhita</span>
            <span className="titre-community">Community</span>
          </span>
        </Link>

        <nav className="sidebar-nav">
          {ONGLETS_DESKTOP.map(({ to, label, Icone }) => (
            <NavLink
              key={to} to={to} end={to === "/profil"}
              className={({ isActive }) => `sidebar-lien${isActive ? " active" : ""}`}
            >
              <Icone size={22} aria-hidden="true" />
              <span className="sidebar-label">{label}</span>
              {badge[label] > 0 && (
                <span className="badge-nb-sidebar" aria-label={`${badge[label]} nouveaux`}>
                  {badge[label] > 99 ? "99+" : badge[label]}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-action">
          <Link to="/publier" className="btn-publier-sidebar">
            <Plus size={20} aria-hidden="true" />
            <span>Publier</span>
          </Link>
        </div>

        {/* Indicateur de reconnexion WS */}
        <ChargementEnLigne actif={etatWs === "connexion"} delai={3000} label="Reconnexion..." />

        <div className="sidebar-pied">
          <Link to="/profil" className="sidebar-utilisateur" title="Voir mon profil">
            <Avatar prenom={prenom} nom={nom} photo={photo} taille={40} />
            <div className="sidebar-utilisateur-infos">
              <strong>{prenom} {nom}</strong>
              <span className="doux">{statut === "ancien" ? "Ancien eleve" : "Eleve"}</span>
            </div>
          </Link>
          <button
            type="button"
            className="puce btn-deconnexion-sidebar"
            aria-label="Se deconnecter"
            title="Se deconnecter"
            onClick={deconnexion}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* ======= Contenu principal ======= */}
      <main className="contenu">
        <Suspense fallback={<SqRoute />}>
          <Outlet />
        </Suspense>
      </main>

      {/* ======= Navigation inferieure Mobile ======= */}
      <nav className="nav-bas" aria-label="Navigation mobile">
        {ONGLETS.map(({ to, label, Icone }) => (
          <NavLink
            key={to} to={to} end={to === "/profil"}
            className={({ isActive }) => `onglet${isActive ? " active" : ""}`}
          >
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Icone size={22} aria-hidden="true" />
              {badge[label] > 0 && (
                <span className="badge-nb" aria-label={`${badge[label]} nouveaux`}>
                  {badge[label] > 99 ? "99+" : badge[label]}
                </span>
              )}
            </span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
