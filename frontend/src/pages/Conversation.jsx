import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CheckCheck, Flag, MoreHorizontal, Send } from "lucide-react";
import { api } from "../api/client";
import { useConversation, useMessages } from "../api/discussions";
import { useAuth } from "../auth/AuthContext";
import { majMessage, useTempsReel } from "../temps-reel/TempsReel";
import Avatar from "../components/Avatar";
import ModaleSignalement from "../components/ModaleSignalement";
import { Bouton } from "../components/ui";
import { Sq } from "../components/Squelettes";

const heure = (iso) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export default function Conversation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { utilisateur } = useAuth();
  const { envoyer, abonner } = useTempsReel();
  const conv = useConversation(id);
  const msgs = useMessages(id);

  const [texte, setTexte] = useState("");
  const [ecrit, setEcrit] = useState(false);
  const [menuConv, setMenuConv] = useState(false);
  const [signalement, setSignalement] = useState(false);

  const fil = useRef(null);
  const hauteurAvant = useRef(0);
  const dernierLu = useRef(0);
  const dernierTyping = useRef(0);
  const minuterie = useRef(0);

  // Ordre chronologique pour l'affichage
  const liste = useMemo(
    () => (msgs.data?.pages.flatMap((p) => p.results) ?? []).slice().reverse(),
    [msgs.data],
  );
  const dernier = liste.at(-1);

  // Abonnement aux evenements temps reel de cette conversation
  useEffect(() => abonner((d) => {
    if (String(d.conversation) !== id) return;
    if (d.type === "typing") {
      setEcrit(true);
      clearTimeout(minuterie.current);
      minuterie.current = setTimeout(() => setEcrit(false), 3000);
    } else if (d.type === "message.nouveau") {
      setEcrit(false);
    }
  }), [abonner, id]);
  useEffect(() => () => clearTimeout(minuterie.current), []);

  // Marquer comme lu le dernier message de l'autre
  useEffect(() => {
    if (
      !dernier || typeof dernier.id !== "number" ||
      dernier.auteur === utilisateur.id ||
      dernier.id <= dernierLu.current ||
      document.visibilityState !== "visible"
    ) return;
    dernierLu.current = dernier.id;
    if (!envoyer({ type: "read", conversation: Number(id), jusqua: dernier.id })) {
      api(`/conversations/${id}/lu/`, { method: "POST", body: { jusqua: dernier.id } }).catch(() => {});
    }
  }, [dernier, id, envoyer, utilisateur.id]);

  // Scroll automatique au dernier message
  useEffect(() => {
    fil.current?.scrollTo({ top: fil.current.scrollHeight });
  }, [dernier?.id]);

  // Maintien de la position quand on charge les messages precedents
  useLayoutEffect(() => {
    if (hauteurAvant.current && fil.current) {
      fil.current.scrollTop += fil.current.scrollHeight - hauteurAvant.current;
      hauteurAvant.current = 0;
    }
  }, [liste.length]);

  async function precedents() {
    hauteurAvant.current = fil.current.scrollHeight;
    await msgs.fetchNextPage();
  }

  function frappe(e) {
    setTexte(e.target.value);
    const t = Date.now();
    if (t - dernierTyping.current > 2000) {
      dernierTyping.current = t;
      envoyer({ type: "typing", conversation: Number(id) });
    }
  }

  async function envoyerMessage(e) {
    e?.preventDefault();
    const t = texte.trim();
    if (!t) return;
    setTexte("");
    const cid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Affichage optimiste
    majMessage(qc, id, {
      id: cid, cid,
      auteur: utilisateur.id,
      texte: t,
      cree_le: new Date().toISOString(),
      statut: "envoi",
    });
    if (envoyer({ type: "message.send", conversation: Number(id), texte: t, cid })) return;
    // Fallback REST si WS non connecte
    try {
      const m = await api(`/conversations/${id}/messages/`, { method: "POST", body: { texte: t, cid } });
      majMessage(qc, id, { ...m, cid });
    } catch {
      majMessage(qc, id, { id: cid, cid, statut: "echec" });
    }
  }

  if (conv.isError) {
    return (
      <div className="chat">
        <p role="alert" className="erreur">Cette conversation n'est pas disponible.</p>
        <Bouton secondaire onClick={() => navigate("/messages")}>Retour</Bouton>
      </div>
    );
  }

  const autre = conv.data?.autre;
  const luAutre = conv.data?.dernier_lu_autre ?? 0;

  return (
    <div className="chat">
      <header className="chat-tete">
        <button className="puce" onClick={() => navigate("/messages")} aria-label="Retour aux messages">
          <ArrowLeft size={18} />
        </button>
        {autre ? (
          <Link
            to={`/profil/${autre.id}`}
            style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "inherit", textDecoration: "none", flex: 1, minWidth: 0 }}
          >
            <Avatar prenom={autre.prenom} nom={autre.nom} photo={autre.photo} taille={38} />
            <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {autre.prenom} {autre.nom}
            </strong>
          </Link>
        ) : (
          <Sq w="10rem" h="1.2rem" />
        )}
        {autre && (
          <div style={{ position: "relative" }}>
            <button
              className="puce"
              aria-label="Options de la conversation"
              aria-expanded={menuConv}
              onClick={() => setMenuConv((v) => !v)}
            >
              <MoreHorizontal size={18} />
            </button>
            {menuConv && (
              <div className="menu-contextuel" style={{ position: "absolute", right: 0, top: "2.6rem", width: "14rem" }}>
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => { setMenuConv(false); setSignalement(true); }}
                >
                  <Flag size={14} style={{ marginRight: "0.4rem" }} />
                  Signaler cette conversation
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <div className="chat-fil" ref={fil} role="log" aria-live="polite" aria-label="Messages">
        {msgs.hasNextPage && (
          <div style={{ textAlign: "center", padding: "0.5rem 0" }}>
            <Bouton secondaire chargement={msgs.isFetchingNextPage} onClick={precedents}>
              Messages precedents
            </Bouton>
          </div>
        )}
        {msgs.isPending && [60, 40, 70, 30].map((w, i) => (
          <Sq key={i} w={`${w}%`} h="2.4rem" r="1.1rem"
            style={{ alignSelf: i % 2 ? "flex-end" : "flex-start" }} />
        ))}
        {liste.map((m) => {
          const moi = m.auteur === utilisateur.id;
          const vu = moi && typeof m.id === "number" && luAutre >= m.id;
          return (
            <div key={m.cid ?? m.id} style={{ display: "contents" }}>
              <div
                className={`bulle-msg${moi ? " moi" : ""}`}
                aria-label={moi ? `Vous : ${m.texte}` : `${autre?.prenom ?? ""} : ${m.texte}`}
              >
                {m.texte}
              </div>
              <div className={`heure${moi ? " moi" : ""}`}>
                {m.cree_le && heure(m.cree_le)}
                {moi && (
                  m.statut === "echec"
                    ? <span style={{ color: "var(--danger)", marginLeft: 4 }}> Echec</span>
                    : m.statut === "envoi"
                    ? <span style={{ marginLeft: 4 }}> ...</span>
                    : vu
                    ? <CheckCheck size={13} style={{ verticalAlign: "middle", marginLeft: 4 }} aria-label="Vu" />
                    : <Check size={13} style={{ verticalAlign: "middle", marginLeft: 4 }} aria-label="Envoye" />
                )}
              </div>
            </div>
          );
        })}
        {ecrit && autre && (
          <div className="bulle-msg ecrit" role="status" aria-label={`${autre.prenom} ecrit`}>
            <span /><span /><span />
          </div>
        )}
      </div>

      {conv.data && !conv.data.peut_ecrire ? (
        <p className="doux" style={{ textAlign: "center", padding: "0.75rem" }}>
          Vous ne pouvez plus ecrire a cette personne.
        </p>
      ) : (
        <form className="saisie" onSubmit={envoyerMessage}>
          <textarea
            className="champ" rows={1} maxLength={2000}
            placeholder="Votre message" aria-label="Votre message"
            value={texte} onChange={frappe}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) envoyerMessage(e);
            }}
            style={{ resize: "none" }}
          />
          <button
            type="submit" className="plus" aria-label="Envoyer"
            disabled={!texte.trim()} style={{ border: 0, cursor: "pointer", flexShrink: 0 }}
          >
            <Send size={20} />
          </button>
        </form>
      )}
      {signalement && conv.data && (
        <ModaleSignalement
          type="conversation"
          id={Number(id)}
          onClose={() => setSignalement(false)}
        />
      )}
    </div>
  );
}
