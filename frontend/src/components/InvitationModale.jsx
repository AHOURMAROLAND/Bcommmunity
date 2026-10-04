import { useEffect, useState } from "react";
import { useEnvoyerInvitation } from "../api/discussions";
import { tousMessages } from "../api/erreurs";
import { Bouton } from "./ui";

export default function InvitationModale({ utilisateur, onFermer }) {
  const envoyer = useEnvoyerInvitation();
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    const touche = (e) => e.key === "Escape" && onFermer();
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [onFermer]);

  async function soumettre(e) {
    e.preventDefault();
    setErreur("");
    try {
      await envoyer.mutateAsync({ user: utilisateur.id, message: message.trim() });
      onFermer();
    } catch (err) {
      setErreur(tousMessages(err));
    }
  }

  return (
    <div
      className="modale-fond"
      role="dialog" aria-modal="true"
      aria-label={`Inviter ${utilisateur.prenom} a discuter`}
      onClick={onFermer}
    >
      <form
        className="modale carte"
        onClick={(e) => e.stopPropagation()}
        onSubmit={soumettre}
      >
        <h2 style={{ marginTop: 0, fontSize: "1.15rem" }}>
          Inviter {utilisateur.prenom} a discuter
        </h2>
        <p className="doux" style={{ marginTop: 0 }}>
          Vous pourrez echanger des que la personne aura accepte.
        </p>
        <textarea
          className="champ"
          rows={3}
          maxLength={200}
          autoFocus
          placeholder="Message d'introduction (facultatif)"
          aria-label="Message d'introduction"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="doux" style={{ fontSize: "0.8rem", textAlign: "right" }}>
          {message.length} / 200
        </div>
        {erreur && <p role="alert" className="erreur">{erreur}</p>}
        <div className="duo" style={{ marginTop: "0.75rem" }}>
          <Bouton type="button" secondaire onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" chargement={envoyer.isPending}>Envoyer l'invitation</Bouton>
        </div>
      </form>
    </div>
  );
}
