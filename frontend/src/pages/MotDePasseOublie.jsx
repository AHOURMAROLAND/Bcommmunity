import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Bouton, Champ, Marque } from "../components/ui";
import { tousMessages } from "../api/erreurs";

export default function MotDePasseOublie() {
  const [email, setEmail] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [fait, setFait] = useState(false);
  const [erreur, setErreur] = useState("");

  async function soumettre(e) {
    e.preventDefault();
    if (envoi) return;
    setEnvoi(true);
    setErreur("");
    try {
      await api("/auth/mot-de-passe-oublie/", { method: "POST", body: { email: email.trim() } });
      setFait(true);
    } catch (err) {
      setErreur(tousMessages(err));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <main className="page"><div className="boite">
      <Marque />
      <div className="carte">
        <h1 style={{ marginTop: 0, fontSize: "1.3rem" }}>Mot de passe oublié</h1>
        {fait ? (
          <p role="status">Si un compte existe pour cette adresse, un e-mail avec un lien valable 1 heure vient d'être envoyé. Pensez à vérifier vos courriers indésirables.</p>
        ) : (
          <form onSubmit={soumettre} noValidate>
            <Champ label="Adresse e-mail" type="email" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)} />
            {erreur && <p role="alert" className="erreur" style={{ marginBottom: "1rem" }}>{erreur}</p>}
            <Bouton type="submit" chargement={envoi}>Envoyer le lien</Bouton>
          </form>
        )}
        <p style={{ textAlign: "center", marginBottom: 0 }}>
          <Link className="lien" to="/connexion">Retour à la connexion</Link>
        </p>
      </div>
    </div></main>
  );
}
