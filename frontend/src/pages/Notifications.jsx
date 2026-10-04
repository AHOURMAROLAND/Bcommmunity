import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Heart,
  Mail,
  MailCheck,
  MessageCircle,
  Settings,
  ShieldAlert,
  Sparkles,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { useMarquerLues, useNotifications } from "../api/notifications";
import useSentinelle from "../hooks/useSentinelle";
import { ilYa } from "../utils/date";
import Avatar from "../components/Avatar";
import { Bouton } from "../components/ui";
import { SqListe } from "../components/Squelettes";

const CONFIG_TYPES = {
  publication: {
    Icone: FileText,
    classeBadge: "badge-publication",
    label: "Publication",
  },
  resume: {
    Icone: Sparkles,
    classeBadge: "badge-resume",
    label: "Résumé",
  },
  like: {
    Icone: Heart,
    classeBadge: "badge-like",
    label: "J'aime",
  },
  commentaire: {
    Icone: MessageCircle,
    classeBadge: "badge-commentaire",
    label: "Commentaire",
  },
  demande_ami: {
    Icone: UserPlus,
    classeBadge: "badge-ami",
    label: "Demande d'ami",
  },
  ami_accepte: {
    Icone: UserCheck,
    classeBadge: "badge-ami",
    label: "Ami accepté",
  },
  invitation: {
    Icone: Mail,
    classeBadge: "badge-message",
    label: "Invitation",
  },
  invitation_acceptee: {
    Icone: MailCheck,
    classeBadge: "badge-message",
    label: "Discussion",
  },
  avertissement: {
    Icone: ShieldAlert,
    classeBadge: "badge-avertissement",
    label: "Avertissement",
  },
};

export default function Notifications() {
  const q = useNotifications();
  const marquer = useMarquerLues();
  const navigate = useNavigate();
  const [onglet, setOnglet] = useState("toutes");

  const items = useMemo(() => {
    return q.data?.pages.flatMap((p) => p.results) ?? [];
  }, [q.data]);

  const sentinelle = useSentinelle(
    () => q.fetchNextPage(),
    Boolean(q.hasNextPage && !q.isFetchingNextPage)
  );

  const nbNonLues = useMemo(() => items.filter((n) => !n.lue).length, [items]);

  const itemsFiltres = useMemo(() => {
    if (onglet === "non_lues") return items.filter((n) => !n.lue);
    if (onglet === "publications") {
      return items.filter((n) =>
        ["publication", "like", "commentaire", "resume"].includes(n.type)
      );
    }
    if (onglet === "relations") {
      return items.filter((n) =>
        ["demande_ami", "ami_accepte", "invitation", "invitation_acceptee"].includes(n.type)
      );
    }
    return items;
  }, [items, onglet]);

  function ouvrir(n) {
    if (!n.lue) {
      marquer.mutate({ ids: [n.id] });
    }
    if (n.url) {
      navigate(n.url);
    }
  }

  function marquerUneLue(e, n) {
    e.stopPropagation();
    if (!n.lue) {
      marquer.mutate({ ids: [n.id] });
    }
  }

  return (
    <div className="page-notifications">
      {/* Barre d'en-tête */}
      <div className="notif-entete-barre">
        <div className="notif-entete-gauche">
          <button
            type="button"
            className="notif-btn-retour"
            onClick={() => navigate(-1)}
            aria-label="Retour"
            title="Retour"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="notif-titre">
            <span>Notifications</span>
            {nbNonLues > 0 && (
              <span className="notif-badge-non-lues" aria-label={`${nbNonLues} non lues`}>
                {nbNonLues}
              </span>
            )}
          </h1>
        </div>

        <div className="notif-entete-actions">
          {nbNonLues > 0 && (
            <button
              type="button"
              className="notif-btn-tout-lire"
              disabled={marquer.isPending}
              onClick={() => marquer.mutate({ tout: true })}
            >
              <CheckCheck size={16} />
              <span>Tout marquer comme lu</span>
            </button>
          )}

          <Link
            to="/parametres"
            className="notif-btn-parametres"
            title="Préférences de notifications"
            aria-label="Préférences de notifications"
          >
            <Settings size={18} />
          </Link>
        </div>
      </div>

      {/* Onglets de filtrage */}
      <div className="notif-filtres-barre" role="tablist" aria-label="Filtres des notifications">
        <button
          type="button"
          role="tab"
          aria-selected={onglet === "toutes"}
          className={`notif-filtre-onglet${onglet === "toutes" ? " actif" : ""}`}
          onClick={() => setOnglet("toutes")}
        >
          <span>Toutes</span>
          <span className="notif-filtre-compte">{items.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={onglet === "non_lues"}
          className={`notif-filtre-onglet${onglet === "non_lues" ? " actif" : ""}`}
          onClick={() => setOnglet("non_lues")}
        >
          <span>Non lues</span>
          {nbNonLues > 0 && <span className="notif-filtre-compte">{nbNonLues}</span>}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={onglet === "publications"}
          className={`notif-filtre-onglet${onglet === "publications" ? " actif" : ""}`}
          onClick={() => setOnglet("publications")}
        >
          <span>Publications</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={onglet === "relations"}
          className={`notif-filtre-onglet${onglet === "relations" ? " actif" : ""}`}
          onClick={() => setOnglet("relations")}
        >
          <span>Amis & Messages</span>
        </button>
      </div>

      {/* Contenu principal */}
      {q.isPending ? (
        <SqListe n={6} bouton={false} />
      ) : q.isError ? (
        <div className="notif-vide-boite">
          <p role="alert" className="erreur">
            Impossible de charger les notifications.
          </p>
          <Bouton secondaire onClick={() => q.refetch()} style={{ marginTop: "1rem" }}>
            Réessayer
          </Bouton>
        </div>
      ) : itemsFiltres.length === 0 ? (
        <div className="notif-vide-boite">
          <div className="notif-vide-halo">
            {onglet === "non_lues" ? <Check size={32} /> : <Bell size={32} />}
          </div>
          <h2 className="notif-vide-titre">
            {onglet === "non_lues"
              ? "Vous êtes à jour !"
              : onglet === "publications"
              ? "Aucune notification de publication"
              : onglet === "relations"
              ? "Aucune notification d'ami ou message"
              : "Aucune notification pour le moment"}
          </h2>
          <p className="notif-vide-desc">
            {onglet === "non_lues"
              ? "Toutes vos notifications ont été lues."
              : "Les interactions, demandes d'amis et activités apparaîtront ici."}
          </p>
          {onglet !== "toutes" && (
            <Bouton secondaire onClick={() => setOnglet("toutes")}>
              Afficher toutes les notifications
            </Bouton>
          )}
        </div>
      ) : (
        <>
          <div className="notif-liste-carte">
            {itemsFiltres.map((n) => {
              const config = CONFIG_TYPES[n.type] ?? {
                Icone: Bell,
                classeBadge: "badge-publication",
                label: "Notification",
              };
              const Icone = config.Icone;
              const estAvertissement = n.type === "avertissement";

              return (
                <div
                  key={n.id}
                  className={`notif-item${n.lue ? "" : " non-lue"}${
                    estAvertissement ? " avertissement" : ""
                  }`}
                  onClick={() => ouvrir(n)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      ouvrir(n);
                    }
                  }}
                >
                  {/* Avatar avec badge d'action superposé */}
                  <div className="notif-avatar-wrapper">
                    {n.acteur ? (
                      <>
                        <Avatar
                          prenom={n.acteur.prenom}
                          nom={n.acteur.nom}
                          photo={n.acteur.photo}
                          taille={44}
                        />
                        <span
                          className={`notif-badge-type ${config.classeBadge}`}
                          title={config.label}
                        >
                          <Icone size={11} strokeWidth={2.5} />
                        </span>
                      </>
                    ) : (
                      <span className={`notif-icone-solo ${config.classeBadge}`}>
                        <Icone size={22} color="#ffffff" strokeWidth={2.2} />
                      </span>
                    )}
                  </div>

                  {/* Corps de la notification */}
                  <div className="notif-corps">
                    <p className="notif-texte">{n.texte}</p>
                    <span className="notif-date">
                      <Clock size={12} />
                      <span>{ilYa(n.date)}</span>
                    </span>
                  </div>

                  {/* Actions à droite */}
                  <div className="notif-actions-droite">
                    {!n.lue && (
                      <>
                        <button
                          type="button"
                          className="notif-btn-marquer-lu"
                          title="Marquer comme lu"
                          aria-label="Marquer comme lu"
                          onClick={(e) => marquerUneLue(e, n)}
                          disabled={marquer.isPending}
                        >
                          <Check size={14} />
                        </button>
                        <span className="notif-point-non-lue" aria-hidden="true" />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div ref={sentinelle} style={{ height: 1 }} />
          {q.isFetchingNextPage && <SqListe n={2} bouton={false} />}
          {q.hasNextPage && !q.isFetchingNextPage && (
            <div style={{ textAlign: "center", marginTop: "1.25rem" }}>
              <Bouton secondaire onClick={() => q.fetchNextPage()}>
                Voir plus de notifications
              </Bouton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
