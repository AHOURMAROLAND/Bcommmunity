import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bug, MessageSquarePlus } from "lucide-react";
import { api } from "../api/client";
import DiscussionsSupport from "../components/DiscussionsSupport";
import { Bouton } from "../components/ui";

export default function Assistance() {
  const qc = useQueryClient();
  const [motif, setMotif] = useState("bug");
  const [commentaire, setCommentaire] = useState("");
  const configuration = useQuery({
    queryKey: ["configuration-support"],
    queryFn: () => api("/signalements/configuration/"),
    staleTime: 60_000,
    retry: 1,
  });
  const envoi = useMutation({
    mutationFn: (texte) => {
      const formulaire = new FormData();
      formulaire.append("type", "retour");
      formulaire.append("motif", motif);
      formulaire.append("commentaire", texte);
      formulaire.append("chemin", window.location.pathname);
      return api("/signalements/", { method: "POST", formData: formulaire });
    },
    onSuccess: async () => {
      setCommentaire("");
      await qc.invalidateQueries({ queryKey: ["mes-retours-support"] });
    },
  });

  function soumettre(event) {
    event.preventDefault();
    const texte = commentaire.trim();
    if (texte) envoi.mutate(texte);
  }

  return (
    <div className="page-parametres">
      <header className="parametres-entete">
        <h1>Assistance</h1>
        <p>Envoyez un message à l’équipe et retrouvez ici vos échanges.</p>
      </header>

      <section className="parametres-groupe">
        <h2 className="parametres-groupe-titre"><MessageSquarePlus size={17} />Envoyer un message</h2>
        <div className="parametres-groupe-liste">
          <div className="parametres-option-contenu">
            {configuration.isPending && <p className="doux">Vérification de la disponibilité du support…</p>}
            {configuration.isError && (
              <p className="erreur" role="alert">Impossible de vérifier la disponibilité du support. Réessayez plus tard.</p>
            )}
            {!configuration.isPending && !configuration.isError && !configuration.data?.visible && (
              <p className="doux">Le formulaire d’assistance n’est pas disponible actuellement.</p>
            )}
            {configuration.data?.visible && (
              <form onSubmit={soumettre} style={{ display: "grid", gap: ".75rem" }}>
                <div className="puces" role="group" aria-label="Type de message">
                  <button
                    type="button"
                    className="puce"
                    aria-pressed={motif === "bug"}
                    onClick={() => setMotif("bug")}
                  >
                    <Bug size={16} /> Signaler un problème
                  </button>
                  <button
                    type="button"
                    className="puce"
                    aria-pressed={motif === "suggestion"}
                    onClick={() => setMotif("suggestion")}
                  >
                    <MessageSquarePlus size={16} /> Poser une question ou suggérer une amélioration
                  </button>
                </div>
                <label htmlFor="message-assistance">Votre message</label>
                <textarea
                  id="message-assistance"
                  className="champ"
                  rows={5}
                  maxLength={2000}
                  required
                  value={commentaire}
                  onChange={(event) => setCommentaire(event.target.value)}
                  placeholder="Expliquez-nous comment nous pouvons vous aider."
                />
                {envoi.isError && <p role="alert" className="erreur">{envoi.error.message}</p>}
                {envoi.isSuccess && (
                  <p role="status" className="doux">Votre message a été envoyé. Vous pourrez suivre la réponse ci-dessous.</p>
                )}
                <Bouton type="submit" chargement={envoi.isPending} disabled={!commentaire.trim()}>
                  Envoyer à l’assistance
                </Bouton>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="parametres-groupe">
        <h2 className="parametres-groupe-titre"><MessageSquarePlus size={17} />Vos échanges</h2>
        <div className="parametres-groupe-liste">
          <div className="parametres-option-contenu">
            <DiscussionsSupport />
          </div>
        </div>
      </section>
    </div>
  );
}
