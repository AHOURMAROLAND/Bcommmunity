import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, rafraichir } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import {
  ajouterALaFile, creerFormData, estErreurReseau, lireFile,
  noterEchecFile, retenterElementFile, supprimerDeLaFile,
} from "../api/stockage-hors-ligne";

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
  const minuteursActivite = useRef(new Map());
  const [etat, setEtat] = useState("ferme");
  const [nouvelles, setNouvelles] = useState(0); // bandeau nouvelles publications dans le fil
  const [activites, setActivites] = useState({});
  const [fileHorsLigne, setFileHorsLigne] = useState([]);
  const synchronisationEnCours = useRef(false);

  const actualiserFile = useCallback(async () => {
    if (!utilisateur?.id) {
      setFileHorsLigne([]);
      return;
    }
    setFileHorsLigne(await lireFile(utilisateur.id));
  }, [utilisateur?.id]);

  const mettreEnFile = useCallback(async (operation) => {
    if (!utilisateur?.id) throw new Error("Connectez-vous pour mettre ce contenu en attente.");
    const element = await ajouterALaFile({ ...operation, utilisateurId: utilisateur.id });
    await actualiserFile();
    return element;
  }, [actualiserFile, utilisateur?.id]);

  useEffect(() => {
    if (!utilisateur) return undefined;
    const timersActivite = minuteursActivite.current;
    let ferme = false, essai = 0, minuterie, ping, connexionEnCours = false;

    const planifier = () => {
      if (ferme) return;
      setEtat("connexion");
      minuterie = setTimeout(
        connecter,
        Math.min(30000, 1000 * 2 ** essai++) + Math.random() * 500,
      );
    };

    const synchroniserFile = async () => {
      if (!navigator.onLine || synchronisationEnCours.current) return;
      synchronisationEnCours.current = true;
      try {
        const enAttente = await lireFile(utilisateur.id);
        for (const element of enAttente) {
          if (element.derniereErreur) continue;
          try {
            let resultat;
            if (element.type === "message.texte") {
              resultat = await api(`/conversations/${element.conversationId}/messages/`, {
                method: "POST",
                body: element.message,
              });
              majMessage(qc, element.conversationId, resultat);
              qc.invalidateQueries({ queryKey: ["messages", String(element.conversationId)] });
              invalider(qc, "conversations", "compteurs-disc");
            } else if (element.type === "message.media") {
              resultat = await api(`/conversations/${element.conversationId}/messages/media/`, {
                method: "POST",
                formData: creerFormData(element.entrees),
              });
              majMessage(qc, element.conversationId, resultat);
              qc.invalidateQueries({ queryKey: ["messages", String(element.conversationId)] });
              invalider(qc, "conversations", "compteurs-disc");
            } else if (element.type === "publication") {
              const formData = creerFormData(element.entrees);
              resultat = await api(element.chemin, {
                method: element.methode,
                formData,
              });
              invalider(qc, "fil", "mes-publications", "publication");
            } else {
              throw new Error("Type de contenu hors ligne inconnu.");
            }
            await supprimerDeLaFile(element.id);
          } catch (erreur) {
            if (estErreurReseau(erreur)) break;
            await noterEchecFile(element, erreur.message || "Le contenu n'a pas pu être synchronisé.");
            break;
          }
        }
      } finally {
        synchronisationEnCours.current = false;
        await actualiserFile();
      }
    };

    const traiter = (d) => {
      if (d.type === "typing" && Number.isInteger(d.conversation)) {
        const cle = String(d.conversation);
        const timer = timersActivite.get(cle);
        clearTimeout(timer);
        if (d.actif === false) {
          timersActivite.delete(cle);
          setActivites((actuelles) => {
            if (!actuelles[cle] || actuelles[cle].user !== d.user) return actuelles;
            const suivantes = { ...actuelles };
            delete suivantes[cle];
            return suivantes;
          });
        } else {
          const activite = { user: d.user, type: d.activite === "vocal" ? "vocal" : "texte" };
          setActivites((actuelles) => ({ ...actuelles, [cle]: activite }));
          timersActivite.set(cle, setTimeout(() => {
            timersActivite.delete(cle);
            setActivites((actuelles) => {
              if (actuelles[cle] !== activite) return actuelles;
              const suivantes = { ...actuelles };
              delete suivantes[cle];
              return suivantes;
            });
          }, 5000));
        }
      } else if (d.type === "message.nouveau") {
        majMessage(qc, d.conversation, d.message);
        clearTimeout(timersActivite.get(String(d.conversation)));
        timersActivite.delete(String(d.conversation));
        setActivites((actuelles) => {
          const suivantes = { ...actuelles };
          delete suivantes[String(d.conversation)];
          return suivantes;
        });
        invalider(qc, "conversations", "compteurs-disc");
      } else if (d.type === "reaction.maj") {
        qc.invalidateQueries({ queryKey: ["messages", String(d.conversation)] });
      } else if (
        d.type === "message.modifie" ||
        d.type === "message.supprime_pour_tous" ||
        d.type === "message.epingle"
      ) {
        qc.invalidateQueries({ queryKey: ["messages", String(d.conversation)] });
        if (d.type !== "message.modifie") {
          qc.invalidateQueries({ queryKey: ["conversation", String(d.conversation)] });
        }
      } else if (d.type === "message.lu") {
        qc.invalidateQueries({ queryKey: ["conversation", String(d.conversation)] });
        invalider(qc, "conversations", "compteurs-disc");
      } else if (d.type === "invitation.nouvelle" || d.type === "invitation.acceptee") {
        invalider(qc, "invitations", "conversations", "compteurs-disc", "profil-public");
      } else if (d.type === "notification.nouvelle") {
        // Invalide la cloche et la liste
        invalider(qc, "notifications", "compteur-notifs");
        // Bandeau "X nouvelles publications" dans le fil
        if (d.sous_type === "publication") {
          setNouvelles((n) => n + 1);
        }
      } else if (d.type === "erreur" && d.cid) {
        majMessage(qc, d.conversation, { id: d.cid, cid: d.cid, statut: "echec" });
      }
      abonnes.current.forEach((f) => f(d));
    };

    async function connecter() {
      if (ferme || connexionEnCours || sock.current) return;
      connexionEnCours = true;
      setEtat("connexion");
      let jeton;
      try {
        jeton = await rafraichir();
      } catch {
        connexionEnCours = false;
        planifier();
        return;
      }
      if (ferme) {
        connexionEnCours = false;
        return;
      }

      const proto = location.protocol === "https:" ? "wss" : "ws";
      const url = import.meta.env.VITE_WS_URL ?? `${proto}://${location.host}/ws/`;
      const s = new WebSocket(url);
      sock.current = s;
      connexionEnCours = false;

      s.onopen = () => s.send(JSON.stringify({ type: "auth", token: jeton }));

      s.onmessage = (ev) => {
        let d;
        try { d = JSON.parse(ev.data); } catch { return; }
        if (d.type === "auth.ok") {
          essai = 0;
          setEtat("ouvert");
          ping = setInterval(
            () => s.readyState === 1 && s.send('{"type":"ping"}'),
            25000,
          );
          // Rattrape les evenements manques pendant la deconnexion
          invalider(
            qc,
            "conversations", "invitations", "compteurs-disc", "messages",
            "notifications", "compteur-notifs",
          );
          void synchroniserFile();
        } else if (d.type !== "pong") {
          traiter(d);
        }
      };

      s.onclose = (ev) => {
        clearInterval(ping);
        if (sock.current === s) sock.current = null;
        if (ferme) return;
        if (ev.code === 4403) {
          // Suspendu en cours de session
          api("/auth/moi/").catch(() => {});
          return;
        }
        planifier();
      };
    }

    const visible = () => {
      if (document.visibilityState === "visible" && !sock.current && !connexionEnCours && !ferme) {
        clearTimeout(minuterie); essai = 0; connecter();
      }
      if (navigator.onLine) void synchroniserFile();
    };
    const changementFile = () => { void actualiserFile(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible);
    window.addEventListener("bakhita-file-change", changementFile);
    void actualiserFile();
    void synchroniserFile();
    connecter();

    return () => {
      ferme = true;
      clearTimeout(minuterie); clearInterval(ping);
      timersActivite.forEach(clearTimeout);
      timersActivite.clear();
      setActivites({});
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", visible);
      window.removeEventListener("bakhita-file-change", changementFile);
      sock.current?.close(1000);
      setEtat("ferme");
    };
  }, [utilisateur, qc, actualiserFile]);

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

  const synchroniser = useCallback(async () => {
    if (!utilisateur?.id) return;
    const elements = await lireFile(utilisateur.id);
    for (const element of elements) {
      if (element.derniereErreur) await retenterElementFile(element);
    }
    window.dispatchEvent(new Event("online"));
  }, [utilisateur?.id]);

  const valeur = useMemo(
    () => ({
      etat, envoyer, abonner, nouvelles, effacerNouvelles, activites,
      fileHorsLigne, mettreEnFile, synchroniser,
    }),
    [etat, envoyer, abonner, nouvelles, effacerNouvelles, activites, fileHorsLigne, mettreEnFile, synchroniser],
  );

  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}
