import { useNavigate, useLocation } from "react-router-dom";
import { Ban, FileText, Hourglass, Pause } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { dateCourte } from "../utils/date";
import { Bouton } from "../components/ui";

export default function EnAttente() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { deconnexion } = useAuth();
  const code = state?.code ?? "non_valide";

  const variantes = {
    non_valide: { Icone: Hourglass, titre: "Compte en attente de validation", sous: null,
      texte: "Votre inscription est bien reçue. L'école doit la valider avant que vous puissiez vous connecter." },
    suspendu: { Icone: Pause, titre: "Compte suspendu", sous: state?.fin ? `Jusqu'au ${dateCourte(state.fin)}` : null,
      texte: "Votre accès sera rétabli automatiquement à cette date." },
    banni: { Icone: Ban, titre: "Accès retiré", sous: null,
      texte: "L'accès à Bakhita Community a été retiré pour ce compte. Contactez l'école pour plus d'informations." },
  };
  const v = variantes[code] ?? variantes.non_valide;

  async function sortir() {
    try { await deconnexion(); } finally { navigate("/connexion", { replace: true }); }
  }

  return (
    <main className="page" style={{ justifyContent: "center", textAlign: "center" }}>
      <div className="boite">
        <div className="halo" aria-hidden="true"><v.Icone size={56} /></div>
        <h1 style={{ margin: "1.5rem 0 0.25rem" }}>{v.titre}</h1>
        {v.sous && <p className="doux" style={{ fontSize: "1.1rem", margin: 0 }}>{v.sous}</p>}
        {state?.motif && code !== "non_valide" && (
          <div className="carte" style={{ display: "flex", gap: "0.75rem", textAlign: "left", margin: "1.5rem 0", alignItems: "center" }}>
            <FileText size={28} aria-hidden="true" />
            <div><div className="doux" style={{ fontSize: "0.85rem" }}>Motif</div><div>{state.motif}</div></div>
          </div>
        )}
        <p className="doux" style={{ margin: "1.5rem 0" }}>{v.texte}</p>
        <Bouton secondaire onClick={sortir}>Se déconnecter</Bouton>
      </div>
    </main>
  );
}
