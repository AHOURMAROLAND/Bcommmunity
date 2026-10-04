import { useEffect, useState } from "react";
import { LoadingIndicator } from "./application/loading-indicator/loading-indicator";

/**
 * Retourne true uniquement après `ms` ms d'activité continue.
 * Evite les clignotements sur les requêtes rapides.
 */
export function useApresDelai(actif, ms = 800) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!actif) { setVisible(false); return undefined; }
    const t = setTimeout(() => setVisible(true), ms);
    return () => clearTimeout(t);
  }, [actif, ms]);
  return visible;
}

/**
 * Voile plein écran bloquant les clics.
 * Utilisé pour : publication, connexion, envoi de photo, export image.
 */
export default function ChargementLong({ actif, delai = 800, label = "Chargement..." }) {
  const visible = useApresDelai(actif, delai);
  if (!visible) return null;
  return (
    <div className="voile" role="status" aria-live="polite" aria-busy="true" aria-label={label}>
      <div className="voile-boite">
        <LoadingIndicator type="dot-circle" size="md" label={label} />
      </div>
    </div>
  );
}

/**
 * Indicateur en ligne (sans voile) : reconnexion chat, zone qui se recharge.
 */
export function ChargementEnLigne({ actif, delai = 400, label }) {
  const visible = useApresDelai(actif, delai);
  if (!visible) return null;
  return (
    <div className="en-ligne" role="status" aria-live="polite" aria-label={label}>
      <LoadingIndicator type="dot-circle" size="sm" label={label} />
    </div>
  );
}
