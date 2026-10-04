import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { estNatif } from "../utils/plateforme";
import { initialiserPushNatif } from "../utils/push";

export default function PontNatif() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { utilisateur, chargement } = useAuth();
  const chemin = useRef(pathname);
  chemin.current = pathname;

  useEffect(() => { // cache l'écran de démarrage quand l'état de connexion est connu
    if (!estNatif() || chargement) return;
    import("@capacitor/splash-screen").then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 200 }));
  }, [chargement]);

  useEffect(() => { // bouton Retour d'Android
    if (!estNatif()) return undefined;
    let actif = true, poignee;
    import("@capacitor/app").then(async ({ App }) => {
      const h = await App.addListener("backButton", () => {
        if (["/fil", "/connexion"].includes(chemin.current)) App.exitApp(); else navigate(-1);
      });
      if (actif) poignee = h; else h.remove();
    });
    return () => { actif = false; poignee?.remove(); };
  }, [navigate]);

  useEffect(() => {
    if (estNatif() && utilisateur) initialiserPushNatif(navigate).catch(() => {});
  }, [utilisateur, navigate]);

  return null;
}
