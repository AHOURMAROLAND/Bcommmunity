import { useState } from "react";
import { Check, Copy, MessageCircle, Share2, X } from "lucide-react";

export function ModalPartage({ publication, onClose }) {
  const [copie, setCopie] = useState(false);

  if (!publication) return null;

  // URL publique vers la vue Open Graph Django (/p/{id})
  const urlPartage = `${import.meta.env.VITE_SITE_URL || window.location.origin}/p/${publication.id}/`;
  const textePartage = `${publication.titre} - Bakhita Community\n${urlPartage}`;

  const copierLien = async () => {
    try {
      await navigator.clipboard.writeText(urlPartage);
      setCopie(true);
      setTimeout(() => setCopie(false), 2500);
    } catch {
      // Fallback
    }
  };

  const partagerNatif = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: publication.titre,
          text: `Découvrez cette publication sur Bakhita Community :`,
          url: urlPartage,
        });
        onClose();
      } catch {
        // Ignorer si l'utilisateur a annulé
      }
    } else {
      copierLien();
    }
  };

  const partagerWhatsapp = () => {
    const urlWa = `https://api.whatsapp.com/send?text=${encodeURIComponent(textePartage)}`;
    window.open(urlWa, "_blank");
    onClose();
  };

  return (
    <div className="modale-fond" onClick={onClose}>
      <div className="modale-boite" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>Partager la publication</h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{ background: "transparent", border: "none", color: "var(--texte-secondaire)", cursor: "pointer" }}
          >
            <X size={20} />
          </button>
        </div>

        <p style={{ fontSize: "0.9rem", color: "var(--texte-secondaire)", marginBottom: "1.25rem", lineHeight: 1.4 }}>
          {publication.apercu_public
            ? "Le lien génère un aperçu enrichi (titre, image et résumé) compatible WhatsApp et réseaux sociaux."
            : "Cette publication est marquée comme privée : seuls les membres connectés pourront y accéder."}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {Boolean(navigator.share) && (
            <button
              onClick={partagerNatif}
              className="bouton bouton-primaire"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
            >
              <Share2 size={18} />
              Partager via mon appareil
            </button>
          )}

          <button
            onClick={partagerWhatsapp}
            className="bouton"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              background: "#166534",
              color: "#ffffff",
              border: "none",
            }}
          >
            <MessageCircle size={18} />
            Partager sur WhatsApp
          </button>

          <button
            onClick={copierLien}
            className="bouton bouton-secondaire"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
          >
            {copie ? <Check size={18} color="#22c55e" /> : <Copy size={18} />}
            {copie ? "Lien copié dans le presse-papier" : "Copier le lien public"}
          </button>
        </div>
      </div>
    </div>
  );
}
