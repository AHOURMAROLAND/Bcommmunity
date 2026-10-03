import { useState } from "react";
import { Image as ImageIcon, Loader2, Trash2, X } from "lucide-react";
import { useCreerPublication, useModifierPublication } from "../api/publications";

export function ModalCreerPublication({ publication, onClose }) {
  const estModification = Boolean(publication?.id);
  const creer = useCreerPublication();
  const modifier = useModifierPublication();

  const [titre, setTitre] = useState(publication?.titre || "");
  const [contenu, setContenu] = useState(publication?.contenu || "");
  const [statut, setStatut] = useState(publication?.statut || "publie");
  const [apercuPublic, setApercuPublic] = useState(
    publication?.apercu_public !== undefined ? publication.apercu_public : true
  );

  const [fichierImage, setFichierImage] = useState(null);
  const [apercuUrl, setApercuUrl] = useState(publication?.image || null);
  const [supprimerImageExistante, setSupprimerImageExistante] = useState(false);
  const [erreur, setErreur] = useState(null);

  const enCours = creer.isPending || modifier.isPending;

  const onSelectionnerImage = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setErreur("L'image sélectionnée dépasse la taille maximale autorisée de 5 Mo.");
      return;
    }
    setErreur(null);
    setFichierImage(f);
    setApercuUrl(URL.createObjectURL(f));
    setSupprimerImageExistante(false);
  };

  const onRetirerImage = () => {
    setFichierImage(null);
    setApercuUrl(null);
    if (estModification && publication?.image) {
      setSupprimerImageExistante(true);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErreur(null);

    if (titre.trim().length < 3) {
      setErreur("Le titre doit comporter au moins 3 caractères.");
      return;
    }
    if (contenu.trim().length < 5) {
      setErreur("Le contenu doit comporter au moins 5 caractères.");
      return;
    }

    const fd = new FormData();
    fd.append("titre", titre.trim());
    fd.append("contenu", contenu.trim());
    fd.append("statut", statut);
    fd.append("apercu_public", apercuPublic);

    if (fichierImage) {
      fd.append("image", fichierImage);
    } else if (supprimerImageExistante) {
      fd.append("supprimer_image", "true");
    }

    try {
      if (estModification) {
        await modifier.mutateAsync({ id: publication.id, formData: fd });
      } else {
        await creer.mutateAsync(fd);
      }
      onClose();
    } catch (err) {
      const msg = err.data?.detail || err.data?.image || err.data?.titre || "Une erreur est survenue lors de l'enregistrement.";
      setErreur(Array.isArray(msg) ? msg.join(" ") : String(msg));
    }
  };

  return (
    <div className="modale-fond" onClick={onClose}>
      <div className="modale-boite" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
            {estModification ? "Modifier la publication" : "Créer une publication"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{ background: "transparent", border: "none", color: "var(--texte-secondaire)", cursor: "pointer" }}
          >
            <X size={20} />
          </button>
        </div>

        {erreur && (
          <div className="alerte-erreur" style={{ marginBottom: "1rem" }}>
            {erreur}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className="champ-label" htmlFor="pub-titre">Titre</label>
            <input
              id="pub-titre"
              type="text"
              className="champ-input"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="Ex : Retrouvailles promo 2012, nouvelle opportunité..."
              required
              maxLength={200}
            />
          </div>

          <div>
            <label className="champ-label" htmlFor="pub-contenu">Contenu</label>
            <textarea
              id="pub-contenu"
              className="champ-input"
              rows={5}
              value={contenu}
              onChange={(e) => setContenu(e.target.value)}
              placeholder="Partagez votre message, vos nouvelles ou vos projets avec la communauté..."
              required
              style={{ resize: "vertical" }}
            />
          </div>

          {/* Section Image */}
          <div>
            <span className="champ-label" style={{ display: "block" }}>Illustration (optionnelle, max 5 Mo)</span>
            {apercuUrl ? (
              <div style={{ position: "relative", borderRadius: "0.75rem", overflow: "hidden", border: "1px solid var(--bordure)", maxHeight: "220px" }}>
                <img
                  src={apercuUrl}
                  alt="Aperçu"
                  style={{ width: "100%", height: "200px", objectFit: "cover", display: "block" }}
                />
                <button
                  type="button"
                  onClick={onRetirerImage}
                  style={{
                    position: "absolute",
                    top: "0.5rem",
                    right: "0.5rem",
                    background: "rgba(0, 0, 0, 0.7)",
                    color: "#f87171",
                    border: "none",
                    borderRadius: "0.5rem",
                    padding: "0.4rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    fontSize: "0.8rem",
                  }}
                >
                  <Trash2 size={16} />
                  Retirer
                </button>
              </div>
            ) : (
              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "1.5rem",
                  border: "2px dashed var(--bordure)",
                  borderRadius: "0.75rem",
                  cursor: "pointer",
                  color: "var(--texte-secondaire)",
                  gap: "0.5rem",
                  transition: "border-color 0.2s ease",
                }}
              >
                <ImageIcon size={28} />
                <span style={{ fontSize: "0.9rem" }}>Cliquez pour choisir une photo (JPEG, PNG, WebP)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={onSelectionnerImage}
                  style={{ display: "none" }}
                />
              </label>
            )}
          </div>

          {/* Options de visibilité */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", paddingTop: "0.5rem", borderTop: "1px solid var(--bordure)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.9rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={apercuPublic}
                onChange={(e) => setApercuPublic(e.target.checked)}
              />
              <span>Autoriser l'aperçu public (recommandé pour le partage WhatsApp)</span>
            </label>

            <div style={{ display: "flex", alignItems: "center", gap: "1rem", fontSize: "0.9rem" }}>
              <span style={{ color: "var(--texte-secondaire)" }}>État :</span>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="statut"
                  value="publie"
                  checked={statut === "publie"}
                  onChange={() => setStatut("publie")}
                />
                Publier
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="statut"
                  value="brouillon"
                  checked={statut === "brouillon"}
                  onChange={() => setStatut("brouillon")}
                />
                Brouillon
              </label>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
            <button
              type="button"
              className="bouton bouton-secondaire"
              onClick={onClose}
              disabled={enCours}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="bouton bouton-primaire"
              disabled={enCours}
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              {enCours && <Loader2 size={16} className="rotation" />}
              {estModification ? "Enregistrer" : statut === "brouillon" ? "Enregistrer le brouillon" : "Publier"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
