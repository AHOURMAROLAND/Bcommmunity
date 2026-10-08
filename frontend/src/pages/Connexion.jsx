import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Bouton, Champ, Marque } from "../components/ui";
import { tousMessages } from "../api/erreurs";
import { api } from "../api/client";
import AccesGoogle from "../components/AccesGoogle";
import ChargementLong from "@/components/ChargementLong";
import "./Connexion.css";

export default function Connexion() {
  const { connexion } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
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
      if (err.status === 403 && err.data?.code === "email_non_verifie") {
        const adresse = err.data.email ?? email.trim();
        let erreurEnvoi = "";
        try {
          await api("/auth/otp/envoyer/", { method: "POST", body: { email: adresse } });
        } catch (echec) {
          erreurEnvoi = tousMessages(echec);
        }
        navigate(`/verifier-email?email=${encodeURIComponent(adresse)}`, {
          replace: true,
          state: erreurEnvoi ? { erreurEnvoi } : { codeEnvoye: true },
        });
        return;
      }
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
        <ChargementLong actif={envoi} label="Connexion en cours..." />
        <div className="carte">
          <h1 style={{ marginTop: 0, fontSize: "1.3rem" }}>Se connecter</h1>
          <AccesGoogle texte="signin_with" />
          <p className="doux" style={{ textAlign: "center", margin: "1rem 0" }}>ou avec votre e-mail</p>
          <form onSubmit={soumettre} noValidate>
            <Champ label="Adresse e-mail" type="email" autoComplete="username" required
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <div className="connexion-mot-de-passe">
              <Champ label="Mot de passe" type={passwordVisible ? "text" : "password"}
                autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)} />
              <button
                className="connexion-mot-de-passe-toggle"
                type="button"
                aria-label={passwordVisible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                aria-pressed={passwordVisible}
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                {passwordVisible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
              </button>
            </div>
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
