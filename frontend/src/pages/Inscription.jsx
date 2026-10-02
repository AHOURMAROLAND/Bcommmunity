import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Bouton, Champ, Marque, Selecteur } from "../components/ui";
import { erreursChamps, tousMessages } from "../api/erreurs";
import AccesGoogle from "../components/AccesGoogle";

const VIDE = { prenom: "", nom: "", email: "", statut: "eleve", password: "", confirmation: "" };

export default function Inscription() {
  const [f, setF] = useState(VIDE);
  const [accepte, setAccepte] = useState(false);
  const [erreurs, setErreurs] = useState({});
  const [general, setGeneral] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [termine, setTermine] = useState(false);

  const maj = (champ) => (e) => setF((v) => ({ ...v, [champ]: e.target.value }));

  function verifier() {
    const e = {};
    if (!f.prenom.trim()) e.prenom = "Le prénom est obligatoire.";
    if (!f.nom.trim()) e.nom = "Le nom est obligatoire.";
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = "Adresse e-mail invalide.";
    if (f.password.length < 10) e.password = "10 caractères minimum.";
    if (f.password !== f.confirmation) e.confirmation = "Les mots de passe ne correspondent pas.";
    if (!accepte) e.accepte = "Vous devez accepter les conditions.";
    return e;
  }

  async function soumettre(ev) {
    ev.preventDefault();
    if (envoi) return;
    const e = verifier();
    setErreurs(e);
    setGeneral("");
    if (Object.keys(e).length) return;
    setEnvoi(true);
    try {
      await api("/auth/inscription/", {
        method: "POST",
        body: { prenom: f.prenom.trim(), nom: f.nom.trim(), email: f.email.trim(),
                statut: f.statut, password: f.password },
      });
      setTermine(true);
    } catch (err) {
      const champs = erreursChamps(err);
      const connus = ["prenom", "nom", "email", "password", "statut"];
      setErreurs(Object.fromEntries(Object.entries(champs).filter(([k]) => connus.includes(k))));
      if (!Object.keys(champs).some((k) => connus.includes(k))) setGeneral(tousMessages(err));
    } finally {
      setEnvoi(false);
    }
  }

  if (termine) {
    return (
      <main className="page"><div className="boite">
        <Marque />
        <div className="carte" role="status">
          <h1 style={{ marginTop: 0, fontSize: "1.3rem" }}>Compte créé</h1>
          <p>Votre inscription est enregistrée. L'école doit la valider avant votre première connexion.</p>
          <Link className="lien" to="/connexion">Retour à la connexion</Link>
        </div>
      </div></main>
    );
  }

  return (
    <main className="page"><div className="boite">
      <Marque sous="Rejoignez la communauté de votre école." />
      <div className="carte" style={{ marginBottom: "1rem" }}>
        <AccesGoogle texte="signup_with" />
        <p className="doux" style={{ textAlign: "center", marginBottom: 0 }}>ou créez un compte avec votre e-mail</p>
      </div>
      <form className="carte" onSubmit={soumettre} noValidate>
        <h1 style={{ marginTop: 0, fontSize: "1.3rem" }}>Créer un compte</h1>
        <Champ label="Prénom" autoComplete="given-name" value={f.prenom} onChange={maj("prenom")} erreur={erreurs.prenom} />
        <Champ label="Nom" autoComplete="family-name" value={f.nom} onChange={maj("nom")} erreur={erreurs.nom} />
        <Champ label="Adresse e-mail" type="email" autoComplete="email" value={f.email} onChange={maj("email")} erreur={erreurs.email} />
        <Selecteur label="Vous êtes" value={f.statut} onChange={maj("statut")} erreur={erreurs.statut}>
          <option value="eleve">Élève actuel</option>
          <option value="ancien">Ancien élève</option>
        </Selecteur>
        <Champ label="Mot de passe" type="password" autoComplete="new-password" value={f.password} onChange={maj("password")} erreur={erreurs.password} />
        <Champ label="Confirmer le mot de passe" type="password" autoComplete="new-password" value={f.confirmation} onChange={maj("confirmation")} erreur={erreurs.confirmation} />
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", marginBottom: "1rem" }}>
          <input type="checkbox" checked={accepte} onChange={(e) => setAccepte(e.target.checked)} />
          <span>J'accepte les conditions d'utilisation et la politique de confidentialité.</span>
        </label>
        {erreurs.accepte && <p role="alert" className="erreur">{erreurs.accepte}</p>}
        {general && <p role="alert" className="erreur" style={{ marginBottom: "1rem" }}>{general}</p>}
        <Bouton type="submit" chargement={envoi}>Créer mon compte</Bouton>
        <p className="doux" style={{ textAlign: "center", marginBottom: 0 }}>
          Déjà inscrit ? <Link className="lien" to="/connexion">Se connecter</Link>
        </p>
      </form>
    </div></main>
  );
}
