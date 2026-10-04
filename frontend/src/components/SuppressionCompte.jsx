import { useState } from "react";
import { api } from "../api/client";
import { tousMessages } from "../api/erreurs";
import { useAuth } from "../auth/AuthContext";
import { estNatif } from "../utils/plateforme";
import GoogleBouton from "./GoogleBouton";
import GoogleNatif from "./GoogleNatif";
import { Bouton, Champ } from "./ui";

export default function SuppressionCompte() {
  const { utilisateur, deconnexion } = useAuth();
  const [ouvert, setOuvert] = useState(false);
  const [password, setPassword] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  async function supprimer(corps) {
    setEnvoi(true);
    setErreur("");
    try {
      await api("/auth/compte/", { method: "DELETE", body: corps });
      await deconnexion().catch(() => {});
      window.location.assign("/connexion");
    } catch (err) {
      setErreur(tousMessages(err));
      setEnvoi(false);
    }
  }

  if (!ouvert) return <Bouton secondaire onClick={() => setOuvert(true)}>Supprimer mon compte</Bouton>;
  return (
    <div className="carte" role="alertdialog" aria-label="Supprimer mon compte">
      <strong>Supprimer définitivement mon compte</strong>
      <p className="doux">Votre profil, vos publications, commentaires, messages et photos seront effacés. Cette action est irréversible.</p>
      {utilisateur.a_mot_de_passe ? (
        <form onSubmit={(e) => { e.preventDefault(); supprimer({ password }); }}>
          <Champ label="Votre mot de passe" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="duo">
            <Bouton type="button" secondaire onClick={() => setOuvert(false)}>Annuler</Bouton>
            <Bouton type="submit" chargement={envoi} disabled={!password}>Supprimer</Bouton>
          </div>
        </form>
      ) : (
        <>
          <p>Confirmez avec votre compte Google :</p>
          {estNatif() ? <GoogleNatif onCredential={(c) => supprimer({ credential: c })} />
            : <GoogleBouton texte="continue_with" onCredential={(c) => supprimer({ credential: c })} />}
          <Bouton secondaire onClick={() => setOuvert(false)}>Annuler</Bouton>
        </>
      )}
      {erreur && <p role="alert" className="erreur">{erreur}</p>}
    </div>
  );
}
