import { Suspense } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Home, LogOut, MessageCircle, Plus, User, UserCheck, Users } from "lucide-react";
import { SqRoute } from "./Squelettes";
import { useCompteurs } from "../api/amis";
import { useProfil } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import Avatar from "./Avatar";

const ONGLETS = [
  { to: "/fil", label: "Fil", Icone: Home },
  { to: "/annuaire", label: "Annuaire", Icone: Users },
  { to: "/amis", label: "Amis", Icone: UserCheck },
  { to: "/messages", label: "Messages", Icone: MessageCircle },
  { to: "/profil", label: "Profil", Icone: User },
];

export default function Coque() {
  const { utilisateur, deconnexion } = useAuth();
  const { data: profil } = useProfil(!!utilisateur);
  const { data: compteurs } = useCompteurs();
  const nb = compteurs?.demandes_recues ?? 0;

  const prenom = profil?.prenom ?? utilisateur?.prenom;
  const nom = profil?.nom ?? utilisateur?.nom;
  const photo = profil?.photo_mini ?? profil?.photo;
  const statut = profil?.statut ?? utilisateur?.statut;

  return (
    <div className="coque">
      {/* Barre latérale dédiée Desktop */}
      <aside className="barre-laterale" aria-label="Navigation principale">
        <Link to="/fil" className="sidebar-marque">
          <span className="titre-bakhita">Bakhita</span>
          <span className="titre-community">Community</span>
        </Link>

        <nav className="sidebar-nav">
          {ONGLETS.map(({ to, label, Icone }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/profil"}
              className={({ isActive }) => `sidebar-lien${isActive ? " active" : ""}`}
            >
              <Icone size={22} aria-hidden="true" />
              <span className="sidebar-label">{label}</span>
              {label === "Amis" && nb > 0 && (
                <span className="badge-nb-sidebar" aria-label={`${nb} demandes`}>
                  {nb}
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

        <div className="sidebar-pied">
          <Link to="/profil" className="sidebar-utilisateur" title="Voir mon profil">
            <Avatar prenom={prenom} nom={nom} photo={photo} taille={40} />
            <div className="sidebar-utilisateur-infos">
              <strong>{prenom} {nom}</strong>
              <span className="doux">{statut === "ancien" ? "Ancien élève" : "Élève"}</span>
            </div>
          </Link>
          <button
            type="button"
            className="puce btn-deconnexion-sidebar"
            aria-label="Se déconnecter"
            title="Se déconnecter"
            onClick={deconnexion}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Contenu principal adapté */}
      <main className="contenu">
        <Suspense fallback={<SqRoute />}>
          <Outlet />
        </Suspense>
      </main>

      {/* Barre de navigation inférieure (Mobile uniquement) */}
      <nav className="nav-bas" aria-label="Navigation mobile">
        {ONGLETS.map(({ to, label, Icone }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/profil"}
            className={({ isActive }) => `onglet${isActive ? " active" : ""}`}
          >
            <Icone size={22} aria-hidden="true" />
            <span>{label}</span>
            {label === "Amis" && nb > 0 && (
              <span className="badge-nb" aria-label={`${nb} demandes`}>
                {nb}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
