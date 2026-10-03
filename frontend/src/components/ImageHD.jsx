import { useEffect, useState } from "react";
import { X } from "lucide-react";

// Le navigateur choisit la bonne taille (480, 1080 ou 2048 px) selon l'écran et sa densité.
export default function ImageHD({ img, alt = "", sizes = "(min-width: 640px) 36rem, 100vw", prioritaire = false }) {
  if (!img) return null;
  return (
    <img className="image-pub" src={img.moyenne ?? img.src} srcSet={img.srcset || undefined} sizes={sizes}
      width={img.largeur || undefined} height={img.hauteur || undefined} alt={alt}
      loading={prioritaire ? "eager" : "lazy"} fetchPriority={prioritaire ? "high" : "auto"} decoding="async"
      style={img.largeur && img.hauteur ? { aspectRatio: `${img.largeur} / ${img.hauteur}` } : undefined} />
  );
}

// Page de la publication : un clic ouvre l'image principale (jusqu'à 2048 px) en plein écran.
export function ImageZoom({ img, alt = "" }) {
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    if (!ouvert) return undefined;
    const touche = (e) => e.key === "Escape" && setOuvert(false);
    const defilement = document.body.style.overflow;
    window.addEventListener("keydown", touche);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", touche); document.body.style.overflow = defilement; };
  }, [ouvert]);

  if (!img) return null;
  return (
    <>
      <button type="button" className="zoom" onClick={() => setOuvert(true)} aria-label="Agrandir l'image">
        <ImageHD img={img} alt={alt} prioritaire />
      </button>
      {ouvert && (
        <div className="visionneuse" role="dialog" aria-modal="true" aria-label="Image en grand" onClick={() => setOuvert(false)}>
          <button type="button" className="puce" aria-label="Fermer" autoFocus onClick={() => setOuvert(false)}><X size={18} /></button>
          <img src={img.src} alt={alt} decoding="async" />
        </div>
      )}
    </>
  );
}
