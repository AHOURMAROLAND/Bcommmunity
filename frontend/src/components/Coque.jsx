import { Suspense } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Home, MessageCircle, User, UserCheck, Users } from "lucide-react";
import { SqRoute } from "./Squelettes";
import { useCompteurs } from "../api/amis";

const ONGLETS = [
  { to: "/fil", label: "Fil", Icone: Home },
  { to: "/annuaire", label: "Annuaire", Icone: Users },
  { to: "/amis", label: "Amis", Icone: UserCheck },
  { to: "/messages", label: "Messages", Icone: MessageCircle },
  { to: "/profil", label: "Profil", Icone: User },
];

export default function Coque() {
  const { data } = useCompteurs();
  const nb = data?.demandes_recues ?? 0;
  return (
    <div className="coque">
      <main className="contenu"><Suspense fallback={<SqRoute />}><Outlet /></Suspense></main>
      <nav className="nav-bas" aria-label="Navigation principale">
        {ONGLETS.map(({ to, label, Icone }) => (
          <NavLink key={to} to={to} end={to === "/profil"}
            className={({ isActive }) => `onglet${isActive ? " active" : ""}`}>
            <Icone size={22} aria-hidden="true" />
            <span>{label}</span>
            {label === "Amis" && nb > 0 && <span className="badge-nb" aria-label={`${nb} demandes`}>{nb}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
