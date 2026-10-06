import { useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Download, Share } from "lucide-react";
import useEnLigne from "../hooks/useEnLigne";
import useInstallation from "../hooks/useInstallation";
import { estNatif } from "../utils/plateforme";
import { Bouton } from "./ui";
import { useTempsReel } from "../temps-reel/TempsReel";

const CLE = "bk_install_masque";
const masque = () => { try { return Date.now() - Number(localStorage.getItem(CLE) || 0) < 7 * 86400000; } catch { return false; } };

export function BandeauHorsLigne() {
  if (useEnLigne()) return null;
  return <div className="bandeau-haut" role="status">Vous êtes hors ligne. Les informations affichées peuvent être anciennes.</div>;
}

export function BandeauSynchronisation() {
  const { fileHorsLigne, synchroniser } = useTempsReel();
  if (!fileHorsLigne.length) return null;
  const echecs = fileHorsLigne.filter((element) => element.derniereErreur).length;
  return (
    <div className="bandeau-haut bandeau-synchronisation" role="status">
      <span>
        {echecs
          ? `${echecs} élément${echecs > 1 ? "s" : ""} en attente d’une correction.`
          : navigator.onLine
            ? `${fileHorsLigne.length} élément${fileHorsLigne.length > 1 ? "s" : ""} en cours de synchronisation…`
            : `${fileHorsLigne.length} élément${fileHorsLigne.length > 1 ? "s" : ""} en attente de connexion.`}
      </span>
      {echecs > 0 && (
        <button type="button" className="lien" onClick={synchroniser}>
          Réessayer
        </button>
      )}
    </div>
  );
}

export function BandeauInstallation() {
  const { peutInstaller, ios, installer } = useInstallation();
  const [ferme, setFerme] = useState(masque);
  if (ferme || (!peutInstaller && !ios)) return null;
  const fermer = () => { try { localStorage.setItem(CLE, String(Date.now())); } catch { /* ignoré */ } setFerme(true); };
  return (
    <div className="bandeau carte" role="region" aria-label="Installer l'application">
      {ios ? (
        <p style={{ margin: 0 }}>
          <Share size={16} style={{ verticalAlign: "middle" }} /> Pour installer Bakhita : appuyez sur <strong>Partager</strong>,
          puis sur <strong>Sur l'écran d'accueil</strong>.
        </p>
      ) : <p style={{ margin: 0 }}><Download size={16} style={{ verticalAlign: "middle" }} /> Installez Bakhita sur votre écran d'accueil.</p>}
      <div className="duo" style={{ marginTop: "0.5rem" }}>
        <Bouton secondaire onClick={fermer}>{ios ? "Compris" : "Plus tard"}</Bouton>
        {!ios && <Bouton onClick={async () => { await installer(); fermer(); }}>Installer</Bouton>}
      </div>
    </div>
  );
}

function MiseAJourWeb() {
  const { needRefresh: [pret], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) { if (reg) setInterval(() => reg.update(), 60 * 60 * 1000); },
  });
  if (!pret) return null;
  return (
    <div className="bandeau-haut" role="status">
      Une nouvelle version est disponible.{" "}
      <button type="button" className="lien" style={{ background: "none", border: 0, font: "inherit", cursor: "pointer", color: "inherit", textDecoration: "underline" }}
        onClick={() => updateServiceWorker(true)}>Mettre à jour</button>
    </div>
  );
}
export const MiseAJour = () => (estNatif() ? null : <MiseAJourWeb />);
