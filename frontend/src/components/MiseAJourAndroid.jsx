import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { ApkUpdater } from "../api/apk-updater";
import { VERSION_APPLICATION, VERSION_CODE_APPLICATION } from "../utils/version";
import { estNatif } from "../utils/plateforme";
import { Bouton } from "./ui";

const MANIFEST_URL = import.meta.env.VITE_ANDROID_UPDATE_MANIFEST_URL || "";

function urlSecurisee(valeur) {
  const url = new URL(valeur);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Le serveur de mise à jour doit utiliser une adresse HTTPS publique.");
  }
  return url;
}

export default function MiseAJourAndroid() {
  const [autorise, setAutorise] = useState(false);
  const [manifeste, setManifeste] = useState(null);
  const [etat, setEtat] = useState("");
  const [erreur, setErreur] = useState("");
  const [progression, setProgression] = useState(null);
  const [apkTelecharge, setApkTelecharge] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [verificationEnCours, setVerificationEnCours] = useState(false);

  useEffect(() => {
    if (!estNatif()) return undefined;
    const verifier = () => {
      ApkUpdater.canInstallPackages()
        .then((resultat) => setAutorise(resultat.authorized))
        .catch((error) => setErreur(error.message || "Impossible de vérifier l’autorisation Android."));
    };
    verifier();
    window.addEventListener("focus", verifier);
    return () => window.removeEventListener("focus", verifier);
  }, []);

  if (!estNatif()) return null;

  async function verifierMiseAJour() {
    setErreur("");
    setManifeste(null);
    setApkTelecharge(false);
    setProgression(null);
    setVerificationEnCours(true);
    setEtat("Recherche de mises à jour…");
    if (!MANIFEST_URL) {
      setEtat("");
      setErreur("Configurez VITE_ANDROID_UPDATE_MANIFEST_URL dans frontend/.env.native pour activer les mises à jour.");
      setVerificationEnCours(false);
      return;
    }
    try {
      const manifestUrl = urlSecurisee(MANIFEST_URL);
      const response = await fetch(manifestUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`Le serveur de mise à jour a répondu ${response.status}.`);
      const miseAJour = await response.json();
      const apkUrl = urlSecurisee(miseAJour.apkUrl);
      if (
        !Number.isSafeInteger(miseAJour.versionCode)
        || typeof miseAJour.versionName !== "string"
        || !/^[a-f0-9]{64}$/i.test(miseAJour.sha256 || "")
        || apkUrl.origin !== manifestUrl.origin
      ) {
        throw new Error("Le manifeste de mise à jour est incomplet ou invalide.");
      }
      setManifeste(miseAJour);
      setEtat(miseAJour.versionCode > VERSION_CODE_APPLICATION
        ? `La version ${miseAJour.versionName} est disponible.`
        : "Vous utilisez la dernière version disponible.");
    } catch (error) {
      setErreur(error.message || "La vérification des mises à jour a échoué.");
    } finally {
      setVerificationEnCours(false);
    }
  }

  async function autoriserInstallation() {
    setErreur("");
    try {
      const resultat = await ApkUpdater.requestInstallPermission();
      setAutorise(resultat.authorized);
      setEtat(resultat.authorized
        ? "L’autorisation est déjà active."
        : "Autorisez Bakhita Community dans les réglages Android, puis revenez ici.");
    } catch (error) {
      setErreur(error.message || "Impossible d’ouvrir le réglage Android.");
    }
  }

  async function telecharger() {
    if (!manifeste) return;
    setErreur("");
    setOccupe(true);
    setProgression(0);
    let ecoute;
    try {
      ecoute = await ApkUpdater.addListener("downloadProgress", (donnees) => {
        setProgression(donnees.percent >= 0 ? donnees.percent : null);
      });
      await ApkUpdater.downloadApk({
        url: manifeste.apkUrl,
        sha256: manifeste.sha256,
      });
      setApkTelecharge(true);
      setEtat("Téléchargement terminé. Vous pouvez lancer l’installation.");
    } catch (error) {
      setErreur(error.message || "Le téléchargement de la mise à jour a échoué.");
    } finally {
      await ecoute?.remove();
      setOccupe(false);
    }
  }

  async function installer() {
    setErreur("");
    try {
      await ApkUpdater.installApk();
    } catch (error) {
      setErreur(error.message || "L’installation de la mise à jour a échoué.");
    }
  }

  const miseAJourDisponible = manifeste?.versionCode > VERSION_CODE_APPLICATION;

  return (
    <section className="parametres-groupe">
      <h2 className="parametres-groupe-titre"><RefreshCw size={17} />Mise à jour de l’application</h2>
      <div className="parametres-groupe-liste">
        <div className="parametres-option-contenu" style={{ display: "grid", gap: ".65rem" }}>
          <p className="doux" style={{ margin: 0 }}>Version installée : {VERSION_APPLICATION}</p>
          <Bouton secondaire
            type="button"
            chargement={verificationEnCours}
            disabled={occupe || verificationEnCours}
            onClick={verifierMiseAJour}
          >
            Vérifier les mises à jour
          </Bouton>
          {etat && <p role="status" className="doux" style={{ margin: 0 }}>{etat}</p>}
          {manifeste?.releaseNotes && <p className="doux" style={{ margin: 0 }}>{manifeste.releaseNotes}</p>}
          {occupe && (
            <p role="status" className="doux" style={{ margin: 0 }}>
              Téléchargement de la mise à jour{progression === null ? "…" : ` : ${progression} %`}
            </p>
          )}
          {miseAJourDisponible && !apkTelecharge && !autorise && (
            <Bouton type="button" onClick={autoriserInstallation}>
              Autoriser l’installation sur cet appareil
            </Bouton>
          )}
          {miseAJourDisponible && !apkTelecharge && autorise && (
            <Bouton type="button" chargement={occupe} onClick={telecharger}>
              <><Download size={16} /> Télécharger la mise à jour</>
            </Bouton>
          )}
          {miseAJourDisponible && apkTelecharge && (
            <Bouton type="button" onClick={installer}>Installer la mise à jour</Bouton>
          )}
          {erreur && <p role="alert" className="erreur" style={{ margin: 0 }}>{erreur}</p>}
          <p className="doux" style={{ margin: 0, fontSize: ".8rem" }}>
            Android demandera de confirmer l’installation. Pour recevoir les prochaines mises à jour,
            autorisez cette application à installer des applications dans les réglages du téléphone.
          </p>
        </div>
      </div>
    </section>
  );
}
