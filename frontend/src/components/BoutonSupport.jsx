import { useEffect, useRef, useState } from "react";
import { Bug, Camera, ImagePlus, MessageSquarePlus, Video, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { afficherToast } from "../utils/toast";

const MAX_FICHIERS = 5;
const MAX_TAILLE = 20 * 1024 * 1024;

function bornerPosition(point) {
  return {
    x: Math.min(Math.max(point.x, 8), Math.max(8, window.innerWidth - 64)),
    y: Math.min(Math.max(point.y, 8), Math.max(8, window.innerHeight - 64)),
  };
}

export default function BoutonSupport() {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState("bug");
  const [commentaire, setCommentaire] = useState("");
  const [fichiers, setFichiers] = useState([]);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const [capture, setCapture] = useState(false);
  const [position, setPosition] = useState(() => {
    try {
      const sauvegardee = JSON.parse(localStorage.getItem("bouton-support-position"));
      if (Number.isFinite(sauvegardee?.x) && Number.isFinite(sauvegardee?.y)) {
        return bornerPosition(sauvegardee);
      }
    } catch {
      return bornerPosition({ x: window.innerWidth - 72, y: window.innerHeight - 112 });
    }
    return bornerPosition({ x: window.innerWidth - 72, y: window.innerHeight - 112 });
  });
  const videoRef = useRef(null);
  const boutonRef = useRef(null);
  const dragRef = useRef(null);
  const clicIgnoreRef = useRef(false);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const timerRef = useRef(null);
  const { data, isError } = useQuery({
    queryKey: ["configuration-support"],
    queryFn: () => api("/signalements/configuration/"),
    staleTime: 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (isError) afficherToast("Impossible de vérifier la disponibilité du support.", "erreur");
  }, [isError]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    const redimensionner = () => setPosition((actuelle) => bornerPosition(actuelle));
    window.addEventListener("resize", redimensionner);
    return () => window.removeEventListener("resize", redimensionner);
  }, []);

  if (!data?.visible) return null;

  function ajouter(nouveaux) {
    setErreur("");
    const fusion = [...fichiers, ...Array.from(nouveaux)];
    if (fusion.length > MAX_FICHIERS) {
      setErreur(`Vous pouvez joindre au maximum ${MAX_FICHIERS} fichiers.`);
      return;
    }
    if (fusion.reduce((total, file) => total + file.size, 0) > MAX_TAILLE) {
      setErreur("La taille totale des pièces jointes ne peut pas dépasser 20 Mo.");
      return;
    }
    if (fusion.some((file) => !file.type.startsWith("image/") && !file.type.startsWith("video/"))) {
      setErreur("Seules les images et les vidéos sont acceptées.");
      return;
    }
    setFichiers(fusion);
  }

  async function capturerEcran(enregistrerVideo = false) {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setErreur("La capture d’écran n’est pas disponible sur cet appareil. Choisissez une image ou une vidéo dans votre galerie.");
      return;
    }
    try {
      const flux = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      streamRef.current = flux;
      if (enregistrerVideo) {
        const recorder = new MediaRecorder(flux, { videoBitsPerSecond: 1_500_000 });
        mediaRecorderRef.current = recorder;
        const morceaux = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size) morceaux.push(event.data);
        };
        recorder.onstop = () => {
          window.clearTimeout(timerRef.current);
          if (morceaux.length) {
            const video = new File(morceaux, `capture-${Date.now()}.webm`, {
              type: recorder.mimeType || "video/webm",
            });
            ajouter([video]);
          }
          flux.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          setCapture(false);
        };
        recorder.start();
        timerRef.current = window.setTimeout(() => {
          if (recorder.state === "recording") recorder.stop();
        }, 15_000);
        setCapture(true);
        return;
      }
      const video = document.createElement("video");
      video.srcObject = flux;
      await video.play();
      await new Promise((resolve) => {
        if (video.videoWidth) resolve();
        else video.addEventListener("loadedmetadata", resolve, { once: true });
      });
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("La capture d’écran n’a pas pu être créée.");
      ajouter([new File([blob], `capture-${Date.now()}.png`, { type: "image/png" })]);
      flux.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    } catch (e) {
      if (e.name !== "NotAllowedError" && e.name !== "AbortError") {
        setErreur(e.message || "La capture d’écran a échoué.");
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCapture(false);
    }
  }

  async function soumettre(event) {
    event.preventDefault();
    setErreur("");
    setEnvoi(true);
    const formulaire = new FormData();
    formulaire.append("type", "retour");
    formulaire.append("motif", motif);
    formulaire.append("commentaire", commentaire);
    formulaire.append("chemin", window.location.pathname);
    fichiers.forEach((fichier) => formulaire.append("fichiers", fichier));
    try {
      await api("/signalements/", { method: "POST", formData: formulaire });
      setEnvoye(true);
      setCommentaire("");
      setFichiers([]);
    } catch (e) {
      setErreur(e.message || "L’envoi a échoué. Réessayez.");
    } finally {
      setEnvoi(false);
    }
  }

  function fermer() {
    window.clearTimeout(timerRef.current);
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCapture(false);
    setOuvert(false);
    setErreur("");
    setEnvoye(false);
  }

  function deplacer(event) {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    if (!dragRef.current.deplace && Math.hypot(dx, dy) < 5) return;
    dragRef.current.deplace = true;
    clicIgnoreRef.current = true;
    setPosition(bornerPosition({
      x: dragRef.current.position.x + dx,
      y: dragRef.current.position.y + dy,
    }));
  }

  function terminerDeplacement() {
    if (!dragRef.current) return;
    const deplace = dragRef.current.deplace;
    dragRef.current = null;
    if (deplace) {
      try {
        localStorage.setItem("bouton-support-position", JSON.stringify(position));
      } catch {
        afficherToast("La position du bouton ne peut pas être mémorisée sur cet appareil.", "erreur");
      }
      window.setTimeout(() => { clicIgnoreRef.current = false; }, 0);
    }
  }

  return (
    <>
      <button
        ref={boutonRef}
        type="button"
        aria-label="Signaler un bug ou envoyer une suggestion"
        title="Signaler un bug ou envoyer une suggestion"
        onPointerDown={(event) => {
          dragRef.current = {
            x: event.clientX,
            y: event.clientY,
            position: position ?? { x: 8, y: 8 },
            deplace: false,
          };
          boutonRef.current?.setPointerCapture(event.pointerId);
        }}
        onPointerMove={deplacer}
        onPointerUp={terminerDeplacement}
        onPointerCancel={terminerDeplacement}
        onClick={() => {
          if (clicIgnoreRef.current) {
            clicIgnoreRef.current = false;
            return;
          }
          setOuvert(true);
        }}
        style={{
          position: "fixed", left: position?.x ?? "auto", top: position?.y ?? "auto",
          right: position ? "auto" : "1rem", bottom: position ? "auto" : "5.5rem",
          zIndex: 1000,
          width: "3.5rem", height: "3.5rem", border: 0, borderRadius: "50%",
          display: "grid", placeItems: "center", color: "#fff", background: "#2563eb",
          boxShadow: "0 5px 20px #0004", cursor: "grab", touchAction: "none",
        }}
      >
        <MessageSquarePlus size={23} />
      </button>
      {ouvert && (
        <div
          role="presentation"
          onClick={(event) => event.target === event.currentTarget && fermer()}
          style={{
            position: "fixed", inset: 0, zIndex: 1100, display: "grid", placeItems: "center",
            padding: "1rem", background: "#0009",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="titre-retour-test"
            style={{
              width: "min(100%, 32rem)", maxHeight: "90dvh", overflowY: "auto",
              padding: "1.25rem", borderRadius: "1.25rem", color: "var(--texte)",
              background: "var(--surface-raised)", border: "1px solid var(--bordure)",
            }}
          >
            <header style={{ display: "flex", alignItems: "center", gap: ".7rem", marginBottom: "1rem" }}>
              <MessageSquarePlus size={21} />
              <h2 id="titre-retour-test" style={{ margin: 0, flex: 1 }}>Retour de test</h2>
              <button type="button" className="puce" onClick={fermer} aria-label="Fermer"><X size={18} /></button>
            </header>
            {envoye ? (
              <div role="status">
                <p>Merci, votre retour a été envoyé à l’équipe.</p>
                <button type="button" className="btn" onClick={fermer}>Fermer</button>
              </div>
            ) : (
              <form onSubmit={soumettre}>
                <div className="puces" role="group" aria-label="Type de retour">
                  <button type="button" className="puce" aria-pressed={motif === "bug"} onClick={() => setMotif("bug")}>
                    <Bug size={16} /> Signaler un bug
                  </button>
                  <button type="button" className="puce" aria-pressed={motif === "suggestion"} onClick={() => setMotif("suggestion")}>
                    <MessageSquarePlus size={16} /> Suggérer une fonction
                  </button>
                </div>
                <label htmlFor="texte-retour" style={{ display: "block", margin: "1rem 0 .35rem", fontWeight: 600 }}>
                  Décris le problème ou ta suggestion
                </label>
                <textarea
                  id="texte-retour" className="champ" rows={4} maxLength={2000}
                  value={commentaire} onChange={(e) => setCommentaire(e.target.value)}
                  placeholder="Que s’est-il passé ? Qu’aimerais-tu améliorer ?"
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem", marginTop: ".75rem" }}>
                  <button type="button" className="puce" onClick={() => capturerEcran(false)}>
                    <Camera size={16} /> Capture d’écran
                  </button>
                  {capture ? (
                    <button type="button" className="puce" onClick={() => mediaRecorderRef.current?.stop()}>
                      Arrêter la vidéo
                    </button>
                  ) : (
                    <button type="button" className="puce" onClick={() => capturerEcran(true)}>
                      <Video size={16} /> Enregistrer l’écran
                    </button>
                  )}
                  <label className="puce" style={{ display: "inline-flex", alignItems: "center", gap: ".35rem", cursor: "pointer" }}>
                    <ImagePlus size={16} /> Galerie
                    <input
                      ref={videoRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                      multiple
                      hidden
                      onChange={(e) => { ajouter(e.target.files ?? []); e.target.value = ""; }}
                    />
                  </label>
                </div>
                {fichiers.length > 0 && (
                  <ul style={{ paddingLeft: "1.25rem" }}>
                    {fichiers.map((fichier, index) => (
                      <li key={`${fichier.name}-${index}`} style={{ marginTop: ".35rem" }}>
                        {fichier.name} ({Math.ceil(fichier.size / 1024)} Ko)
                        <button
                          type="button" className="puce" aria-label={`Retirer ${fichier.name}`}
                          onClick={() => setFichiers((actuels) => actuels.filter((_, i) => i !== index))}
                          style={{ marginLeft: ".5rem" }}
                        ><X size={14} /></button>
                      </li>
                    ))}
                  </ul>
                )}
                {erreur && <p role="alert" className="erreur">{erreur}</p>}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: ".6rem", marginTop: "1rem" }}>
                  <button type="button" className="btn btn-sec" onClick={fermer}>Annuler</button>
                  <button className="btn" type="submit" disabled={envoi || capture || (!commentaire.trim() && !fichiers.length)}>
                    {envoi ? "Envoi…" : "Envoyer"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
