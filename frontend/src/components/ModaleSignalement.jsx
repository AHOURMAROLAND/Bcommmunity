import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useSignaler } from "../api/signalements";

const MOTIFS = [
  { val: "harcelement",       label: "Harcèlement ou intimidation" },
  { val: "contenu_inapproprie", label: "Contenu inapproprié ou choquant" },
  { val: "faux_profil",       label: "Faux profil" },
  { val: "spam",              label: "Spam ou publicité" },
  { val: "autre",             label: "Autre raison" },
];

/**
 * Props :
 *   type  : "utilisateur" | "publication" | "conversation"
 *   id    : identifiant numérique de la cible
 *   onClose : fonction de fermeture
 */
export default function ModaleSignalement({ type, id, onClose }) {
  const [motif, setMotif] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [ok, setOk] = useState(false);
  const signaler = useSignaler();

  async function soumettre(e) {
    e.preventDefault();
    if (!motif) return;
    await signaler.mutateAsync({ type, id, motif, commentaire });
    setOk(true);
  }

  return (
    <div
      className="modale-fond"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titre-signalement"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modale-boite">
        <div className="modale-entete">
          <span className="modale-icone-alerte"><AlertTriangle size={20} /></span>
          <h2 id="titre-signalement" style={{ margin: 0, fontSize: "1.05rem" }}>Signaler</h2>
          <button className="modale-fermer" aria-label="Fermer" onClick={onClose}><X size={20} /></button>
        </div>

        {ok ? (
          <div style={{ padding: "1.5rem", textAlign: "center" }}>
            <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>✅ Merci pour votre signalement.</p>
            <p className="doux" style={{ fontSize: "0.9rem" }}>L'administrateur va examiner votre demande.</p>
            <button className="bouton" style={{ marginTop: "1rem" }} onClick={onClose}>Fermer</button>
          </div>
        ) : (
          <form onSubmit={soumettre} style={{ padding: "1rem 1.25rem 1.25rem" }}>
            {type === "conversation" && (
              <p className="doux" style={{ fontSize: "0.85rem", marginBottom: "0.75rem", lineHeight: 1.4 }}>
                ⚠️ Les 30 derniers messages de cette conversation seront transmis à l'administrateur pour analyse.
                La personne signalée ne sera pas informée de votre identité.
              </p>
            )}

            <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
              <legend style={{ fontWeight: 600, marginBottom: "0.6rem", fontSize: "0.92rem" }}>
                Motif du signalement
              </legend>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {MOTIFS.map(({ val, label }) => (
                  <label key={val} style={{ display: "flex", alignItems: "center", gap: "0.55rem", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="motif"
                      value={val}
                      checked={motif === val}
                      onChange={() => setMotif(val)}
                    />
                    <span style={{ fontSize: "0.9rem" }}>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label style={{ display: "block", marginTop: "0.9rem", fontSize: "0.9rem", fontWeight: 600 }}>
              Commentaire (optionnel)
              <textarea
                className="champ"
                style={{ marginTop: "0.35rem", resize: "vertical", minHeight: "5rem", fontFamily: "inherit", fontSize: "0.9rem" }}
                maxLength={500}
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder="Décrivez le problème en quelques mots…"
              />
            </label>

            {signaler.isError && (
              <p role="alert" className="erreur" style={{ marginTop: "0.5rem" }}>
                Une erreur s'est produite. Réessayez.
              </p>
            )}

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "1rem" }}>
              <button type="button" className="bouton secondaire" onClick={onClose}>Annuler</button>
              <button
                type="submit"
                className="bouton"
                style={{ background: "#ef4444", borderColor: "#ef4444" }}
                disabled={!motif || signaler.isPending}
              >
                {signaler.isPending ? "Envoi…" : "Envoyer le signalement"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
