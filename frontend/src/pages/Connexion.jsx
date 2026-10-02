import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Bouton, Champ, Marque } from "../components/ui";
import { tousMessages } from "../api/erreurs";

export default function Connexion() {
  const { connexion } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e) {
    e.preventDefault();
    if (envoi) return;
    setEnvoi(true);
    setErreur("");
    try {
      await connexion(email.trim(), password);
      navigate("/fil", { replace: true });
    } catch (err) {
      if (err.status === 403 && err.data?.code) {
        navigate("/en-attente", { replace: true, state: err.data });
      } else {
        setErreur(tousMessages(err));
      }
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <main className="page">
      <div className="boite">
        <Marque sous="Retrouvez vos camarades et votre école." />
        <form className="carte" onSubmit={soumettre} noValidate>
          <h1 style={{ marginTop: 0, fontSize: "1.3rem" }}>Se connecter</h1>
          <Champ label="Adresse e-mail" type="email" autoComplete="username" required
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <Champ label="Mot de passe" type="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
          {erreur && <p role="alert" className="erreur" style={{ marginBottom: "1rem" }}>{erreur}</p>}
          <Bouton type="submit" chargement={envoi}>Se connecter</Bouton>
          <p className="doux" style={{ textAlign: "center", marginBottom: 0 }}>
            Pas encore de compte ? <Link className="lien" to="/inscription">S'inscrire</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
