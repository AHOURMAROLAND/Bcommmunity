import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function GalerieCarousel({ photos = [] }) {
  const liste = photos.filter(Boolean);
  const [selection, setSelection] = useState({ longueur: liste.length, index: 0 });
  const [transition, setTransition] = useState(true);
  const courant = selection.longueur === liste.length
    ? Math.min(selection.index, liste.length)
    : 0;

  useEffect(() => {
    if (liste.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setSelection((precedente) => ({
        longueur: liste.length,
        index: (precedente.longueur === liste.length ? precedente.index : 0) + 1,
      }));
    }, 5000);
    return () => window.clearInterval(timer);
  }, [liste.length]);

  if (!liste.length) return null;
  function changer(delta) {
    if (delta > 0) {
      setSelection({ longueur: liste.length, index: courant + 1 });
    } else if (courant === 0) {
      setTransition(false);
      setSelection({ longueur: liste.length, index: liste.length });
      window.requestAnimationFrame(() => {
        setSelection({ longueur: liste.length, index: liste.length - 1 });
        setTransition(true);
      });
    } else {
      setSelection({ longueur: liste.length, index: courant - 1 });
    }
  }

  function terminerTransition() {
    if (courant === liste.length) {
      setTransition(false);
      setSelection({ longueur: liste.length, index: 0 });
      window.requestAnimationFrame(() => setTransition(true));
    }
  }

  return (
    <section aria-label="Galerie de photos" style={{ margin: "1rem 0", position: "relative" }}>
      <div style={{ overflow: "hidden", borderRadius: "1rem", background: "var(--carte)" }}>
        <div
          onTransitionEnd={terminerTransition}
          style={{
            display: "flex",
            transform: `translateX(-${courant * 100}%)`,
            transition: transition ? "transform 550ms ease-in-out" : "none",
          }}
        >
          {[...liste, ...(liste.length > 1 ? [liste[0]] : [])].map((photo, index) => (
            <img
              key={`${photo}-${index}`}
              src={photo}
              alt={`Photo ${(index % liste.length) + 1} sur ${liste.length}`}
              loading="lazy"
              style={{
                flex: "0 0 100%", width: "100%", maxHeight: "28rem", objectFit: "cover",
              }}
            />
          ))}
        </div>
      </div>
      {liste.length > 1 && (
        <>
          <button
            type="button" className="puce" aria-label="Photo précédente"
            onClick={() => changer(-1)}
            style={{ position: "absolute", top: "50%", left: ".5rem", transform: "translateY(-50%)" }}
          ><ChevronLeft size={20} /></button>
          <button
            type="button" className="puce" aria-label="Photo suivante"
            onClick={() => changer(1)}
            style={{ position: "absolute", top: "50%", right: ".5rem", transform: "translateY(-50%)" }}
          ><ChevronRight size={20} /></button>
          <div aria-live="polite" style={{
            position: "absolute", right: ".75rem", bottom: ".75rem",
            padding: ".2rem .6rem", borderRadius: "1rem", color: "#fff", background: "#0009",
          }}>{(courant % liste.length) + 1} / {liste.length}</div>
        </>
      )}
    </section>
  );
}
