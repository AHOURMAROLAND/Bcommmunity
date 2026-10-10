import { Link } from "react-router-dom";
import { Marque } from "../components/ui";
import { VERSION_APPLICATION } from "../utils/version";

export default function PageLegale({ titre, children }) {
  const valeur = import.meta.env.VITE_CONTACT_EMAIL?.trim();
  const contact = valeur && !/(\.example|\.invalid|@example\.com)$/i.test(valeur) ? valeur : "";

  return (
    <main className="page">
      <div className="boite">
        <Marque sous={`Informations légales · version ${VERSION_APPLICATION}`} />
        <article className="carte">
          <h1 style={{ marginTop: 0, fontSize: "1.5rem" }}>{titre}</h1>
          <p className="doux">Version du document : 1.00</p>
          {children}
          <hr />
          <p>
            Une question ou une demande relative à vos données ?{" "}
            <Link className="lien" to="/connexion">Connectez-vous pour contacter l’assistance intégrée</Link>.
            {" "}Vous pouvez aussi écrire à{" "}
            {contact ? <a className="lien" href={`mailto:${contact}`}>{contact}</a> : "l’équipe Bakhita Community"}.
          </p>
          <p>
            <Link className="lien" to="/conditions">Conditions d’utilisation</Link>
            {" · "}
            <Link className="lien" to="/confidentialite">Politique de confidentialité</Link>
          </p>
        </article>
      </div>
    </main>
  );
}
