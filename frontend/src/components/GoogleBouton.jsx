import { useEffect, useRef, useState } from "react";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
let chargement = null;

function chargerScript() {
  chargement ??= new Promise((ok, ko) => {
    if (window.google?.accounts?.id) return ok();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = ok;
    s.onerror = () => { chargement = null; ko(new Error("Chargement de Google impossible")); };
    document.head.appendChild(s);
  });
  return chargement;
}

export default function GoogleBouton({ onCredential, texte = "signin_with" }) {
  const conteneur = useRef(null);
  const rappel = useRef(onCredential);
  const [erreurGoogle, setErreurGoogle] = useState(false);
  useEffect(() => {
    rappel.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!CLIENT_ID) return undefined;
    let actif = true;
    chargerScript().then(() => {
      if (!actif || !conteneur.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID, callback: (r) => rappel.current(r.credential) });
      window.google.accounts.id.renderButton(conteneur.current, {
        type: "standard", theme: "outline", size: "large", shape: "pill", locale: "fr", text: texte,
        width: Math.min(conteneur.current.offsetWidth || 320, 400) });
    }).catch(() => {
      if (actif) setErreurGoogle(true);
    });
    return () => { actif = false; };
  }, [texte]);

  if (!CLIENT_ID) {
    return (
      <button
        type="button"
        className="google-configuration-requise"
        disabled
        title="Configurez VITE_GOOGLE_CLIENT_ID dans le fichier .env à la racine."
      >
        <span aria-hidden="true">G</span>
        Continuer avec Google — configuration requise
      </button>
    );
  }
  if (erreurGoogle) {
    return (
      <p className="google-erreur" role="status">
        Le bouton Google ne s’est pas chargé. Vérifiez votre connexion puis rechargez la page.
      </p>
    );
  }
  return <div ref={conteneur} style={{ display: "flex", justifyContent: "center", minHeight: 44 }} />;
}
