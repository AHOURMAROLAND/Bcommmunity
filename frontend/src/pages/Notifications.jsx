import { useNavigate } from "react-router-dom";
import { Bell, FileText, Heart, Mail, MessageCircle, UserCheck, UserPlus } from "lucide-react";
import { useMarquerLues, useNotifications } from "../api/notifications";
import useSentinelle from "../hooks/useSentinelle";
import { ilYa } from "../utils/date";
import Avatar from "../components/Avatar";
import { Bouton } from "../components/ui";
import { SqListe } from "../components/Squelettes";

const ICONES = { publication: FileText, resume: FileText, like: Heart, commentaire: MessageCircle,
  demande_ami: UserPlus, ami_accepte: UserCheck, invitation: Mail, invitation_acceptee: Mail };

export default function Notifications() {
  const q = useNotifications();
  const marquer = useMarquerLues();
  const navigate = useNavigate();
  const items = q.data?.pages.flatMap((p) => p.results) ?? [];
  const sentinelle = useSentinelle(() => q.fetchNextPage(), !!q.hasNextPage && !q.isFetchingNextPage);

  function ouvrir(n) {
    if (!n.lue) marquer.mutate({ ids: [n.id] });
    navigate(n.url);
  }

  return (
    <div>
      <div className="entete">
        <h1 style={{ margin: 0 }}>Notifications</h1>
        {items.some((n) => !n.lue) && (
          <button className="puce" disabled={marquer.isPending} onClick={() => marquer.mutate({ tout: true })}>Tout marquer comme lu</button>
        )}
      </div>
      {q.isPending ? <SqListe n={6} bouton={false} /> : q.isError ? (
        <p role="alert" className="erreur">Impossible de charger les notifications.</p>
      ) : items.length === 0 ? (
        <p className="doux"><Bell size={16} style={{ verticalAlign: "middle" }} /> Aucune notification pour le moment.</p>
      ) : (
        <>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((n) => {
              const Icone = ICONES[n.type] ?? Bell;
              return (
                <li key={n.id}>
                  <button type="button" className={`notif${n.lue ? "" : " non-lue"}`} onClick={() => ouvrir(n)}>
                    {n.acteur ? <Avatar prenom={n.acteur.prenom} nom={n.acteur.nom} photo={n.acteur.photo} taille={44} />
                      : <span className="plus" style={{ width: 44, height: 44 }}><Icone size={20} /></span>}
                    <span style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                      <span style={{ display: "block", overflowWrap: "anywhere", fontWeight: n.lue ? 500 : 700 }}>{n.texte}</span>
                      <span className="doux" style={{ fontSize: "0.8rem" }}>{ilYa(n.date)}</span>
                    </span>
                    <Icone size={18} aria-hidden="true" className="doux" />
                  </button>
                </li>
              );
            })}
          </ul>
          <div ref={sentinelle} style={{ height: 1 }} />
          {q.isFetchingNextPage && <SqListe n={2} bouton={false} />}
          {q.hasNextPage && !q.isFetchingNextPage && <Bouton secondaire onClick={() => q.fetchNextPage()}>Voir plus</Bouton>}
        </>
      )}
    </div>
  );
}
