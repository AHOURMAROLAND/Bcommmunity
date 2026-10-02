import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { Bouton, Champ, Marque } from "../components/ui";
import { tousMessages } from "../api/erreurs";

export default function Reinitialiser() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [lien] = useState({ uid: params.get("uid") ?? "", token: params.get("token") ?? "" });
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [fait, setFait] = useState(false);

  // Le jeton quitte la barre d'adresse (historique, copier-coller, captures).
  useEffect(() => { navigate("/reinitialiser", { replace: true }); }, [navigate]);

  async function soumettre(e) {
    e.preventDefault();
    if (envoi) return;
    if (password.length < 10) { setErreur("10 caractères minimum."); return; }
    if (password !== confirmation) { setErreur("Les mots de passe ne correspondent pas."); return; }
    setEnvoi(true);
    setErreur("");
    try {
      await api("/auth/reinitialiser/", { method: "POST", body: { ...lien, password } });
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
        <h1 style={{ marginTop: 0, fontSize: "1.3rem" }}>Nouveau mot de passe</h1>
        {fait ? (
          <p role="status">Mot de passe modifié. <Link className="lien" to="/connexion">Se connecter</Link></p>
        ) : !lien.uid || !lien.token ? (
          <p role="alert" className="erreur">Lien invalide. <Link className="lien" to="/mot-de-passe-oublie">Faire une nouvelle demande</Link></p>
        ) : (
          <form onSubmit={soumettre} noValidate>
            <Champ label="Nouveau mot de passe" type="password" autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <Champ label="Confirmer" type="password" autoComplete="new-password"
              value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
            {erreur && <p role="alert" className="erreur" style={{ marginBottom: "1rem" }}>{erreur}</p>}
            <Bouton type="submit" chargement={envoi}>Enregistrer</Bouton>
          </form>
        )}
      </div>
    </div></main>
  );
}
