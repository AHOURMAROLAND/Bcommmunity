import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { api, effacerRefresh, lireRefresh, rafraichir, sauverRefresh, setAccessToken } from "../api/client";
import {
  effacerCacheHorsLigne, effacerFileHorsLigne, persisterRequetes,
} from "../api/stockage-hors-ligne";
import { desactiverPush, synchroniserPushWeb } from "../utils/push";
import { estNatif } from "../utils/plateforme";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [utilisateur, setUtilisateur] = useState(null);
  const [chargement, setChargement] = useState(true);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const connecte = useRef(false);
  const persistance = useMemo(() => ({
    persister: persisterRequetes(utilisateur?.id ?? "invité"),
    buster: "bakhita-cache-v1",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  }), [utilisateur?.id]);

  useEffect(() => { connecte.current = !!utilisateur; }, [utilisateur]);

  useEffect(() => {
    if (!utilisateur?.id || estNatif()) return;
    synchroniserPushWeb(utilisateur.id).catch((error) => {
      console.error("Impossible de synchroniser OneSignal avec le compte.", error);
    });
  }, [utilisateur?.id]);

  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        await rafraichir();
        const moi = await api("/auth/moi/");
        if (actif) setUtilisateur(moi);
      } catch {
        if (actif) setUtilisateur(null);
      } finally {
        if (actif) setChargement(false);
      }
    })();
    return () => { actif = false; };
  }, []);

  useEffect(() => {
    const surBlocage = (e) => {
      if (!connecte.current) return;
      setAccessToken(null);
      setUtilisateur(null);
      qc.clear();
      navigate("/en-attente", { replace: true, state: e.detail });
    };
    window.addEventListener("acces-bloque", surBlocage);
    return () => window.removeEventListener("acces-bloque", surBlocage);
  }, [navigate, qc]);

  const connexion = useCallback(async (email, password) => {
    qc.clear(); // aucune donnée d'un autre compte ne doit rester en cache
    const data = await api("/auth/connexion/", { method: "POST", body: { email, password } });
    setAccessToken(data.access);
    await sauverRefresh(data.refresh);
    setUtilisateur(data.utilisateur);
  }, [qc]);

  const deconnexion = useCallback(async () => {
    try {
      await desactiverPush().catch(() => {});
      const refresh = estNatif() ? await lireRefresh() : null;
      await api("/auth/deconnexion/", { method: "POST", body: refresh ? { refresh } : undefined });
    } finally {
      await effacerRefresh();
      setAccessToken(null);
      setUtilisateur(null);
      qc.clear();
      await effacerCacheHorsLigne(utilisateur?.id);
      await effacerFileHorsLigne(utilisateur?.id);
    }
  }, [qc, utilisateur?.id]);

  const connexionGoogle = useCallback(async (credential, statut) => {
    qc.clear();
    try {
      const data = await api("/auth/google/", {
        method: "POST", body: statut ? { credential, statut } : { credential } });
      if (data.access) {
        setAccessToken(data.access);
        await sauverRefresh(data.refresh);
        setUtilisateur(data.utilisateur);
        return { etat: "connecte" };
      }
      return { etat: "cree" };
    } catch (err) {
      if (err.status === 404 && err.data?.code === "inscription_requise") {
        return { etat: "statut_requis", infos: err.data };
      }
      throw err;
    }
  }, [qc]);

  const valeur = useMemo(
    () => ({ utilisateur, chargement, connexion, deconnexion, connexionGoogle }),
    [utilisateur, chargement, connexion, deconnexion, connexionGoogle]
  );
  return (
    <PersistQueryClientProvider client={qc} persistOptions={persistance}>
      <AuthContext.Provider value={valeur}>{children}</AuthContext.Provider>
    </PersistQueryClientProvider>
  );
}
