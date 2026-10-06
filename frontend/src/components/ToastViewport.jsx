import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

const DUREE_TOAST = 3000;
const ICONES = {
  info: Info,
  succes: CheckCircle2,
  erreur: AlertCircle,
  avertissement: AlertCircle,
};

function Toast({ element, fermer }) {
  const Icone = ICONES[element.type] ?? ICONES.info;
  const role = element.type === "erreur" ? "alert" : "status";

  useEffect(() => {
    const timer = window.setTimeout(() => fermer(element.id), DUREE_TOAST);
    return () => window.clearTimeout(timer);
  }, [element.id, fermer]);

  return (
    <div className={`toast-carte toast-${element.type}`} role={role} aria-live={role === "alert" ? "assertive" : "polite"}>
      <span className="toast-icone" aria-hidden="true"><Icone size={19} /></span>
      <span className="toast-texte">{element.message}</span>
      <button type="button" className="toast-fermer" onClick={() => fermer(element.id)} aria-label="Fermer la notification">
        <X size={17} />
      </button>
      <span className="toast-progression" aria-hidden="true" />
    </div>
  );
}

export default function ToastViewport() {
  const [elements, setElements] = useState([]);

  useEffect(() => {
    const recevoir = (event) => {
      const nouvelElement = event.detail;
      if (!nouvelElement || typeof nouvelElement.message !== "string") return;
      setElements((courants) => [...courants.slice(-2), nouvelElement]);
    };
    window.addEventListener("bakhita:toast", recevoir);
    return () => window.removeEventListener("bakhita:toast", recevoir);
  }, []);

  const fermer = (id) => setElements((courants) => courants.filter((element) => element.id !== id));

  return (
    <div className="toast-viewport" aria-label="Notifications rapides">
      {elements.map((element) => <Toast key={element.id} element={element} fermer={fermer} />)}
    </div>
  );
}
