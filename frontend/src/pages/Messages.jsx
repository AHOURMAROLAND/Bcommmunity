import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PlusCircle } from "lucide-react";
import {
  useAccepterInvitation, useAnnulerInvitation, useCompteursDisc,
  useConversations, useInvitations, useRefuserInvitation,
} from "../api/discussions";
import { ilYa } from "../utils/date";
import Avatar from "../components/Avatar";
import { Bouton } from "../components/ui";
import { SqListe } from "../components/Squelettes";
import { useTempsReel } from "../temps-reel/TempsReel";

// ---- Liste des conversations ----
function Conversations() {
  const q = useConversations();
  const { activites } = useTempsReel();
  if (q.isPending) return <SqListe n={5} />;
  const items = q.data?.pages.flatMap((p) => p.results) ?? [];
  if (!items.length) return (
    <p className="doux">
      Aucune conversation. Invitez quelqu'un a discuter depuis l'
      <Link className="lien" to="/annuaire">annuaire</Link>.
    </p>
  );
  return (
    <>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((c) => (
          <li key={c.id}>
            <Link
              to={`/messages/${c.id}`}
              className="ligne-membre"
              style={{ color: "inherit", textDecoration: "none" }}
            >
              <Avatar prenom={c.autre.prenom} nom={c.autre.nom} photo={c.autre.photo} taille={52} />
              <div className="infos" style={{ minWidth: 0 }}>
                <strong>{c.autre.prenom} {c.autre.nom}</strong>
                <div
                  className="doux"
                  style={{
                    fontSize: "0.85rem",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    fontWeight: c.non_lus ? 700 : 500,
                    color: activites[String(c.id)] ? "var(--primaire)" : undefined,
                  }}
                >
                  {activites[String(c.id)]?.type === "vocal"
                    ? "Enregistre un message vocal…"
                    : activites[String(c.id)]?.type === "texte"
                      ? "Écrit…"
                      : c.dernier
                        ? c.dernier.supprime_pour_tous
                          ? "Message supprimé"
                          : c.dernier.texte || (
                            c.dernier.type === "image" ? "Photo"
                              : c.dernier.type === "vocal" ? "Message vocal"
                                : c.dernier.type === "fichier" ? "Fichier joint"
                                  : "Nouvelle conversation"
                          )
                        : "Nouvelle conversation"}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                {c.dernier && (
                  <div className="doux" style={{ fontSize: "0.75rem" }}>{ilYa(c.dernier.cree_le)}</div>
                )}
                {c.non_lus > 0 && (
                  <span className="badge-nb" style={{ position: "static", display: "inline-grid" }}>
                    {c.non_lus > 99 ? "99+" : c.non_lus}
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {q.hasNextPage && (
        <Bouton secondaire chargement={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
          Voir plus
        </Bouton>
      )}
    </>
  );
}

// ---- Onglet Invitations ----
function Invitations() {
  const [sous, setSous] = useState("recues");
  const q = useInvitations(sous === "recues" ? "recues" : "envoyees");
  const accepter = useAccepterInvitation();
  const refuser = useRefuserInvitation();
  const annuler = useAnnulerInvitation();
  const navigate = useNavigate();
  const items = q.data?.pages.flatMap((p) => p.results) ?? [];

  return (
    <>
      <div className="puces" role="tablist" aria-label="Invitations">
        {[["recues", "Recues"], ["envoyees", "Envoyees"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={sous === k} aria-pressed={sous === k}
            className="puce" onClick={() => setSous(k)}>{l}</button>
        ))}
      </div>

      {q.isPending ? <SqListe n={3} /> : items.length === 0 ? (
        <p className="doux">
          {sous === "recues" ? "Aucune invitation recue." : "Aucune invitation en attente."}
        </p>
      ) : items.map((inv) => (
        <article key={inv.id} className="carte" style={{ marginBottom: "0.75rem" }}>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <Link to={`/profil/${inv.utilisateur.id}`}>
              <Avatar prenom={inv.utilisateur.prenom} nom={inv.utilisateur.nom}
                photo={inv.utilisateur.photo} taille={56} />
            </Link>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{inv.utilisateur.prenom} {inv.utilisateur.nom}</strong>
              <div className="doux" style={{ fontSize: "0.85rem" }}>
                {inv.utilisateur.statut === "ancien" ? "Ancien eleve" : "Eleve"}
                {inv.utilisateur.annee_sortie ? ` · Promo ${inv.utilisateur.annee_sortie}` : ""}
              </div>
              {inv.message && (
                <p style={{ margin: "0.3rem 0 0", fontSize: "0.9rem", overflowWrap: "anywhere" }}>
                  {inv.message}
                </p>
              )}
              <div className="doux" style={{ fontSize: "0.78rem", marginTop: "0.2rem" }}>
                {ilYa(inv.cree_le)}
              </div>
            </div>
          </div>

          <div className="duo" style={{ marginTop: "0.6rem" }}>
            {sous === "recues" ? (
              <>
                <Bouton
                  chargement={accepter.isPending}
                  onClick={async () => {
                    const r = await accepter.mutateAsync(inv.id);
                    navigate(`/messages/${r.conversation}`);
                  }}
                >
                  Accepter
                </Bouton>
                <Bouton secondaire chargement={refuser.isPending}
                  onClick={() => refuser.mutate(inv.id)}>
                  Refuser
                </Bouton>
              </>
            ) : (
              <Bouton secondaire chargement={annuler.isPending}
                onClick={() => annuler.mutate(inv.id)}>
                Annuler l'invitation
              </Bouton>
            )}
          </div>
        </article>
      ))}

      <Link to="/annuaire" className="btn" style={{ marginTop: "0.5rem", textDecoration: "none" }}>
        <PlusCircle size={18} /> Nouvelle invitation
      </Link>
    </>
  );
}

// ---- Page principale Messages ----
export default function Messages() {
  const [onglet, setOnglet] = useState("conversations");
  const { data } = useCompteursDisc();
  const nbInv = data?.invitations ?? 0;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Messages</h1>
      <div className="puces" role="tablist" aria-label="Messages">
        <button
          role="tab" aria-selected={onglet === "conversations"} aria-pressed={onglet === "conversations"}
          className="puce" onClick={() => setOnglet("conversations")}
        >
          Conversations
        </button>
        <button
          role="tab" aria-selected={onglet === "invitations"} aria-pressed={onglet === "invitations"}
          className="puce" onClick={() => setOnglet("invitations")}
        >
          Invitations{nbInv > 0 && (
            <span className="pastille" style={{ background: "var(--danger)", color: "#fff", marginLeft: "0.35rem" }}>
              {nbInv}
            </span>
          )}
        </button>
      </div>
      {onglet === "conversations" ? <Conversations /> : <Invitations />}
    </div>
  );
}
