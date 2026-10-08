import { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import { rogner } from "../utils/image";
import { Bouton } from "./ui";

export const RATIOS_PUBLICATION = [
  { id: "16-9", label: "Paysage 16:9", valeur: 16 / 9 },
  { id: "4-3", label: "Classique 4:3", valeur: 4 / 3 },
  { id: "1-1", label: "Carré 1:1", valeur: 1 },
  { id: "4-5", label: "Portrait 4:5", valeur: 4 / 5 },
];

export default function RecadrageImage({
  fichier, coteMax, ratios = RATIOS_PUBLICATION, ratioDefaut = "4-3", rond = false,
  titre = "Recadrer l'image", onValider, onAnnuler,
}) {
  const [src, setSrc] = useState(null);
  const [ratio, setRatio] = useState(ratios.find((r) => r.id === ratioDefaut) ?? ratios[0]);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [zone, setZone] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const boite = useRef(null);
  const annuler = useRef(onAnnuler);
  annuler.current = onAnnuler;

  useEffect(() => {
    const url = URL.createObjectURL(fichier);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [fichier]);

  useEffect(() => {
    boite.current?.focus();
    const touche = (e) => e.key === "Escape" && annuler.current();
    const defilement = document.body.style.overflow;
    window.addEventListener("keydown", touche);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", touche);
      document.body.style.overflow = defilement;
    };
  }, []);

  const surZone = useCallback((_, pixels) => setZone(pixels), []);

  async function valider() {
    if (!zone || envoi) return;
    setEnvoi(true);
    setErreur("");
    try {
      const blob = await rogner(src, zone, coteMax);
      const ext = blob.type === "image/webp" ? "webp" : "jpg";
      await onValider(new File([blob], `image.${ext}`, { type: blob.type }));
    } catch (cause) {
      setErreur(cause instanceof Error && cause.message
        ? cause.message
        : "Impossible de traiter cette image. Essayez une autre photo.");
      setEnvoi(false);
    }
  }

  return (
    <div className="recadrage" role="dialog" aria-modal="true" aria-label={titre} tabIndex={-1} ref={boite}>
      <h2 style={{ margin: 0, padding: "0.9rem 1rem", textAlign: "center", fontSize: "1.1rem" }}>{titre}</h2>
      <div className="recadrage-zone">
        {src && (
          <Cropper image={src} crop={crop} zoom={zoom} aspect={ratio.valeur} minZoom={1} maxZoom={4}
            cropShape={rond ? "round" : "rect"} showGrid={!rond}
            onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={surZone} />
        )}
      </div>
      <div className="recadrage-bas">
        <p className="doux" style={{ margin: 0, fontSize: "0.85rem", textAlign: "center" }}>
          Faites glisser l'image pour la cadrer. Pincez ou utilisez le curseur pour zoomer.
        </p>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          <span style={{ fontWeight: 600 }}>Zoom</span>
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        </label>
        {ratios.length > 1 && (
          <div className="puces" style={{ marginBottom: 0 }} role="group" aria-label="Format du recadrage">
            {ratios.map((r) => (
              <button key={r.id} type="button" className="puce" aria-pressed={r.id === ratio.id}
                onClick={() => { setRatio(r); setZoom(1); setCrop({ x: 0, y: 0 }); }}>{r.label}</button>
            ))}
          </div>
        )}
        {erreur && <p role="alert" className="erreur" style={{ margin: 0 }}>{erreur}</p>}
        <div className="duo recadrage-actions">
          <Bouton secondaire onClick={onAnnuler}>Annuler</Bouton>
          <Bouton chargement={envoi} disabled={!zone} onClick={valider}>Valider le recadrage</Bouton>
        </div>
      </div>
    </div>
  );
}
