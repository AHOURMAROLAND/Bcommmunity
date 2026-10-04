import { Link } from "react-router-dom";
import { Marque } from "../components/ui";

export default function PageSuppression() {
  const contact = import.meta.env.VITE_CONTACT_EMAIL;
  return (
    <main className="page"><div className="boite">
      <Marque />
      <div className="carte">
        <h1 style={{ marginTop: 0, fontSize: "1.3rem" }}>Supprimer mon compte</h1>
        <p>Connectez-vous, ouvrez <strong>Profil</strong>, puis <strong>Paramètres</strong>, puis <strong>Supprimer mon compte</strong>.</p>
        <p>Votre profil, vos publications, vos commentaires, vos messages et vos photos sont supprimés définitivement.</p>
        {contact && <p>Vous ne pouvez plus vous connecter ? Écrivez à <a className="lien" href={`mailto:${contact}`}>{contact}</a> depuis l'adresse de votre compte.</p>}
        <Link className="lien" to="/connexion">Se connecter</Link>
      </div>
    </div></main>
  );
}
