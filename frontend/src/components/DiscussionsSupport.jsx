import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export default function DiscussionsSupport() {
  const qc = useQueryClient();
  const [messages, setMessages] = useState({});
  const retours = useQuery({
    queryKey: ["mes-retours-support"],
    queryFn: () => api("/signalements/mes/"),
  });
  const envoyer = useMutation({
    mutationFn: ({ id, texte }) =>
      api(`/signalements/mes/${id}/messages/`, { method: "POST", body: { texte } }),
    onSuccess: () => {
      setMessages({});
      qc.invalidateQueries({ queryKey: ["mes-retours-support"] });
    },
  });

  if (retours.isPending) return <p className="doux">Chargement des échanges…</p>;
  if (retours.isError) return <p role="alert" className="erreur">Impossible de charger vos échanges avec l’assistance.</p>;
  if (!retours.data.length) return <p className="doux">Vos signalements et suggestions apparaîtront ici.</p>;

  return (
    <div style={{ display: "grid", gap: ".75rem" }}>
      {retours.data.map((retour) => (
        <details key={retour.id} className="carte">
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>
            {retour.motif} · {retour.statut}
          </summary>
          {retour.commentaire && <p>{retour.commentaire}</p>}
          <div style={{ display: "grid", gap: ".5rem" }}>
            {retour.messages.map((message) => (
              <article
                key={message.id}
                style={{
                  padding: ".6rem .75rem", borderRadius: ".75rem",
                  background: message.expediteur === "admin" ? "var(--carte)" : "var(--surface-hover)",
                }}
              >
                <strong>{message.expediteur === "admin" ? "admin" : "Vous"}</strong>
                <p style={{ margin: ".25rem 0 0", whiteSpace: "pre-wrap" }}>{message.texte}</p>
              </article>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const texte = (messages[retour.id] ?? "").trim();
              if (texte) envoyer.mutate({ id: retour.id, texte });
            }}
            style={{ display: "grid", gap: ".5rem", marginTop: ".75rem" }}
          >
            <label htmlFor={`reponse-support-${retour.id}`}>Répondre à l’équipe</label>
            <textarea
              id={`reponse-support-${retour.id}`}
              className="champ"
              rows={2}
              maxLength={2000}
              value={messages[retour.id] ?? ""}
              onChange={(event) => setMessages((courant) => ({
                ...courant,
                [retour.id]: event.target.value,
              }))}
            />
            <button className="btn" type="submit" disabled={envoyer.isPending || !(messages[retour.id] ?? "").trim()}>
              {envoyer.isPending ? "Envoi…" : "Envoyer"}
            </button>
          </form>
        </details>
      ))}
      {envoyer.isError && <p role="alert" className="erreur">{envoyer.error.message}</p>}
    </div>
  );
}
