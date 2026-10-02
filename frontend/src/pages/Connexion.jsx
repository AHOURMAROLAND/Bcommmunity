import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Bouton, Champ, Marque } from "../components/ui";
import { tousMessages } from "../api/erreurs";
import AccesGoogle from "../components/AccesGoogle";

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
        <div className="carte">
          <h1 style={{ marginTop: 0, fontSize: "1.3rem" }}>Se connecter</h1>
          <AccesGoogle texte="signin_with" />
          <p className="doux" style={{ textAlign: "center", margin: "1rem 0" }}>ou avec votre e-mail</p>
          <form onSubmit={soumettre} noValidate>
            <Champ label="Adresse e-mail" type="email" autoComplete="username" required
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <Champ label="Mot de passe" type="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)} />
            {erreur && <p role="alert" className="erreur" style={{ marginBottom: "1rem" }}>{erreur}</p>}
            <Bouton type="submit" chargement={envoi}>Se connecter</Bouton>
          </form>
          <p style={{ textAlign: "center", marginBottom: 0 }}>
            <Link className="lien" to="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
          </p>
          <p className="doux" style={{ textAlign: "center", marginBottom: 0 }}>
            Pas encore de compte ? <Link className="lien" to="/inscription">S'inscrire</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
