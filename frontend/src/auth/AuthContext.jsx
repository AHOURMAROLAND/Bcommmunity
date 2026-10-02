import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, rafraichir, setAccessToken } from "../api/client";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [utilisateur, setUtilisateur] = useState(null);
  const [chargement, setChargement] = useState(true);

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

  const connexion = useCallback(async (email, password) => {
    const data = await api("/auth/connexion/", { method: "POST", body: { email, password } });
    setAccessToken(data.access);
    setUtilisateur(data.utilisateur);
  }, []);

  const deconnexion = useCallback(async () => {
    try { await api("/auth/deconnexion/", { method: "POST" }); } finally {
      setAccessToken(null);
      setUtilisateur(null);
    }
  }, []);

  const valeur = useMemo(
    () => ({ utilisateur, chargement, connexion, deconnexion }),
    [utilisateur, chargement, connexion, deconnexion]
  );
  return <AuthContext.Provider value={valeur}>{children}</AuthContext.Provider>;
}
