import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Check, CheckCheck, ChevronUp, Copy, ExternalLink, File as FileIcon, Flag, Forward,
  Link2, Mic, MoreHorizontal, Paperclip, Pause, Pencil, Pin, Play, Reply,
  Search, Send, Smile, Star, Timer, Trash2, X,
} from "lucide-react";
import { api } from "../api/client";
import { estErreurReseau } from "../api/stockage-hors-ligne";
import {
  useConversation, useConversations, useMessages, useRechercheMessages,
} from "../api/discussions";
import { useAuth } from "../auth/AuthContext";
import { majMessage, useTempsReel } from "../temps-reel/TempsReel";
import Avatar from "../components/Avatar";
import ModaleSignalement from "../components/ModaleSignalement";
import { Bouton } from "../components/ui";
import { Sq } from "../components/Squelettes";
import { afficherToast } from "../utils/toast";
import { estNatif } from "../utils/plateforme";
import { definirBlocageCaptures } from "../utils/protectionCaptures";

const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const DATE = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const REACTIONS = ["❤️", "👍", "😂", "😮", "😢"];
const heure = (iso) => HEURE.format(new Date(iso));
const tailleLisible = (octets = 0) =>
  octets < 1024 * 1024 ? `${Math.max(1, Math.round(octets / 1024))} Ko` : `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
const dureeLisible = (secondes = 0) =>
  `${String(Math.floor(secondes / 60)).padStart(2, "0")}:${String(Math.floor(secondes % 60)).padStart(2, "0")}`;
const dureeChrono = (millisecondes = 0) => {
  const secondes = Math.floor(millisecondes / 1000);
  return `${String(Math.floor(secondes / 60)).padStart(2, "0")}:${String(secondes % 60).padStart(2, "0")}`;
};

function compacterNiveaux(niveaux, nombre = 48) {
  if (!niveaux.length) return [];
  const pics = Array.from({ length: nombre }, (_, index) => {
    const debut = Math.floor(index * niveaux.length / nombre);
    const fin = Math.max(debut + 1, Math.floor((index + 1) * niveaux.length / nombre));
    return Math.max(...niveaux.slice(debut, fin));
  });
  const maximum = Math.max(...pics, 0.001);
  return pics.map((pic) => Math.round(Math.max(0.04, pic / maximum) * 100) / 100);
}

function libelleJour(iso) {
  const date = new Date(iso);
  const aujourdHui = new Date();
  const hier = new Date(aujourdHui);
  hier.setDate(hier.getDate() - 1);
  const memeJour = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (memeJour(date, aujourdHui)) return "Aujourd'hui";
  if (memeJour(date, hier)) return "Hier";
  return DATE.format(date);
}

function fermePushConversation(convId) {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready.then((reg) => {
    reg.getNotifications({ tag: `conv-${convId}` }).then((notifs) => {
      notifs.forEach((n) => n.close());
    }).catch(() => {});
  }).catch(() => {});
}

function BulleVocale({ message, moi }) {
  const audio = useRef(null);
  const [lecture, setLecture] = useState(false);
  const [progression, setProgression] = useState(0);
  const barres = message.forme_onde?.length
    ? message.forme_onde
    : Array.from({ length: 48 }, () => 0.08);

  return (
    <div className={`audio-msg${moi ? " moi" : ""}`}>
      <audio
        ref={audio}
        src={message.fichier_url}
        onEnded={() => setLecture(false)}
        onPause={() => setLecture(false)}
        onPlay={() => setLecture(true)}
        onTimeUpdate={(event) => {
          const element = event.currentTarget;
          setProgression(element.duration ? element.currentTime / element.duration : 0);
        }}
        preload="metadata"
      />
      <button
        type="button"
        className="audio-lecture"
        aria-label={lecture ? "Mettre en pause le message vocal" : "Lire le message vocal"}
        onClick={() => {
          if (lecture) audio.current?.pause();
          else audio.current?.play().catch(() => setLecture(false));
        }}
      >
        {lecture ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
      </button>
      <span className="audio-ondes" aria-hidden="true">
        {barres.map((niveau, index) => (
          <i
            key={index}
            className={index / barres.length <= progression ? "jouee" : ""}
            style={{ height: `${Math.max(3, niveau * 32)}px` }}
          />
        ))}
      </span>
      <span className="audio-duree">{dureeLisible(message.duree_vocale)}</span>
    </div>
  );
}

function CarteFichier({ message }) {
  const extension = message.nom_fichier?.split(".").pop()?.toUpperCase() || "FILE";
  return (
    <a
      className="fichier-msg"
      href={message.fichier_url}
      target="_blank"
      rel="noreferrer"
      download={message.nom_fichier || true}
    >
      <span className={`fichier-icone ${extension === "PDF" ? "pdf" : extension === "JPG" || extension === "PNG" ? "image" : ""}`}>
        <FileIcon size={21} />
        <small>{extension.slice(0, 4)}</small>
      </span>
      <span className="fichier-infos">
        <strong>{message.nom_fichier || "Fichier joint"}</strong>
        <small>{tailleLisible(message.taille_fichier)}</small>
      </span>
    </a>
  );
}

function ApercuLien({ href }) {
  const apercu = useQuery({
    queryKey: ["apercu-lien", href],
    queryFn: () => api(`/discussions/apercu-lien/?url=${encodeURIComponent(href)}`),
    staleTime: 6 * 60 * 60 * 1000,
    retry: false,
  });
  if (!apercu.data) {
    const domaine = new URL(href).host;
    return (
      <a className="lien-apercu" href={href} target="_blank" rel="noreferrer">
        <span className="lien-apercu-icone"><Link2 size={16} /></span>
        <span><strong>{domaine}</strong><small>{domaine}</small></span>
        <ExternalLink size={14} />
      </a>
    );
  }
  return (
    <a className="lien-apercu lien-apercu-og" href={href} target="_blank" rel="noreferrer">
      <span className="lien-apercu-contenu">
        <strong>{apercu.data.titre || apercu.data.domaine}</strong>
        {apercu.data.description && <small>{apercu.data.description}</small>}
        <small>{apercu.data.domaine}</small>
      </span>
      <ExternalLink size={14} />
    </a>
  );
}

function TexteMessage({ texte }) {
  const match = texte.match(/https?:\/\/[^\s]+/i);
  if (!match) return <p>{texte}</p>;
  const urlBrute = match[0].replace(/[),.!?]+$/, "");
  let url;
  try {
    url = new URL(urlBrute);
  } catch {
    return <p>{texte}</p>;
  }
  const avant = texte.slice(0, match.index);
  const apres = texte.slice(match.index + urlBrute.length);
  return (
    <>
      <p>
        {avant}
        <a href={url.href} target="_blank" rel="noreferrer">{urlBrute}</a>
        {apres}
      </p>
      <ApercuLien href={url.href} />
    </>
  );
}

/** Ferme les notifications push OS liées à cette conversation. */
export default function Conversation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { utilisateur } = useAuth();
  const {
    envoyer, abonner, mettreEnFile, etat, fileHorsLigne, retenterElement,
  } = useTempsReel();
  const tempsReelActif = etat === "ouvert";
  const conv = useConversation(id, tempsReelActif);
  const conversations = useConversations(tempsReelActif);
  const msgs = useMessages(id, tempsReelActif);
  const configurationSecurite = useQuery({
    queryKey: ["configuration-securite-discussions"],
    queryFn: () => api("/discussions/configuration-securite/"),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const erreurSecuriteSignalee = useRef(false);

  useEffect(() => {
    if (!estNatif()) return;
    if (configurationSecurite.isError) {
      definirBlocageCaptures(true).catch((erreur) => {
        console.error("Impossible d’activer la protection des captures d’écran.", erreur);
      });
      if (!erreurSecuriteSignalee.current) {
        erreurSecuriteSignalee.current = true;
        afficherToast(
          "Impossible de vérifier le réglage de sécurité. Les captures sont bloquées par précaution.",
          "erreur",
        );
      }
      return;
    }
    if (configurationSecurite.data) {
      erreurSecuriteSignalee.current = false;
      definirBlocageCaptures(configurationSecurite.data.bloquer_captures_ecran).catch((erreur) => {
        afficherToast("Impossible d’appliquer la protection des captures d’écran.", "erreur");
        console.error("Erreur du module Android de protection des captures.", erreur);
      });
    }
  }, [configurationSecurite.data, configurationSecurite.isError]);

  useEffect(() => () => {
    definirBlocageCaptures(false).catch((erreur) => {
      console.error("Impossible de rétablir les captures en quittant la discussion.", erreur);
    });
  }, []);

  const [texte, setTexte] = useState("");
  const [ecrit, setEcrit] = useState(null);
  const [menuConv, setMenuConv] = useState(false);
  const [signalement, setSignalement] = useState(false);
  const [enReponseA, setEnReponseA] = useState(null);
  const [fichierChoisi, setFichierChoisi] = useState(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [enregistrementPause, setEnregistrementPause] = useState(false);
  const [dureeEnregistrement, setDureeEnregistrement] = useState(0);
  const [envoiVocal, setEnvoiVocal] = useState(false);
  const envoiVocalRef = useRef(false);
  const [analyseOnde, setAnalyseOnde] = useState(false);
  const [niveauxEnregistrement, setNiveauxEnregistrement] = useState(
    Array.from({ length: 48 }, () => 0.04),
  );
  const [reactionOuverte, setReactionOuverte] = useState(null);
  const [menuMessage, setMenuMessage] = useState(null);
  const [editionMessage, setEditionMessage] = useState(null);
  const [texteEdition, setTexteEdition] = useState("");
  const [suppressionMessage, setSuppressionMessage] = useState(null);
  const [transfertMessage, setTransfertMessage] = useState(null);
  const [conversationsCibles, setConversationsCibles] = useState([]);
  const [rechercheTransfert, setRechercheTransfert] = useState("");
  const [transfertCid, setTransfertCid] = useState("");
  const [actionMessageEnCours, setActionMessageEnCours] = useState(false);
  const [imagePleinEcran, setImagePleinEcran] = useState(null);
  const [erreurEnvoi, setErreurEnvoi] = useState("");
  const [maintenant, setMaintenant] = useState(null);
  const [messageEpingleCible, setMessageEpingleCible] = useState(null);
  const [rechercheOuverte, setRechercheOuverte] = useState(false);
  const [rechercheSaisie, setRechercheSaisie] = useState("");
  const [termeRecherche, setTermeRecherche] = useState("");
  const [typeRecherche, setTypeRecherche] = useState("tous");
  const [dateDebutRecherche, setDateDebutRecherche] = useState("");
  const [dateFinRecherche, setDateFinRecherche] = useState("");
  const [ordreRecherche, setOrdreRecherche] = useState("recent");
  const filtresRecherche = useMemo(() => ({
    q: termeRecherche.trim(),
    type: typeRecherche,
    date_debut: dateDebutRecherche,
    date_fin: dateFinRecherche,
    ordre: ordreRecherche,
  }), [termeRecherche, typeRecherche, dateDebutRecherche, dateFinRecherche, ordreRecherche]);
  const rechercheActive = Boolean(
    filtresRecherche.q || typeRecherche !== "tous" || dateDebutRecherche || dateFinRecherche,
  );
  const resultatsRecherche = useRechercheMessages(
    id,
    filtresRecherche,
    rechercheOuverte && rechercheActive,
  );

  const fil = useRef(null);
  const saisieTexte = useRef(null);
  const glissementMessage = useRef(null);
  const annulerClicGlissement = useRef(false);
  const minuterieClicGlissement = useRef(0);
  const hauteurAvant = useRef(0);
  const dernierLu = useRef(0);
  const dernierTyping = useRef(0);
  const minuterie = useRef(0);
  const selecteurFichier = useRef(null);
  const mediaRecorder = useRef(null);
  const fluxMicro = useRef(null);
  const debutEnregistrement = useRef(0);
  const pauseCommencee = useRef(0);
  const tempsEnPause = useRef(0);
  const enregistrementPauseRef = useRef(false);
  const abandonnerVocal = useRef(false);
  const envoyerApresArret = useRef(false);
  const analyseurMicro = useRef(null);
  const contexteAudio = useRef(null);
  const niveauxMicro = useRef([]);
  const barresMicro = useRef([]);
  const trameAudio = useRef(0);
  const derniereMesureAudio = useRef(0);
  const minuterieVocale = useRef(0);
  const minuterieEnregistrement = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setTermeRecherche(rechercheSaisie), 300);
    return () => window.clearTimeout(timer);
  }, [rechercheSaisie]);

  const liste = useMemo(
    () => (msgs.data?.pages.flatMap((p) => p.results) ?? []).slice().reverse(),
    [msgs.data],
  );
  const listeAvecSeparateurs = useMemo(() => {
    const jours = liste.map((message) => message.cree_le ? libelleJour(message.cree_le) : "");
    return liste.map((message, index) => ({
      ...message,
      separateur: jours[index] && jours[index] !== jours[index - 1] ? jours[index] : null,
    }));
  }, [liste]);
  const dernier = liste.at(-1);
  const [luAutreWS, setLuAutreWS] = useState(0);
  const luAutre = Math.max(luAutreWS, conv.data?.dernier_lu_autre ?? 0);

  useEffect(() => {
    if (enReponseA) saisieTexte.current?.focus();
  }, [enReponseA]);

  useEffect(() => abonner((d) => {
    if (String(d.conversation) !== id) return;
    if (d.type === "typing") {
      clearTimeout(minuterie.current);
      if (d.actif === false) {
        setEcrit(null);
      } else {
        setEcrit(d.activite === "vocal" ? "vocal" : "texte");
        minuterie.current = setTimeout(() => setEcrit(null), 5000);
      }
    } else if (d.type === "message.nouveau") {
      setEcrit(null);
    } else if (d.type === "message.lu") {
      if (d.user !== utilisateur.id && d.jusqua) {
        setLuAutreWS((prev) => Math.max(prev, Number(d.jusqua)));
      }
    }
  }), [abonner, id, utilisateur.id]);
  useEffect(() => () => clearTimeout(minuterie.current), []);
  useEffect(() => {
    const actualiser = () => setMaintenant(Date.now());
    actualiser();
    const intervalle = setInterval(actualiser, 60_000);
    return () => clearInterval(intervalle);
  }, []);
  useEffect(() => {
    if (!fichierChoisi?.preview) return undefined;
    return () => URL.revokeObjectURL(fichierChoisi.preview);
  }, [fichierChoisi]);
  useEffect(() => () => {
    cancelAnimationFrame(trameAudio.current);
    clearInterval(minuterieVocale.current);
    clearInterval(minuterieEnregistrement.current);
    abandonnerVocal.current = true;
    envoyer({ type: "typing", conversation: Number(id), activite: "vocal", actif: false });
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
    }
    fluxMicro.current?.getTracks().forEach((track) => track.stop());
    if (contexteAudio.current) void contexteAudio.current.close();
  }, [envoyer, id]);

  useEffect(() => {
    if (!enregistrement) {
      cancelAnimationFrame(trameAudio.current);
      return undefined;
    }
    const analyser = analyseurMicro.current;
    if (!analyser) return undefined;
    const echantillons = new Float32Array(analyser.fftSize);
    let vivant = true;
    const mesurer = (temps) => {
      if (!vivant) return;
      analyser.getFloatTimeDomainData(echantillons);
      let somme = 0;
      for (const echantillon of echantillons) somme += echantillon * echantillon;
      const niveau = Math.min(1, Math.sqrt(somme / echantillons.length) * 5);
      if (!enregistrementPauseRef.current && temps - derniereMesureAudio.current >= 60) {
        derniereMesureAudio.current = temps;
        niveauxMicro.current.push(niveau);
        barresMicro.current = [...barresMicro.current.slice(1), niveau];
        setNiveauxEnregistrement(barresMicro.current);
      }
      trameAudio.current = requestAnimationFrame(mesurer);
    };
    trameAudio.current = requestAnimationFrame(mesurer);
    return () => {
      vivant = false;
      cancelAnimationFrame(trameAudio.current);
    };
  }, [enregistrement]);

  useEffect(() => {
    fermePushConversation(id);
    const visible = () => {
      if (document.visibilityState === "visible") fermePushConversation(id);
    };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, [id]);

  useEffect(() => {
    if (
      !dernier || typeof dernier.id !== "number" ||
      dernier.auteur === utilisateur.id ||
      dernier.id <= dernierLu.current ||
      document.visibilityState !== "visible"
    ) return;
    dernierLu.current = dernier.id;
    if (!envoyer({ type: "read", conversation: Number(id), jusqua: dernier.id })) {
      api(`/conversations/${id}/lu/`, { method: "POST", body: { jusqua: dernier.id } }).catch(() => {});
    }
  }, [dernier, id, envoyer, utilisateur.id]);

  useEffect(() => {
    fil.current?.scrollTo({ top: fil.current.scrollHeight });
  }, [dernier?.id]);

  useEffect(() => {
    if (!messageEpingleCible) return undefined;
    const element = fil.current?.querySelector(`[data-message-id="${messageEpingleCible}"]`);
    if (!element) return undefined;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    const minuterieCible = setTimeout(() => setMessageEpingleCible(null), 1800);
    return () => clearTimeout(minuterieCible);
  }, [messageEpingleCible, liste.length]);

  useLayoutEffect(() => {
    if (hauteurAvant.current && fil.current) {
      fil.current.scrollTop += fil.current.scrollHeight - hauteurAvant.current;
      hauteurAvant.current = 0;
    }
  }, [liste.length]);

  async function precedents() {
    hauteurAvant.current = fil.current?.scrollHeight ?? 0;
    await msgs.fetchNextPage();
  }

  function frappe(e) {
    const valeur = e.target.value;
    setTexte(valeur);
    if (!valeur.trim()) {
      envoyer({ type: "typing", conversation: Number(id), activite: "texte", actif: false });
      return;
    }
    const maintenant = Date.now();
    if (maintenant - dernierTyping.current > 2000) {
      dernierTyping.current = maintenant;
      envoyer({ type: "typing", conversation: Number(id), activite: "texte", actif: true });
    }
  }

  async function choisirFichier(file, options = {}) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErreurEnvoi("Le fichier dépasse la taille maximale de 10 Mo.");
      return;
    }
    setErreurEnvoi("");
    const selection = {
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      duree: options.duree ?? 0,
      formeOnde: options.formeOnde ?? [],
    };
    setFichierChoisi(selection);
    if (!file.type.startsWith("audio/") || options.formeOnde) return;
    const ContexteAudio = window.AudioContext || window.webkitAudioContext;
    if (!ContexteAudio) return;
    const contexte = new ContexteAudio();
    setAnalyseOnde(true);
    try {
      const buffer = await contexte.decodeAudioData(await file.arrayBuffer());
      const donnees = buffer.getChannelData(0);
      const pics = Array.from({ length: 48 }, (_, index) => {
        const debut = Math.floor(index * donnees.length / 48);
        const fin = Math.max(debut + 1, Math.floor((index + 1) * donnees.length / 48));
        let pic = 0;
        for (let position = debut; position < fin; position += 1) {
          pic = Math.max(pic, Math.abs(donnees[position]));
        }
        return pic;
      });
      const maximum = Math.max(...pics, 0.001);
      const formeOnde = pics.map((pic) => Math.round(Math.max(0.04, pic / maximum) * 100) / 100);
      setFichierChoisi((actuel) => actuel?.file === file ? { ...actuel, formeOnde } : actuel);
    } catch {
      setErreurEnvoi("L’aperçu audio n’a pas pu être analysé ; le fichier peut tout de même être envoyé.");
    } finally {
      await contexte.close();
      setAnalyseOnde(false);
    }
  }

  function arreterActiviteVocale() {
    clearInterval(minuterieVocale.current);
    envoyer({ type: "typing", conversation: Number(id), activite: "vocal", actif: false });
  }

  function basculerPauseVocale() {
    const recorder = mediaRecorder.current;
    if (!recorder || recorder.state === "inactive") return;
    if (recorder.state === "recording") {
      recorder.pause();
      pauseCommencee.current = Date.now();
      enregistrementPauseRef.current = true;
      setEnregistrementPause(true);
    } else if (recorder.state === "paused") {
      tempsEnPause.current += Date.now() - pauseCommencee.current;
      pauseCommencee.current = 0;
      enregistrementPauseRef.current = false;
      recorder.resume();
      setEnregistrementPause(false);
    }
  }

  function supprimerVocal() {
    if (mediaRecorder.current?.state === "inactive") return;
    abandonnerVocal.current = true;
    envoyerApresArret.current = false;
    mediaRecorder.current?.stop();
    setEnregistrement(false);
    setEnregistrementPause(false);
    enregistrementPauseRef.current = false;
    arreterActiviteVocale();
  }

  function envoyerVocalEnCours() {
    const recorder = mediaRecorder.current;
    if (!recorder || recorder.state === "inactive" || envoiVocal) return;
    envoyerApresArret.current = true;
    setEnvoiVocal(true);
    if (recorder.state === "paused") {
      tempsEnPause.current += Date.now() - pauseCommencee.current;
      pauseCommencee.current = 0;
    }
    recorder.stop();
    setEnregistrement(false);
    setEnregistrementPause(false);
    enregistrementPauseRef.current = false;
    arreterActiviteVocale();
  }

  async function envoyerVocal(selection) {
    if (envoiVocalRef.current) return;
    envoiVocalRef.current = true;
    setEnvoiVocal(true);
    const contenu = texte.trim();
    const cid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const date = new Date().toISOString();
    const citation = enReponseA ? {
      id: enReponseA.id,
      texte: enReponseA.texte?.slice(0, 80) ?? "",
      auteur_id: enReponseA.auteur,
    } : null;
    const local = {
      id: cid,
      cid,
      auteur: utilisateur.id,
      texte: contenu,
      cree_le: date,
      type: "vocal",
      nom_fichier: selection.file.name,
      taille_fichier: selection.file.size,
      duree_vocale: selection.duree,
      forme_onde: selection.formeOnde,
      fichier_url: null,
      en_reponse_a: citation,
      reactions: [],
      statut: navigator.onLine ? "envoi" : "hors-ligne",
    };
    majMessage(qc, id, local);
    const entrees = [
      ["fichier", selection.file],
      ["texte", contenu],
      ["cid", cid],
      ["en_reponse_a_id", enReponseA?.id ?? ""],
      ["duree_vocale", selection.duree],
      ["forme_onde", JSON.stringify(selection.formeOnde)],
    ];
    const operationFile = {
      type: "message.media",
      conversationId: Number(id),
      entrees,
    };
    const mettreEnAttente = async () => {
      const element = await mettreEnFile(operationFile);
      majMessage(qc, id, { ...local, fileId: element.id, statut: "hors-ligne" });
      setTexte("");
      setFichierChoisi(null);
      setEnReponseA(null);
    };
    if (!navigator.onLine) {
      try {
        await mettreEnAttente();
      } catch (err) {
        majMessage(qc, id, { id: cid, cid, statut: "echec" });
        setErreurEnvoi(err.message || "Le message vocal n'a pas pu être enregistré hors ligne.");
      } finally {
        envoiVocalRef.current = false;
        setEnvoiVocal(false);
      }
      return;
    }
    setTexte("");
    try {
      const formData = new FormData();
      entrees.forEach(([cle, valeur]) => formData.append(cle, valeur));
      const message = await api(`/conversations/${id}/messages/media/`, { method: "POST", formData });
      majMessage(qc, id, { ...message, cid });
      setFichierChoisi(null);
      setEnReponseA(null);
      setErreurEnvoi("");
    } catch (err) {
      if (estErreurReseau(err)) {
        try {
          await mettreEnAttente();
          return;
        } catch (erreurFile) {
          setErreurEnvoi(erreurFile.message || "Le message vocal n'a pas pu être mis en attente.");
        }
      }
      majMessage(qc, id, { id: cid, cid, statut: "echec" });
      setErreurEnvoi(err.message || "Le message vocal n'a pas pu être envoyé.");
    } finally {
      envoiVocalRef.current = false;
      setEnvoiVocal(false);
    }
  }

  async function basculerEnregistrement() {
    if (enregistrement) {
      mediaRecorder.current?.stop();
      setEnregistrement(false);
      arreterActiviteVocale();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setErreurEnvoi("L'enregistrement vocal n'est pas disponible sur cet appareil.");
      return;
    }
    const ContexteAudio = window.AudioContext || window.webkitAudioContext;
    if (!ContexteAudio) {
      setErreurEnvoi("La mesure du niveau vocal n'est pas disponible sur cet appareil.");
      return;
    }
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      fluxMicro.current = flux;
      const contexte = new ContexteAudio();
      await contexte.resume();
      const analyseur = contexte.createAnalyser();
      analyseur.fftSize = 1024;
      contexte.createMediaStreamSource(flux).connect(analyseur);
      contexteAudio.current = contexte;
      analyseurMicro.current = analyseur;
      const recorder = new MediaRecorder(flux);
      const morceaux = [];
      niveauxMicro.current = [];
      barresMicro.current = Array.from({ length: 48 }, () => 0.04);
      setNiveauxEnregistrement(barresMicro.current);
      debutEnregistrement.current = Date.now();
      pauseCommencee.current = 0;
      tempsEnPause.current = 0;
      abandonnerVocal.current = false;
      envoyerApresArret.current = false;
      enregistrementPauseRef.current = false;
      mediaRecorder.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) morceaux.push(event.data);
      };
      recorder.onstop = async () => {
        clearInterval(minuterieEnregistrement.current);
        const ecoule = Date.now() - debutEnregistrement.current - tempsEnPause.current;
        const duree = Math.max(1, Math.round(ecoule / 1000));
        const blob = new Blob(morceaux, { type: recorder.mimeType || "audio/webm" });
        const extension = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `message-vocal.${extension}`, { type: blob.type });
        const selection = {
          file,
          preview: null,
          duree,
          formeOnde: compacterNiveaux(niveauxMicro.current),
        };
        flux.getTracks().forEach((track) => track.stop());
        fluxMicro.current = null;
        analyseurMicro.current = null;
        if (contexteAudio.current) void contexteAudio.current.close();
        contexteAudio.current = null;
        setEnregistrement(false);
        setEnregistrementPause(false);
        enregistrementPauseRef.current = false;
        if (abandonnerVocal.current) {
          abandonnerVocal.current = false;
          return;
        }
        const envoyerMaintenant = envoyerApresArret.current;
        envoyerApresArret.current = false;
        if (envoyerMaintenant) {
          await envoyerVocal(selection);
        } else {
          setFichierChoisi(selection);
        }
      };
      recorder.start();
      setEnregistrement(true);
      setDureeEnregistrement(0);
      minuterieEnregistrement.current = setInterval(() => {
        const ecoule = Date.now() - debutEnregistrement.current - tempsEnPause.current
          - (enregistrementPauseRef.current ? Date.now() - pauseCommencee.current : 0);
        if (ecoule >= 3_600_000) {
          envoyerVocalEnCours();
          return;
        }
        setDureeEnregistrement(Math.max(0, ecoule));
      }, 100);
      envoyer({ type: "typing", conversation: Number(id), activite: "vocal", actif: true });
      minuterieVocale.current = setInterval(() => {
        envoyer({ type: "typing", conversation: Number(id), activite: "vocal", actif: true });
      }, 2000);
      setErreurEnvoi("");
    } catch {
      fluxMicro.current?.getTracks().forEach((track) => track.stop());
      fluxMicro.current = null;
      analyseurMicro.current = null;
      if (contexteAudio.current) void contexteAudio.current.close();
      contexteAudio.current = null;
      arreterActiviteVocale();
      setEnregistrement(false);
      setErreurEnvoi("Impossible d'accéder au microphone. Vérifiez son autorisation.");
    }
  }

  async function envoyerMessage(e) {
    e?.preventDefault();
    if (envoiVocalRef.current) return;
    const contenu = texte.trim();
    if (!contenu && !fichierChoisi) return;
    if (analyseOnde) {
      setErreurEnvoi("Patientez pendant l’analyse de l’audio.");
      return;
    }
    if (enregistrement) {
      mediaRecorder.current?.stop();
      setEnregistrement(false);
      arreterActiviteVocale();
      setErreurEnvoi("Terminez l’enregistrement avant d’envoyer le message.");
      return;
    }
    setErreurEnvoi("");
    envoyer({ type: "typing", conversation: Number(id), activite: "texte", actif: false });
    const cid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const date = new Date().toISOString();
    const citation = enReponseA ? {
      id: enReponseA.id,
      texte: enReponseA.texte?.slice(0, 80) ?? "",
      auteur_id: enReponseA.auteur,
    } : null;
    const local = {
      id: cid, cid, auteur: utilisateur.id, texte: contenu, cree_le: date,
      type: fichierChoisi ? (fichierChoisi.file.type.startsWith("image/") ? "image" : fichierChoisi.file.type.startsWith("audio/") ? "vocal" : "fichier") : "texte",
      nom_fichier: fichierChoisi?.file.name ?? "",
      taille_fichier: fichierChoisi?.file.size ?? null,
      duree_vocale: fichierChoisi?.duree ?? 0,
      forme_onde: fichierChoisi?.formeOnde ?? [],
      fichier_url: fichierChoisi?.preview ?? null,
      en_reponse_a: citation,
      reactions: [],
      statut: navigator.onLine ? "envoi" : "hors-ligne",
    };
    majMessage(qc, id, local);
    setTexte("");
    if (!fichierChoisi) setEnReponseA(null);
    const operationFile = fichierChoisi
      ? {
          type: "message.media",
          conversationId: Number(id),
          entrees: [
            ["fichier", fichierChoisi.file],
            ["texte", contenu],
            ["cid", cid],
            ["en_reponse_a_id", enReponseA?.id ?? ""],
            ["duree_vocale", fichierChoisi.duree ?? ""],
            ["forme_onde", JSON.stringify(fichierChoisi.formeOnde ?? [])],
          ],
        }
      : {
          type: "message.texte",
          conversationId: Number(id),
          message: { texte: contenu, cid, en_reponse_a_id: enReponseA?.id },
        };
    const mettreEnAttente = async () => {
      const element = await mettreEnFile(operationFile);
      majMessage(qc, id, { ...local, fileId: element.id, statut: "hors-ligne" });
      setFichierChoisi(null);
      setEnReponseA(null);
    };
    if (!navigator.onLine) {
      try {
        await mettreEnAttente();
      } catch (err) {
        majMessage(qc, id, { id: cid, cid, statut: "echec" });
        setErreurEnvoi(err.message || "Le message n'a pas pu être enregistré hors ligne.");
      }
      return;
    }

    try {
      if (fichierChoisi) {
        const formData = new FormData();
        formData.append("fichier", fichierChoisi.file);
        formData.append("texte", contenu);
        formData.append("en_reponse_a_id", enReponseA?.id ?? "");
        formData.append("duree_vocale", fichierChoisi.duree ?? "");
        formData.append("forme_onde", JSON.stringify(fichierChoisi.formeOnde ?? []));
        formData.append("cid", cid);
        const m = await api(`/conversations/${id}/messages/media/`, { method: "POST", formData });
        majMessage(qc, id, { ...m, cid });
        setFichierChoisi(null);
        setEnReponseA(null);
        return;
      }
      setFichierChoisi(null);
      const m = await api(`/conversations/${id}/messages/`, {
        method: "POST",
        body: { texte: contenu, cid, en_reponse_a_id: enReponseA?.id },
      });
      majMessage(qc, id, { ...m, cid });
    } catch (err) {
      if (estErreurReseau(err)) {
        try {
          await mettreEnAttente();
          return;
        } catch (erreurFile) {
          setErreurEnvoi(erreurFile.message || "Le message n'a pas pu être enregistré pour un nouvel essai.");
        }
      }
      majMessage(qc, id, { id: cid, cid, statut: "echec" });
      setErreurEnvoi(err.message || "Le message n'a pas pu être envoyé.");
    }
  }

  async function reagir(message, emoji) {
    if (typeof message.id !== "number") return;
    const actuelle = message.reactions?.find((reaction) => reaction.emoji === emoji);
    const method = actuelle?.moi ? "DELETE" : "POST";
    try {
      await api(`/conversations/${id}/messages/${message.id}/reactions/`, {
        method,
        body: { emoji },
      });
      await qc.invalidateQueries({ queryKey: ["messages", String(id)] });
      setReactionOuverte(null);
    } catch (err) {
      setErreurEnvoi(err.message || "La réaction n'a pas pu être enregistrée.");
    }
  }

  async function actionMessage(message, action, method = "POST", body) {
    if (typeof message.id !== "number" || actionMessageEnCours) return;
    setActionMessageEnCours(true);
    setErreurEnvoi("");
    try {
      await api(
        `/conversations/${id}/messages/${message.id}/${action}/`,
        { method, ...(body ? { body } : {}) },
      );
      if (action === "favori" || action === "epingler") {
        const actif = method === "POST";
        qc.setQueryData(["messages", String(id)], (ancienne) => {
          if (!ancienne) return ancienne;
          return {
            ...ancienne,
            pages: ancienne.pages.map((page) => ({
              ...page,
              results: page.results.map((item) => ({
                ...item,
                ...(action === "favori" && item.id === message.id ? { favori: actif } : {}),
                ...(action === "epingler" && actif && item.id !== message.id ? { epingle: false } : {}),
                ...(action === "epingler" && item.id === message.id ? { epingle: actif } : {}),
              })),
            })),
          };
        });
        afficherToast(
          action === "favori"
            ? (actif ? "Message ajouté aux favoris." : "Message retiré des favoris.")
            : (actif ? "Message épinglé dans la conversation." : "Message désépinglé."),
          "succes",
        );
      }
      setMenuMessage(null);
      void qc.invalidateQueries({ queryKey: ["messages", String(id)] });
      if (action === "epingler") {
        void qc.invalidateQueries({ queryKey: ["conversation", String(id)] });
      }
      return true;
    } catch (err) {
      const messageErreur = err.message || "L’action sur le message a échoué.";
      setErreurEnvoi(messageErreur);
      afficherToast(messageErreur, "erreur");
      return null;
    } finally {
      setActionMessageEnCours(false);
    }
  }

  async function allerAuMessageEpingle() {
    const epingle = conv.data?.message_epingle;
    if (!epingle) return;
    await allerAuMessage(epingle.id);
  }

  async function allerAuMessage(messageId) {
    try {
      let donnees = qc.getQueryData(["messages", String(id)]);
      if (!donnees) {
        donnees = (await msgs.refetch()).data;
      }
      while (!donnees?.pages?.some((page) => page.results.some((message) => message.id === messageId))) {
        const pageSuivante = await msgs.fetchNextPage();
        donnees = pageSuivante.data;
        if (pageSuivante.isError) {
          throw pageSuivante.error;
        }
        if (!pageSuivante.hasNextPage) {
          afficherToast("Ce message n’est plus disponible dans l’historique.", "avertissement");
          return;
        }
      }
      setRechercheOuverte(false);
      setMessageEpingleCible(messageId);
    } catch (err) {
      afficherToast(err.message || "Le message n’a pas pu être chargé.", "erreur");
    }
  }

  async function copierMessage(message) {
    if (!message.texte) return;
    try {
      await navigator.clipboard.writeText(message.texte);
      setMenuMessage(null);
      setErreurEnvoi("");
    } catch (err) {
      setErreurEnvoi(err.message || "Impossible de copier ce message.");
    }
  }

  function commencerEdition(message) {
    setEditionMessage(message);
    setTexteEdition(message.texte || "");
    setMenuMessage(null);
  }

  async function enregistrerEdition(event) {
    event.preventDefault();
    const texteModifie = texteEdition.trim();
    if (!texteModifie || !editionMessage) return;
    const resultat = await actionMessage(
      editionMessage,
      "modifier",
      "PATCH",
      { texte: texteModifie },
    );
    if (resultat) setEditionMessage(null);
  }

  async function supprimerMessage(portee) {
    if (!suppressionMessage) return;
    const resultat = await actionMessage(
      suppressionMessage,
      "suppression",
      "POST",
      { portee },
    );
    if (resultat) setSuppressionMessage(null);
  }

  async function transfererMessage(event) {
    event.preventDefault();
    if (!transfertMessage || conversationsCibles.length === 0 || conversationsCibles.length > 5) return;
    const resultat = await actionMessage(
      transfertMessage,
      "transferer",
      "POST",
      {
        conversation_ids: conversationsCibles,
        cid: transfertCid,
      },
    );
    if (resultat) {
      await qc.invalidateQueries({ queryKey: ["conversations"] });
      afficherToast(
        conversationsCibles.length === 1
          ? "Message transféré."
          : `Message transféré à ${conversationsCibles.length} conversations.`,
        "succes",
      );
      setTransfertMessage(null);
      setConversationsCibles([]);
      setRechercheTransfert("");
      setTransfertCid("");
    }
  }

  function ouvrirTransfert(message) {
    setConversationsCibles([]);
    setRechercheTransfert("");
    setTransfertCid(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setTransfertMessage(message);
  }

  function basculerConversationTransfert(conversationId) {
    setConversationsCibles((selection) => {
      if (selection.includes(conversationId)) {
        return selection.filter((idConversation) => idConversation !== conversationId);
      }
      if (selection.length >= 5) {
        afficherToast("Vous pouvez choisir au maximum 5 conversations.", "avertissement");
        return selection;
      }
      return [...selection, conversationId];
    });
  }

  if (conv.isError) {
    return (
      <div className="chat">
        <p role="alert" className="erreur">Cette conversation n'est pas disponible.</p>
        <Bouton secondaire onClick={() => navigate("/messages")}>Retour</Bouton>
      </div>
    );
  }

  const autre = conv.data?.autre;
  return (
    <div className="chat">
      <header className="chat-tete">
        <button className="puce" onClick={() => navigate("/messages")} aria-label="Retour aux messages">
          <ArrowLeft size={18} />
        </button>
        {autre ? (
          <Link
            to={`/profil/${autre.id}`}
            className="chat-contact"
          >
            <span className="chat-avatar-enligne">
              <Avatar prenom={autre.prenom} nom={autre.nom} photo={autre.photo} taille={40} />
              <i />
            </span>
            <span className="chat-contact-infos">
              <strong>{autre.prenom} {autre.nom}</strong>
              <small>Conversation</small>
            </span>
          </Link>
        ) : <Sq w="10rem" h="1.2rem" />}
        {autre && (
          <div className="chat-actions">
            <button
              type="button"
              className="puce"
              aria-label={rechercheOuverte ? "Fermer la recherche" : "Rechercher dans la conversation"}
              aria-expanded={rechercheOuverte}
              onClick={() => setRechercheOuverte((ouverte) => !ouverte)}
            >
              {rechercheOuverte ? <X size={18} /> : <Search size={18} />}
            </button>
            <div className="chat-menu">
            <button
              className="puce"
              aria-label="Options de la conversation"
              aria-expanded={menuConv}
              onClick={() => setMenuConv((v) => !v)}
            >
              <MoreHorizontal size={18} />
            </button>
            {menuConv && (
              <div className="menu-contextuel">
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => { setMenuConv(false); setSignalement(true); }}
                >
                  <Flag size={14} style={{ marginRight: "0.4rem" }} />
                  Signaler cette conversation
                </button>
              </div>
            )}
            </div>
          </div>
        )}
      </header>

      {rechercheOuverte && (
        <section className="chat-recherche" aria-label="Recherche dans la conversation">
          <label className="chat-recherche-terme">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              maxLength={100}
              value={rechercheSaisie}
              onChange={(event) => setRechercheSaisie(event.target.value)}
              placeholder="Rechercher un message"
              aria-label="Rechercher un message"
            />
          </label>
          <div className="chat-recherche-filtres">
            <label>
              Type
              <select value={typeRecherche} onChange={(event) => setTypeRecherche(event.target.value)}>
                <option value="tous">Tous</option>
                <option value="liens">Liens</option>
                <option value="images">Images</option>
                <option value="fichiers">Fichiers</option>
                <option value="vocaux">Messages vocaux</option>
              </select>
            </label>
            <label>
              Du
              <input
                type="date"
                value={dateDebutRecherche}
                onChange={(event) => setDateDebutRecherche(event.target.value)}
                aria-label="Date de début"
              />
            </label>
            <label>
              Au
              <input
                type="date"
                value={dateFinRecherche}
                onChange={(event) => setDateFinRecherche(event.target.value)}
                aria-label="Date de fin"
              />
            </label>
            <label>
              Ordre
              <select value={ordreRecherche} onChange={(event) => setOrdreRecherche(event.target.value)}>
                <option value="recent">Plus récents</option>
                <option value="ancien">Plus anciens</option>
              </select>
            </label>
          </div>
          {rechercheActive ? (
            <div className="chat-recherche-resultats" aria-live="polite">
              {resultatsRecherche.isPending && <p role="status">Recherche en cours…</p>}
              {resultatsRecherche.isError && (
                <div role="alert" className="chat-recherche-erreur">
                  <span>{resultatsRecherche.error.message || "La recherche a échoué."}</span>
                  <button type="button" onClick={() => resultatsRecherche.refetch()}>Réessayer</button>
                </div>
              )}
              {resultatsRecherche.data?.pages.flatMap((page) => page.results).map((message) => (
                <button
                  type="button"
                  className="chat-recherche-resultat"
                  key={message.id}
                  onClick={() => allerAuMessage(message.id)}
                >
                  <span className="chat-recherche-resultat-meta">
                    <strong>{message.auteur === utilisateur.id ? "Vous" : autre?.prenom}</strong>
                    <time>{message.cree_le ? `${libelleJour(message.cree_le)} · ${heure(message.cree_le)}` : ""}</time>
                  </span>
                  <span className="chat-recherche-resultat-texte">
                    {message.texte
                      || (message.type === "image" ? "Photo" : null)
                      || (message.type === "vocal" ? "Message vocal" : null)
                      || (message.type === "fichier" ? message.nom_fichier || "Pièce jointe" : "Message")}
                  </span>
                </button>
              ))}
              {!resultatsRecherche.isPending
                && !resultatsRecherche.isError
                && resultatsRecherche.data?.pages[0]?.count === 0 && (
                <p>Aucun message ne correspond à cette recherche.</p>
              )}
              {resultatsRecherche.hasNextPage && (
                <button
                  type="button"
                  className="chat-recherche-plus"
                  disabled={resultatsRecherche.isFetchingNextPage}
                  onClick={() => resultatsRecherche.fetchNextPage()}
                >
                  {resultatsRecherche.isFetchingNextPage ? "Chargement…" : "Voir plus de résultats"}
                </button>
              )}
            </div>
          ) : (
            <p className="chat-recherche-aide">Saisissez un texte ou choisissez un filtre pour commencer.</p>
          )}
        </section>
      )}

      {conv.data?.message_epingle && (
        <button
          type="button"
          className="chat-epingle-banniere"
          onClick={allerAuMessageEpingle}
          aria-label="Afficher le message épinglé"
        >
          <Pin size={17} />
          <span>
            <strong>Message épinglé</strong>
            <small>
              {conv.data.message_epingle.texte
                || (conv.data.message_epingle.type === "image" ? "Photo" : null)
                || (conv.data.message_epingle.type === "vocal" ? "Message vocal" : null)
                || (conv.data.message_epingle.type === "fichier" ? "Pièce jointe" : "Message")}
            </small>
          </span>
          <ChevronUp className="chat-epingle-fleche" size={16} />
        </button>
      )}

      <div className="chat-fil" ref={fil} role="log" aria-live="polite" aria-label="Messages">
        {msgs.hasNextPage && (
          <div className="chat-precedents">
            <Bouton secondaire chargement={msgs.isFetchingNextPage} onClick={precedents}>
              Messages précédents
            </Bouton>
          </div>
        )}
        {msgs.isPending && [60, 40, 70, 30].map((w, i) => (
          <Sq key={i} w={`${w}%`} h="2.4rem" r="1.1rem"
            style={{ alignSelf: i % 2 ? "flex-end" : "flex-start" }} />
        ))}
        {msgs.isError && (
          <div className="chat-erreur-chargement" role="alert">
            <p>Les messages n’ont pas pu être chargés. Vérifiez votre connexion et réessayez.</p>
            <Bouton secondaire chargement={msgs.isFetching} onClick={() => msgs.refetch()}>
              Réessayer
            </Bouton>
          </div>
        )}
        {!msgs.isPending && !msgs.isError && liste.length === 0 && (
          <div className="chat-vide">
            <span>👋</span>
            <strong>Votre conversation commence ici</strong>
            <p>Envoyez un message pour démarrer la discussion.</p>
          </div>
        )}
        {listeAvecSeparateurs.map((m) => {
          const moi = m.auteur === utilisateur.id;
          const vu = moi && typeof m.id === "number" && luAutre >= m.id;
          const elementEnAttente = fileHorsLigne.find((element) => element.id === m.fileId);
          const fileExpire = Boolean(
            elementEnAttente && maintenant && Date.parse(elementEnAttente.expireLe) <= maintenant,
          );
          return (
            <div
              className={`message-groupe${messageEpingleCible === m.id ? " message-epingle-cible" : ""}`}
              key={m.cid ?? m.id}
              data-message-id={typeof m.id === "number" ? m.id : undefined}
            >
              {m.separateur && <div className="separateur-date"><span>{m.separateur}</span></div>}
              <div className={`message-ligne${moi ? " sortant" : ""}`}>
                {!moi && (
                  <span className="message-avatar">
                    <Avatar prenom={autre?.prenom} nom={autre?.nom} photo={autre?.photo} taille={32} />
                    <i />
                  </span>
                )}
                <div className="message-corps">
                  <div className="message-entete">
                    <strong>{moi ? "Vous" : `${autre?.prenom ?? ""} ${autre?.nom ?? ""}`}</strong>
                    <time>{m.cree_le && heure(m.cree_le)}</time>
                    {m.modifie_le && <small className="message-modifie">modifié</small>}
                    {moi && (
                      m.statut === "echec" || fileExpire
                        ? <span className="message-echec" aria-label={fileExpire ? "Délai de renvoi expiré" : "Échec de l'envoi"}>!</span>
                        : m.statut === "hors-ligne"
                          ? <span className="message-envoi" aria-label="En attente de connexion">◷</span>
                        : m.statut === "envoi"
                          ? <span className="message-envoi" aria-label="Envoi en cours">…</span>
                          : vu
                            ? <CheckCheck size={14} className="message-vu" aria-label="Vu" />
                            : <Check size={14} className="message-coche" aria-label="Envoyé" />
                    )}
                  </div>
                  <div
                    className={`message-contenu${moi ? " sortant" : ""}${typeof m.id === "number" && !m.supprime_pour_tous ? " message-cliquable" : ""}`}
                    onClickCapture={(event) => {
                      if (!annulerClicGlissement.current) return;
                      event.preventDefault();
                      event.stopPropagation();
                      annulerClicGlissement.current = false;
                      clearTimeout(minuterieClicGlissement.current);
                    }}
                    onClick={(event) => {
                      if (typeof m.id !== "number" || m.supprime_pour_tous) return;
                      if (event.target instanceof Element && event.target.closest("a, button, audio, input, textarea, select")) return;
                      setMenuMessage((actuel) => actuel === m.id ? null : m.id);
                    }}
                    onContextMenu={(event) => {
                      if (typeof m.id !== "number" || m.supprime_pour_tous) return;
                      event.preventDefault();
                      setMenuMessage(m.id);
                    }}
                    onTouchStart={(event) => {
                      if (event.target instanceof Element && event.target.closest("a, audio, .message-actions, .message-menu, .reaction-choix")) {
                        glissementMessage.current = null;
                        return;
                      }
                      const toucher = event.changedTouches[0];
                      glissementMessage.current = { id: m.id, x: toucher.clientX, y: toucher.clientY };
                    }}
                    onTouchEnd={(event) => {
                      const debut = glissementMessage.current;
                      glissementMessage.current = null;
                      if (!debut || debut.id !== m.id || typeof m.id !== "number") return;
                      const toucher = event.changedTouches[0];
                      const dx = toucher.clientX - debut.x;
                      const dy = toucher.clientY - debut.y;
                      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.25) {
                        annulerClicGlissement.current = true;
                        clearTimeout(minuterieClicGlissement.current);
                        minuterieClicGlissement.current = setTimeout(() => {
                          annulerClicGlissement.current = false;
                        }, 500);
                        setMenuMessage(null);
                        setEnReponseA(m);
                      }
                    }}
                  >
                    {m.transfere && (
                      <div className="message-transfere"><Forward size={13} /> Transféré</div>
                    )}
                    {m.supprime_pour_tous ? (
                      <p className="message-supprime">Ce message a été supprimé.</p>
                    ) : editionMessage?.id === m.id ? (
                      <form className="message-edition" onSubmit={enregistrerEdition}>
                        <textarea
                          aria-label="Modifier le message"
                          maxLength={2000}
                          value={texteEdition}
                          onChange={(event) => setTexteEdition(event.target.value)}
                          autoFocus
                        />
                        <div>
                          <button type="button" onClick={() => setEditionMessage(null)}>Annuler</button>
                          <button type="submit" disabled={actionMessageEnCours || !texteEdition.trim()}>
                            Enregistrer
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                    {m.en_reponse_a && (
                      <div className="message-citation">
                        <strong>{m.en_reponse_a.auteur_id === utilisateur.id ? "Vous" : autre?.prenom}</strong>
                        <span>{m.en_reponse_a.texte || "Pièce jointe"}</span>
                      </div>
                    )}
                    {(m.type === "image" && m.fichier_url) ? (
                      <div className="image-message">
                        <button type="button" onClick={() => setImagePleinEcran(m.fichier_url)} aria-label="Afficher l'image en plein écran">
                          <img src={m.fichier_url} alt="Image partagée" loading="lazy" />
                        </button>
                        <small>{tailleLisible(m.taille_fichier)}</small>
                      </div>
                    ) : m.type === "vocal" && m.fichier_url ? (
                      <BulleVocale message={m} moi={moi} />
                    ) : m.type === "fichier" && m.fichier_url ? (
                      <CarteFichier message={m} />
                    ) : (
                      <TexteMessage texte={m.texte || ""} />
                    )}
                    {m.type !== "texte" && m.texte && <p className="message-legende">{m.texte}</p>}
                      </>
                    )}
                  </div>
                  <div className="message-bas">
                    {elementEnAttente && (
                      <div className="message-file-attente">
                        <small>
                          {fileExpire
                            ? "Délai de 48 h expiré."
                            : elementEnAttente.derniereErreur
                              ? "L’envoi a échoué."
                              : "Message conservé jusqu’à 48 h."}
                        </small>
                        <button
                          type="button"
                          onClick={() => retenterElement(elementEnAttente.id).catch((erreur) => {
                            afficherToast(erreur.message || "Le message n’a pas pu être relancé.", "erreur");
                          })}
                        >
                          Réessayer
                        </button>
                      </div>
                    )}
                    {m.epingle && (
                      <span className="message-indicateur epingle" title="Message épinglé dans cette conversation">
                        <Pin size={13} /> Épinglé
                      </span>
                    )}
                    {m.favori && (
                      <span className="message-indicateur favori" title="Message enregistré dans vos favoris">
                        <Star size={13} /> Favori
                      </span>
                    )}
                    {(m.reactions ?? []).map((reaction) => (
                      <button
                        key={reaction.emoji}
                        type="button"
                        className={`reaction-puce${reaction.moi ? " selectionnee" : ""}`}
                        aria-label={`${reaction.emoji}, ${reaction.nb} réaction${reaction.nb > 1 ? "s" : ""}`}
                        onClick={() => reagir(m, reaction.emoji)}
                      >
                        <span>{reaction.emoji}</span>{reaction.nb > 1 && <small>{reaction.nb}</small>}
                      </button>
                    ))}
                    <div className="message-actions">
                      <button
                        type="button"
                        aria-label="Ajouter une réaction"
                        aria-expanded={reactionOuverte === m.id}
                        onClick={() => setReactionOuverte(reactionOuverte === m.id ? null : m.id)}
                      >
                        <Smile size={15} />
                      </button>
                      {typeof m.id === "number" && !m.supprime_pour_tous && (
                        <div className="message-menu">
                          {menuMessage === m.id && (
                            <div className="menu-contextuel" role="menu" aria-label="Actions du message">
                              <button
                                type="button"
                                className="menu-item"
                                role="menuitem"
                                onClick={() => { setMenuMessage(null); setEnReponseA(m); }}
                              >
                                <Reply size={14} /> Répondre
                              </button>
                              {m.texte && (
                                <button type="button" className="menu-item" role="menuitem" onClick={() => copierMessage(m)}>
                                  <Copy size={14} /> Copier
                                </button>
                              )}
                              <button
                                type="button"
                                className="menu-item"
                                role="menuitem"
                                onClick={() => actionMessage(m, "favori", m.favori ? "DELETE" : "POST")}
                              >
                                <Star size={14} /> {m.favori ? "Retirer des favoris" : "Ajouter aux favoris"}
                              </button>
                              <button
                                type="button"
                                className="menu-item"
                                role="menuitem"
                                onClick={() => actionMessage(m, "epingler", m.epingle ? "DELETE" : "POST")}
                              >
                                <Pin size={14} /> {m.epingle ? "Désépingler" : "Épingler"}
                              </button>
                              <button
                                type="button"
                                className="menu-item"
                                role="menuitem"
                                onClick={() => {
                                  setMenuMessage(null);
                                  ouvrirTransfert(m);
                                }}
                              >
                                <Forward size={14} /> Transférer
                              </button>
                              {moi && maintenant !== null && maintenant - new Date(m.cree_le).getTime() <= 15 * 60 * 1000 && !m.supprime_pour_tous && (
                                <button type="button" className="menu-item" role="menuitem" onClick={() => commencerEdition(m)}>
                                  <Pencil size={14} /> Modifier
                                </button>
                              )}
                              <button
                                type="button"
                                className="menu-item danger"
                                role="menuitem"
                                onClick={() => {
                                  setMenuMessage(null);
                                  setSuppressionMessage(m);
                                }}
                              >
                                <Trash2 size={14} /> Supprimer
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {reactionOuverte === m.id && (
                      <div className="reaction-choix" role="group" aria-label="Choisir une réaction">
                        {REACTIONS.map((emoji) => (
                          <button key={emoji} type="button" aria-label={`Réagir avec ${emoji}`} onClick={() => reagir(m, emoji)}>
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {ecrit && autre && (
          <div
            className={`bulle-msg ecrit${ecrit === "vocal" ? " vocal" : ""}`}
            role="status"
            aria-label={ecrit === "vocal" ? `${autre.prenom} enregistre un message vocal` : `${autre.prenom} écrit`}
          >
            {ecrit === "vocal"
              ? <small>{autre.prenom} enregistre un vocal…</small>
              : <><span /><span /><span /></>}
          </div>
        )}
      </div>

      {conv.data && !conv.data.peut_ecrire ? (
        <p className="doux" style={{ textAlign: "center", padding: "0.75rem" }}>
          Vous ne pouvez plus écrire à cette personne.
        </p>
      ) : (
        <form className="saisie" onSubmit={envoyerMessage}>
          {(enReponseA || fichierChoisi) && (
            <div className="saisie-apercu">
              {enReponseA && (
                <div className="saisie-citation">
                  <Reply size={16} />
                  <span><strong>Réponse à {enReponseA.auteur === utilisateur.id ? "vous" : autre?.prenom}</strong><small>{enReponseA.texte || (enReponseA.type === "image" ? "Photo" : enReponseA.type === "vocal" ? "Message vocal" : "Pièce jointe")}</small></span>
                  <button type="button" aria-label="Annuler la réponse" onClick={() => setEnReponseA(null)}><X size={16} /></button>
                </div>
              )}
              {fichierChoisi && (
                <div className="saisie-fichier">
                  {fichierChoisi.preview
                    ? <img src={fichierChoisi.preview} alt="Aperçu du fichier à envoyer" />
                    : <FileIcon size={20} />}
                  <span>{fichierChoisi.preview ? "Image" : fichierChoisi.file.name}<small>{tailleLisible(fichierChoisi.file.size)}</small></span>
                  <button type="button" aria-label="Retirer la pièce jointe" onClick={() => setFichierChoisi(null)}><X size={16} /></button>
                </div>
              )}
            </div>
          )}
          <input
            ref={selecteurFichier}
            type="file"
            accept="image/*,audio/*,.pdf,.doc,.docx,.txt,.zip"
            hidden
            onChange={(event) => {
              choisirFichier(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {enregistrement ? (
            <div className="enregistrement-vocal" role="group" aria-label="Enregistrement vocal en cours">
              <div className="enregistrement-vocal-haut">
                <time className="enregistrement-vocal-duree">{dureeChrono(dureeEnregistrement)}</time>
                <span
                  className={`enregistrement-vocal-ondes${enregistrementPause ? " en-pause" : ""}`}
                  aria-label="Niveau sonore du microphone"
                  role="img"
                >
                  {niveauxEnregistrement.map((niveau, index) => (
                    <i key={index} style={{ height: `${Math.max(2, niveau * 30)}px` }} />
                  ))}
                </span>
                <span className="enregistrement-vocal-limite" aria-label="Durée maximale 60 minutes" title="Maximum : 60 minutes">
                  <Timer aria-hidden="true" />
                </span>
              </div>
              <div className="enregistrement-vocal-actions">
                <button
                  type="button"
                  className="enregistrement-vocal-action enregistrement-vocal-supprimer"
                  onClick={supprimerVocal}
                  aria-label="Supprimer l'enregistrement"
                  disabled={envoiVocal}
                >
                  <Trash2 size={19} />
                </button>
                <button
                  type="button"
                  className="enregistrement-vocal-action enregistrement-vocal-pause"
                  onClick={basculerPauseVocale}
                  aria-label={enregistrementPause ? "Reprendre l'enregistrement" : "Mettre l'enregistrement en pause"}
                  disabled={envoiVocal}
                >
                  {enregistrementPause ? <Play size={17} fill="currentColor" /> : <Pause size={17} />}
                  {enregistrementPause ? "Reprendre" : "Pause"}
                </button>
                <button
                  type="button"
                  className="enregistrement-vocal-action enregistrement-vocal-envoyer"
                  onClick={envoyerVocalEnCours}
                  aria-label="Envoyer le message vocal"
                  disabled={envoiVocal}
                >
                  <Send size={20} fill="currentColor" />
                </button>
              </div>
            </div>
          ) : (
            <div className="saisie-ligne">
              <button
                className="saisie-icone"
                type="button"
                aria-label="Joindre une image, un audio ou un fichier"
                onClick={() => selecteurFichier.current?.click()}
              >
                <Paperclip size={19} />
              </button>
              <textarea
                ref={saisieTexte}
                className="champ"
                rows={1}
                maxLength={2000}
                placeholder="Écrire un message…"
                aria-label="Votre message"
                value={texte}
                onChange={frappe}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) envoyerMessage(event);
                }}
              />
              <button
                className="saisie-icone"
                type="button"
                aria-label="Enregistrer un message vocal"
                onClick={basculerEnregistrement}
              >
                <Mic size={19} />
              </button>
              <button
                type="submit"
                className="saisie-envoi"
                aria-label="Envoyer"
                disabled={envoiVocal || analyseOnde || (!texte.trim() && !fichierChoisi)}
              >
                <Send size={18} />
              </button>
            </div>
          )}
          {envoiVocal && <span className="enregistrement-vocal-envoi" role="status">Envoi du message vocal…</span>}
          {erreurEnvoi && <p role="alert" className="erreur saisie-erreur">{erreurEnvoi}</p>}
        </form>
      )}
        {suppressionMessage && (
          <div className="message-dialog-fond" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSuppressionMessage(null);
          }}>
            <section className="message-dialog" role="dialog" aria-modal="true" aria-labelledby="suppression-titre">
              <h2 id="suppression-titre">Supprimer le message ?</h2>
              <p>Choisissez où ce message doit être supprimé.</p>
              <button type="button" className="menu-item" disabled={actionMessageEnCours} onClick={() => supprimerMessage("moi")}>
                Supprimer pour moi
              </button>
              {suppressionMessage.auteur === utilisateur.id && (
                <button type="button" className="menu-item danger" disabled={actionMessageEnCours} onClick={() => supprimerMessage("tous")}>
                  Supprimer pour tout le monde
                </button>
              )}
              <button type="button" className="menu-item" onClick={() => setSuppressionMessage(null)}>Annuler</button>
            </section>
          </div>
        )}
        {transfertMessage && (
          <div className="message-dialog-fond" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTransfertMessage(null);
          }}>
            <form className="message-dialog transfert-dialog" role="dialog" aria-modal="true" aria-labelledby="transfert-titre" onSubmit={transfererMessage}>
              <h2 id="transfert-titre">Transférer le message</h2>
              <p className="doux transfert-compteur">
                Choisissez jusqu’à 5 conversations ({conversationsCibles.length}/5).
              </p>
              <label htmlFor="recherche-transfert">Rechercher une conversation</label>
              <input
                id="recherche-transfert"
                className="champ"
                type="search"
                value={rechercheTransfert}
                onChange={(event) => setRechercheTransfert(event.target.value)}
                placeholder="Nom du membre"
              />
              <div className="transfert-liste" role="group" aria-label="Conversations disponibles">
                {(conversations.data?.pages.flatMap((page) => page.results) ?? [])
                  .filter((item) => String(item.id) !== String(id))
                  .filter((item) => `${item.autre.prenom} ${item.autre.nom}`.toLocaleLowerCase()
                    .includes(rechercheTransfert.trim().toLocaleLowerCase()))
                  .map((item) => (
                    <label className="transfert-destination" key={item.id}>
                      <input
                        type="checkbox"
                        checked={conversationsCibles.includes(item.id)}
                        onChange={() => basculerConversationTransfert(item.id)}
                        disabled={!conversationsCibles.includes(item.id) && conversationsCibles.length >= 5}
                      />
                      <Avatar prenom={item.autre.prenom} nom={item.autre.nom} photo={item.autre.photo} taille={40} />
                      <span>{item.autre.prenom} {item.autre.nom}</span>
                    </label>
                  ))}
              </div>
              {conversations.hasNextPage && (
                  <button
                    type="button"
                    className="menu-item"
                    disabled={conversations.isFetchingNextPage}
                    onClick={() => conversations.fetchNextPage()}
                  >
                    {conversations.isFetchingNextPage ? "Chargement…" : "Charger plus de conversations"}
                  </button>
              )}
              <div className="message-dialog-actions">
                <button type="button" className="menu-item" onClick={() => setTransfertMessage(null)}>Annuler</button>
                <button type="submit" className="menu-item" disabled={actionMessageEnCours || !conversationsCibles.length}>
                  {actionMessageEnCours ? "Transfert…" : `Transférer${conversationsCibles.length ? ` (${conversationsCibles.length})` : ""}`}
                </button>
              </div>
            </form>
          </div>
        )}
        {imagePleinEcran && (
        <div className="visionneuse" role="dialog" aria-modal="true" aria-label="Aperçu de l'image" onClick={() => setImagePleinEcran(null)}>
          <button type="button" className="puce" aria-label="Fermer l'image" onClick={() => setImagePleinEcran(null)}><X size={22} /></button>
          <img src={imagePleinEcran} alt="Image partagée en plein écran" onClick={(event) => event.stopPropagation()} />
        </div>
      )}
      {signalement && conv.data && (
        <ModaleSignalement
          type="conversation"
          id={Number(id)}
          onClose={() => setSignalement(false)}
        />
      )}
    </div>
  );
}
