import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { useProfil } from "./api/hooks";
import { SqCentree, SqRoute } from "./components/Squelettes";
import Coque from "./components/Coque";

const Connexion = lazy(() => import("./pages/Connexion"));
const Inscription = lazy(() => import("./pages/Inscription"));
const MotDePasseOublie = lazy(() => import("./pages/MotDePasseOublie"));
const Reinitialiser = lazy(() => import("./pages/Reinitialiser"));
const EnAttente = lazy(() => import("./pages/EnAttente"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Fil = lazy(() => import("./pages/Fil"));
const Annuaire = lazy(() => import("./pages/Annuaire"));
const ProfilPublic = lazy(() => import("./pages/ProfilPublic"));
const Amis = lazy(() => import("./pages/Amis"));
const MonProfil = lazy(() => import("./pages/MonProfil"));
const ModifierProfil = lazy(() => import("./pages/ModifierProfil"));
const PublicationPage = lazy(() => import("./pages/PublicationPage"));
const Publier = lazy(() => import("./pages/Publier"));
const Bientot = lazy(() => import("./pages/Bientot"));

function Invite({ children }) {
  const { utilisateur, chargement } = useAuth();
  if (chargement) return <SqCentree />;
  return utilisateur ? <Navigate to="/fil" replace /> : children;
}

function Connecte({ children }) {
  const { utilisateur, chargement } = useAuth();
  if (chargement) return <SqRoute />;
  return utilisateur ? children : <Navigate to="/connexion" replace />;
}

function Portail({ children }) {
  const { utilisateur } = useAuth();
  const profil = useProfil(!!utilisateur);
  if (profil.isPending) return <SqRoute />;
  if (profil.data && !profil.data.onboarding_termine) return <Navigate to="/onboarding" replace />;
  return children;
}

function Plein() {
  return <main className="contenu"><Outlet /></main>;
}

export default function App() {
  return (
    <Suspense fallback={<SqRoute />}>
      <Routes>
        <Route path="/connexion" element={<Invite><Connexion /></Invite>} />
        <Route path="/inscription" element={<Invite><Inscription /></Invite>} />
        <Route path="/mot-de-passe-oublie" element={<Invite><MotDePasseOublie /></Invite>} />
        <Route path="/reinitialiser" element={<Reinitialiser />} />
        <Route path="/en-attente" element={<EnAttente />} />
        <Route path="/onboarding" element={<Connecte><Onboarding /></Connecte>} />

        <Route element={<Connecte><Portail><Plein /></Portail></Connecte>}>
          <Route path="/publier" element={<Publier />} />
          <Route path="/publier/:id" element={<Publier />} />
        </Route>

        <Route element={<Connecte><Portail><Coque /></Portail></Connecte>}>
          <Route path="/fil" element={<Fil />} />
          <Route path="/publications/:id" element={<PublicationPage />} />
          <Route path="/annuaire" element={<Annuaire />} />
          <Route path="/amis" element={<Amis />} />
          <Route path="/messages" element={<Bientot titre="Messages" jalon="M4" />} />
          <Route path="/profil" element={<MonProfil />} />
          <Route path="/profil/modifier" element={<ModifierProfil />} />
          <Route path="/profil/:id" element={<ProfilPublic />} />
        </Route>

        <Route path="*" element={<Navigate to="/fil" replace />} />
      </Routes>
    </Suspense>
  );
}
