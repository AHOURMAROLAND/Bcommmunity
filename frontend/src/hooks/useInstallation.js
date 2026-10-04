import { useEffect, useState } from "react";
import { estNatif } from "../utils/plateforme";
import { estIOS, estInstalle } from "../utils/push";

let evenement = null;
const abonnes = new Set();
const prevenir = () => abonnes.forEach((f) => f());
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); evenement = e; prevenir(); });
window.addEventListener("appinstalled", () => { evenement = null; prevenir(); });

export default function useInstallation() {
  const [, maj] = useState(0);
  useEffect(() => { const f = () => maj((n) => n + 1); abonnes.add(f); return () => abonnes.delete(f); }, []);
  const installee = estNatif() || estInstalle();
  return {
    installee,
    peutInstaller: !installee && !!evenement,
    ios: !installee && estIOS(),
    async installer() {
      if (!evenement) return;
      evenement.prompt();
      await evenement.userChoice;
      evenement = null;
      prevenir();
    },
  };
}
