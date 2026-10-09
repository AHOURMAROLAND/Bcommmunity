import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { useProfil } from "./api/hooks";
import { SqCentree, SqRoute } from "./components/Squelettes";
import Coque from "./components/Coque";
import BoutonRetour from "./components/BoutonRetour";
import { BandeauHorsLigne, BandeauSynchronisation } from "./components/Bandeaux";
import PontNatif from "./components/PontNatif";
import ToastViewport from "./components/ToastViewport";
import BoutonSupport from "./components/BoutonSupport";
import { TempsReelProvider } from "./temps-reel/TempsReel";

const Connexion       = lazy(() => import("./pages/Connexion"));
const Inscription     = lazy(() => import("./pages/Inscription"));
const MotDePasseOublie = lazy(() => import("./pages/MotDePasseOublie"));
const Reinitialiser   = lazy(() => import("./pages/Reinitialiser"));
const VerifierOTP     = lazy(() => import("./pages/VerifierOTP"));
const EnAttente       = lazy(() => import("./pages/EnAttente"));
const Onboarding      = lazy(() => import("./pages/Onboarding"));
const PageSuppression = lazy(() => import("./pages/PageSuppression"));
const Fil             = lazy(() => import("./pages/Fil"));
const Annuaire        = lazy(() => import("./pages/Annuaire"));
const ProfilPublic    = lazy(() => import("./pages/ProfilPublic"));
const Amis            = lazy(() => import("./pages/Amis"));
const Messages        = lazy(() => import("./pages/Messages"));
const Conversation    = lazy(() => import("./pages/Conversation"));
const MonProfil       = lazy(() => import("./pages/MonProfil"));
const ModifierProfil  = lazy(() => import("./pages/ModifierProfil"));
const PublicationPage = lazy(() => import("./pages/PublicationPage"));
const Publier         = lazy(() => import("./pages/Publier"));
const Notifications   = lazy(() => import("./pages/Notifications"));
const Parametres      = lazy(() => import("./pages/Parametres"));
const Galerie         = lazy(() => import("./pages/Galerie"));
const Recherche       = lazy(() => import("./pages/Recherche"));

function Invite({ children }) {
  const { utilisateur, chargement } = useAuth();
  if (chargement) return <SqCentree />;
  return utilisateur ? <Navigate to="/fil" replace /> : children;
}

function PageAvecRetour({ children }) {
  return (
    <>
      <div className="retour-publique"><BoutonRetour /></div>
      {children}
    </>
  );
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
  const location = useLocation();
  return (
    <main className="contenu">
      <BandeauHorsLigne />
      <BandeauSynchronisation />
      <BoutonSupport />
      {!location.pathname.startsWith("/messages/") && <BoutonRetour />}
      <Outlet />
    </main>
  );
}

export default function App() {
  return (
    <>
      <PontNatif />
      <ToastViewport />
      <Suspense fallback={<SqRoute />}>
        <Routes>
          {/* Pages publiques */}
          <Route path="/connexion"         element={<Invite><Connexion /></Invite>} />
          <Route path="/inscription"       element={<Invite><PageAvecRetour><Inscription /></PageAvecRetour></Invite>} />
          <Route path="/verifier-email"    element={<Invite><PageAvecRetour><VerifierOTP /></PageAvecRetour></Invite>} />
          <Route path="/mot-de-passe-oublie" element={<Invite><PageAvecRetour><MotDePasseOublie /></PageAvecRetour></Invite>} />
          <Route path="/reinitialiser"     element={<PageAvecRetour><Reinitialiser /></PageAvecRetour>} />
          <Route path="/en-attente"        element={<PageAvecRetour><EnAttente /></PageAvecRetour>} />
          <Route path="/suppression-compte" element={<PageAvecRetour><PageSuppression /></PageAvecRetour>} />
          <Route path="/onboarding"        element={<Connecte><Onboarding /></Connecte>} />

          {/* Pages connectees sans Coque (plein ecran) */}
          <Route element={
            <Connecte>
              <Portail>
                <TempsReelProvider>
                  <Plein />
                </TempsReelProvider>
              </Portail>
            </Connecte>
          }>
            <Route path="/publier"     element={<Publier />} />
            <Route path="/publier/:id" element={<Publier />} />
            {/* Conversation : plein ecran sur mobile */}
            <Route path="/messages/:id" element={<Conversation />} />
          </Route>

          {/* Pages connectees avec Coque (nav) */}
          <Route element={
            <Connecte>
              <Portail>
                <TempsReelProvider>
                  <Coque />
                </TempsReelProvider>
              </Portail>
            </Connecte>
          }>
            <Route path="/fil"              element={<Fil />} />
            <Route path="/publications/:id" element={<PublicationPage />} />
            <Route path="/annuaire"         element={<Annuaire />} />
            <Route path="/recherche"        element={<Recherche />} />
            <Route path="/amis"             element={<Amis />} />
            <Route path="/messages"         element={<Messages />} />
            <Route path="/profil"           element={<MonProfil />} />
            <Route path="/profil/galerie"   element={<Galerie />} />
            <Route path="/profil/:id/galerie" element={<Galerie />} />
            <Route path="/profil/modifier"  element={<ModifierProfil />} />
            <Route path="/profil/:id"       element={<ProfilPublic />} />
            <Route path="/notifications"    element={<Notifications />} />
            <Route path="/parametres"       element={<Parametres />} />
          </Route>

          <Route path="*" element={<Navigate to="/fil" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
