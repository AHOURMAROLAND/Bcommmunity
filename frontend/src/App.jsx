import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { useProfil } from "./api/hooks";
import { Chargement } from "./components/ui";

const Connexion = lazy(() => import("./pages/Connexion"));
const Inscription = lazy(() => import("./pages/Inscription"));
const EnAttente = lazy(() => import("./pages/EnAttente"));
const Onboarding = lazy(() => import("./pages/Onboarding"));

function Invite({ children }) {
  const { utilisateur, chargement } = useAuth();
  if (chargement) return <Chargement />;
  return utilisateur ? <Navigate to="/fil" replace /> : children;
}

function Connecte({ children }) {
  const { utilisateur, chargement } = useAuth();
  if (chargement) return <Chargement />;
  return utilisateur ? children : <Navigate to="/connexion" replace />;
}

function Portail({ children }) {
  const { utilisateur } = useAuth();
  const profil = useProfil(!!utilisateur);
  if (profil.isPending) return <Chargement />;
  if (profil.data && !profil.data.onboarding_termine) return <Navigate to="/onboarding" replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<Chargement />}>
      <Routes>
        <Route path="/connexion" element={<Invite><Connexion /></Invite>} />
        <Route path="/inscription" element={<Invite><Inscription /></Invite>} />
        <Route path="/en-attente" element={<EnAttente />} />
        <Route path="/onboarding" element={<Connecte><Onboarding /></Connecte>} />
        <Route path="/fil" element={
          <Connecte><Portail><div className="page"><h1>Fil</h1></div></Portail></Connecte>} />
        <Route path="*" element={<Navigate to="/fil" replace />} />
      </Routes>
    </Suspense>
  );
}
