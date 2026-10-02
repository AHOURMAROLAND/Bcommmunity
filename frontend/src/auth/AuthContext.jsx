import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, rafraichir, setAccessToken } from "../api/client";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [utilisateur, setUtilisateur] = useState(null);
  const [chargement, setChargement] = useState(true);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const connecte = useRef(false);

  useEffect(() => { connecte.current = !!utilisateur; }, [utilisateur]);

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
    setUtilisateur(data.utilisateur);
  }, [qc]);

  const deconnexion = useCallback(async () => {
    try { await api("/auth/deconnexion/", { method: "POST" }); } finally {
      setAccessToken(null);
      setUtilisateur(null);
      qc.clear();
    }
  }, [qc]);

  const valeur = useMemo(
    () => ({ utilisateur, chargement, connexion, deconnexion }),
    [utilisateur, chargement, connexion, deconnexion]
  );
  return <AuthContext.Provider value={valeur}>{children}</AuthContext.Provider>;
}
