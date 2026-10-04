import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { tousMessages } from "../api/erreurs";
import { Bouton } from "./ui";
import GoogleBouton from "./GoogleBouton";
import GoogleNatif from "./GoogleNatif";
import { estNatif } from "../utils/plateforme";

export default function AccesGoogle({ texte }) {
  const { connexionGoogle } = useAuth();
  const navigate = useNavigate();
  const [attente, setAttente] = useState(null); // { credential, email, prenom }
  const [cree, setCree] = useState(false);
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  async function lancer(credential, statut) {
    setErreur("");
    setEnvoi(true);
    try {
      const r = await connexionGoogle(credential, statut);
      if (r.etat === "statut_requis") setAttente({ credential, ...r.infos });
      else if (r.etat === "cree") { setAttente(null); setCree(true); }
      else navigate("/fil", { replace: true });
    } catch (err) {
      if (err.status === 403 && err.data?.code) navigate("/en-attente", { replace: true, state: err.data });
      else setErreur(tousMessages(err));
    } finally {
      setEnvoi(false);
    }
  }

  if (cree) {
    return (
      <p role="status" className="carte">
        Compte créé. L'école doit le valider avant votre première connexion.
      </p>
    );
  }

  if (attente) {
    return (
      <div className="carte" role="group" aria-label="Choix du statut">
        <p style={{ marginTop: 0 }}>
          Bienvenue {attente.prenom || ""}. Une dernière question pour {attente.email} : vous êtes ?
        </p>
        <div className="duo">
          <Bouton chargement={envoi} onClick={() => lancer(attente.credential, "eleve")}>Élève actuel</Bouton>
          <Bouton secondaire chargement={envoi} onClick={() => lancer(attente.credential, "ancien")}>Ancien élève</Bouton>
        </div>
        {erreur && <p role="alert" className="erreur">{erreur}</p>}
      </div>
    );
  }

  return (
    <div>
      {estNatif() ? <GoogleNatif onCredential={(c) => lancer(c)} /> : <GoogleBouton texte={texte} onCredential={(c) => lancer(c)} />}
      {erreur && <p role="alert" className="erreur" style={{ textAlign: "center" }}>{erreur}</p>}
    </div>
  );
}
