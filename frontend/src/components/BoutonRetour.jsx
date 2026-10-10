import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

function destinationRepli(pathname) {
  if (pathname === "/inscription" || pathname === "/mot-de-passe-oublie"
    || pathname === "/conditions" || pathname === "/confidentialite") return "/connexion";
  if (pathname === "/verifier-email") return "/inscription";
  if (pathname === "/reinitialiser") return "/mot-de-passe-oublie";
  if (pathname === "/en-attente") return "/connexion";
  if (pathname === "/profil/modifier" || pathname === "/parametres") return "/profil";
  if (pathname.startsWith("/profil/")) return "/annuaire";
  if (pathname.startsWith("/publications/")) return "/fil";
  if (pathname.startsWith("/messages/")) return "/messages";
  return "/fil";
}

export default function BoutonRetour() {
  const location = useLocation();
  const navigate = useNavigate();
  const historique = window.history.state;

  function retourner() {
    if (Number.isInteger(historique?.idx) && historique.idx > 0) {
      navigate(-1);
    } else {
      navigate(destinationRepli(location.pathname), { replace: true });
    }
  }

  return (
    <button
      type="button"
      className="bouton-retour-page"
      onClick={retourner}
      aria-label="Retour à la page précédente"
    >
      <ArrowLeft size={18} aria-hidden="true" />
      <span>Retour</span>
    </button>
  );
}
