import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, rafraichir } from "../api/client";
import { useAuth } from "../auth/AuthContext";

const Ctx = createContext(null);
export const useTempsReel = () => useContext(Ctx);

/**
 * Met a jour le cache des messages d'une conversation.
 * Remplace par cid (optimistic) ou ajoute en tete si nouveau.
 */
export function majMessage(qc, convId, msg) {
  qc.setQueryData(["messages", String(convId)], (old) => {
    if (!old) return old;
    let trouve = false;
    const pages = old.pages.map((p) => ({
      ...p,
      results: p.results.map((m) => {
        if (m.id === msg.id || (msg.cid && m.cid === msg.cid)) {
          trouve = true;
          return { ...m, ...msg };
        }
        return m;
      }),
    }));
    if (!trouve) {
      pages[0] = { ...pages[0], results: [msg, ...pages[0].results] };
    }
    return { ...old, pages };
  });
}

const invalider = (qc, ...cles) =>
  cles.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

export function TempsReelProvider({ children }) {
  const { utilisateur } = useAuth();
  const qc = useQueryClient();
  const sock = useRef(null);
  const abonnes = useRef(new Set());
  const [etat, setEtat] = useState("ferme"); // "ferme" | "connexion" | "ouvert"
  const [nouvelles, setNouvelles] = useState(0);

  useEffect(() => {
    if (!utilisateur) return undefined;
    let ferme = false, essai = 0, minuterie, ping;

    const planifier = () => {
      if (ferme) return;
      setEtat("connexion");
      minuterie = setTimeout(connecter, Math.min(30000, 1000 * 2 ** essai++) + Math.random() * 500);
    };

    const traiter = (d) => {
      if (d.type === "message.nouveau") {
        majMessage(qc, d.conversation, d.message);
        invalider(qc, "conversations", "compteurs-disc");
      } else if (d.type === "message.lu") {
        qc.invalidateQueries({ queryKey: ["conversation", String(d.conversation)] });
        invalider(qc, "conversations", "compteurs-disc");
      } else if (d.type === "invitation.nouvelle" || d.type === "invitation.acceptee") {
        invalider(qc, "invitations", "conversations", "compteurs-disc", "profil-public");
      } else if (d.type === "erreur" && d.cid) {
        majMessage(qc, d.conversation, { id: d.cid, cid: d.cid, statut: "echec" });
      } else if (d.type === "notification.nouvelle") {
        invalider(qc, "notifications", "compteur-notifs");
        if (d.sous_type === "publication") setNouvelles((n) => n + 1);
      }
      // Notifie tous les abonnes locaux (page Conversation)
      abonnes.current.forEach((f) => f(d));
    };

    async function connecter() {
      if (ferme) return;
      setEtat("connexion");
      let jeton;
      try { jeton = await rafraichir(); } catch { planifier(); return; }
      if (ferme) return;

      const proto = location.protocol === "https:" ? "wss" : "ws";
      const url = import.meta.env.VITE_WS_URL ?? `${proto}://${location.host}/ws/`;
      const s = new WebSocket(url);
      sock.current = s;

      s.onopen = () => s.send(JSON.stringify({ type: "auth", token: jeton }));

      s.onmessage = (ev) => {
        let d;
        try { d = JSON.parse(ev.data); } catch { return; }
        if (d.type === "auth.ok") {
          essai = 0;
          setEtat("ouvert");
          ping = setInterval(() => s.readyState === 1 && s.send('{"type":"ping"}'), 25000);
          // Rattrape les evenements manques pendant la deconnexion
          invalider(qc, "conversations", "invitations", "compteurs-disc", "messages");
        } else if (d.type !== "pong") {
          traiter(d);
        }
      };

      s.onclose = (ev) => {
        clearInterval(ping);
        sock.current = null;
        if (ferme) return;
        if (ev.code === 4403) {
          // Suspendu en cours de session : force un re-check de l'acces
          api("/auth/moi/").catch(() => {});
          return;
        }
        planifier();
      };
    }

    // Reconnexion quand la page redevient visible ou le reseau revient
    const visible = () => {
      if (document.visibilityState === "visible" && !sock.current && !ferme) {
        clearTimeout(minuterie); essai = 0; connecter();
      }
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible);
    connecter();

    return () => {
      ferme = true;
      clearTimeout(minuterie); clearInterval(ping);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", visible);
      sock.current?.close(1000);
      setEtat("ferme");
    };
  }, [utilisateur, qc]);

  const envoyer = useCallback((obj) => {
    if (sock.current?.readyState !== 1) return false;
    sock.current.send(JSON.stringify(obj));
    return true;
  }, []);

  const abonner = useCallback((f) => {
    abonnes.current.add(f);
    return () => abonnes.current.delete(f);
  }, []);

  const effacerNouvelles = useCallback(() => setNouvelles(0), []);
  const valeur = useMemo(() => ({ etat, envoyer, abonner, nouvelles, effacerNouvelles }),
    [etat, envoyer, abonner, nouvelles, effacerNouvelles]);

  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}
