import { Link, useLocation } from "react-router-dom";
import { Marque } from "../components/ui";

const formatDate = (iso) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(new Date(iso));

export default function EnAttente() {
  const { state } = useLocation();
  const code = state?.code ?? "non_valide";

  const contenu = {
    non_valide: { titre: "Compte en attente de validation",
      texte: "Votre inscription est bien reçue. L'école doit la valider avant que vous puissiez vous connecter." },
    suspendu: { titre: "Compte suspendu",
      texte: state?.fin ? `Votre compte est suspendu jusqu'au ${formatDate(state.fin)}. L'accès sera rétabli automatiquement.`
                        : "Votre compte est suspendu temporairement." },
    banni: { titre: "Accès retiré",
      texte: "L'accès à Bakhita Community a été retiré pour ce compte. Contactez l'école pour plus d'informations." },
  }[code] ?? { titre: "Accès indisponible", texte: "Votre compte ne peut pas être utilisé pour le moment." };

  return (
    <main className="page"><div className="boite">
      <Marque />
      <div className="carte" role="status">
        <h1 style={{ marginTop: 0, fontSize: "1.3rem" }}>{contenu.titre}</h1>
        <p>{contenu.texte}</p>
        <Link className="lien" to="/connexion">Retour à la connexion</Link>
      </div>
    </div></main>
  );
}
