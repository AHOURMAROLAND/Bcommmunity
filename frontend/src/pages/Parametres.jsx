import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ChargementLong from "../components/ChargementLong";
import { api } from "../api/client";
import { useMajPreferences, usePreferences } from "../api/notifications";
import { useAuth } from "../auth/AuthContext";
import { activerPush, desactiverPush, estIOS, estInstalle, pushActif, pushSupporte } from "../utils/push";
import { appliquerTheme, themeActuel } from "../utils/theme";
import useInstallation from "../hooks/useInstallation";
import { Bouton } from "../components/ui";
import { SqFormulaire } from "../components/Squelettes";
import SuppressionCompte from "../components/SuppressionCompte";

const ERREURS_PUSH = {
  non_supporte: "Ce navigateur ne gère pas les notifications.",
  ios_installer: "Sur iPhone, ajoutez d'abord l'application à l'écran d'accueil (Partager, puis Sur l'écran d'accueil), puis rouvrez-la.",
  refuse: "Vous avez refusé les notifications. Autorisez-les dans les réglages du navigateur.",
};

function Interrupteur({ label, valeur, onChange }) {
  return (
    <label className="interrupteur-ligne">
      <span style={{ flex: 1 }}>{label}</span>
      <input type="checkbox" role="switch" checked={valeur} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default function Parametres() {
  const { deconnexion } = useAuth();
  const inst = useInstallation();
  const qc = useQueryClient();
  const prefs = usePreferences();
  const maj = useMajPreferences();
  const [theme, setTheme] = useState(themeActuel());
  const [push, setPush] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState("");
  const bloques = useQuery({ queryKey: ["bloques"], queryFn: () => api("/blocages/") });
  const debloquer = useMutation({
    mutationFn: (id) => api(`/blocages/${id}/`, { method: "DELETE" }),
    onSuccess: () => ["bloques", "annuaire", "suggestions"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });

  useEffect(() => { pushActif().then(setPush).catch(() => {}); }, []);

  async function basculerPush() {
    setErreur(""); setOccupe(true);
    try {
      if (push) { await desactiverPush(); setPush(false); } else { await activerPush(); setPush(true); }
    } catch (e) {
      setErreur(ERREURS_PUSH[e.message] ?? "Impossible de modifier les notifications.");
    } finally { setOccupe(false); }
  }

  if (prefs.isPending) return <SqFormulaire champs={5} />;
  const p = prefs.data;
  const ios = estIOS() && !estInstalle();

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Paramètres</h1>

      <h2 style={{ fontSize: "1.05rem" }}>Apparence</h2>
      <div className="puces" role="group" aria-label="Thème">
        {[["auto", "Automatique"], ["light", "Clair"], ["dark", "Sombre"]].map(([k, l]) => (
          <button key={k} type="button" className="puce" aria-pressed={theme === k}
            onClick={() => { setTheme(k); appliquerTheme(k); }}>{l}</button>
        ))}
      </div>

      <h2 style={{ fontSize: "1.05rem" }}>Notifications</h2>
      <div className="carte" style={{ marginBottom: "1rem" }}>
        <label htmlFor="pub" style={{ fontWeight: 600 }}>Nouvelles publications</label>
        <select id="pub" className="champ" value={p.publications} onChange={(e) => maj.mutate({ publications: e.target.value })}>
          <option value="immediat">Immédiatement</option>
          <option value="quotidien">Un résumé par jour</option>
          <option value="desactive">Désactivées</option>
        </select>
        <Interrupteur label="J'aime sur mes publications" valeur={p.likes} onChange={(v) => maj.mutate({ likes: v })} />
        <Interrupteur label="Commentaires" valeur={p.commentaires} onChange={(v) => maj.mutate({ commentaires: v })} />
        <Interrupteur label="Demandes d'ami" valeur={p.amis} onChange={(v) => maj.mutate({ amis: v })} />
        <Interrupteur label="Messages et invitations" valeur={p.discussions} onChange={(v) => maj.mutate({ discussions: v })} />
        <Interrupteur label="Alertes sur cet appareil quand l'application est fermée" valeur={p.push} onChange={(v) => maj.mutate({ push: v })} />
      </div>

      <div className="carte" style={{ marginBottom: "1rem" }}>
        <strong>Alertes sur cet appareil</strong>
        {!pushSupporte() && !ios ? <p className="doux">Non disponibles sur ce navigateur.</p> : (
          <>
            <p className="doux" style={{ marginTop: "0.3rem" }}>
              {push ? "Activées sur cet appareil." : "Recevez une alerte même quand l'application est fermée."}
            </p>
            {ios && <p className="doux">Sur iPhone, installez d'abord l'application sur l'écran d'accueil.</p>}
            <Bouton secondaire={push} chargement={occupe} onClick={basculerPush}>
              {push ? "Désactiver sur cet appareil" : "Activer sur cet appareil"}
            </Bouton>
          </>
        )}
        {erreur && <p role="alert" className="erreur">{erreur}</p>}
      </div>

      {(inst.peutInstaller || inst.ios) && (
        <div className="carte" style={{ marginBottom: "1rem" }}>
          <strong>Installer l'application</strong>
          {inst.ios
            ? <p className="doux">Appuyez sur Partager, puis sur « Sur l'écran d'accueil ».</p>
            : <Bouton onClick={inst.installer}>Installer sur cet appareil</Bouton>}
        </div>
      )}

      <h2 style={{ fontSize: "1.05rem" }}>Utilisateurs bloqués</h2>
      {bloques.isPending ? <SqFormulaire champs={1} /> : (bloques.data ?? []).length === 0 ? (
        <p className="doux">Vous n'avez bloqué personne.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {bloques.data.map((b) => (
            <li key={b.id} className="ligne-membre">
              <div className="infos"><strong>{b.prenom} {b.nom}</strong></div>
              <div className="actions"><Bouton secondaire chargement={debloquer.isPending} onClick={() => debloquer.mutate(b.id)}>Débloquer</Bouton></div>
            </li>
          ))}
        </ul>
      )}

      <h2 style={{ fontSize: "1.05rem", marginTop: "1.5rem" }}>Mon compte</h2>
      <SuppressionCompte />

      <div style={{ marginTop: "1.5rem" }}><Bouton secondaire onClick={deconnexion}>Se déconnecter</Bouton></div>
      <ChargementLong actif={occupe} label="Activation des notifications..." />
    </div>
  );
}
