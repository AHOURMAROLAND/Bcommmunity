import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ChargementLong from "@/components/ChargementLong";
import { api } from "../api/client";
import { useMajPreferences, usePreferences } from "../api/notifications";
import { useAuth } from "../auth/AuthContext";
import {
  activerPush, desactiverPush, estIOS, estInstalle, pushActif, pushSupporte,
} from "../utils/push";
import { appliquerTheme, themeActuel } from "../utils/theme";
import { Bouton } from "../components/ui";
import { SqFormulaire } from "../components/Squelettes";

const ERREURS_PUSH = {
  non_supporte: "Ce navigateur ne gere pas les notifications push.",
  ios_installer:
    "Sur iPhone, ajoutez d'abord l'application a l'ecran d'accueil (Partager, puis Sur l'ecran d'accueil), puis rouvrez-la.",
  refuse:
    "Vous avez refuse les notifications. Autorisez-les dans les reglages du navigateur.",
};

function Interrupteur({ label, valeur, onChange }) {
  return (
    <label className="interrupteur-ligne">
      <span style={{ flex: 1 }}>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={!!valeur}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export default function Parametres() {
  const { deconnexion } = useAuth();
  const qc = useQueryClient();
  const prefs = usePreferences();
  const maj = useMajPreferences();
  const [theme, setTheme] = useState(themeActuel());
  const [push, setPush] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreurPush, setErreurPush] = useState("");

  const bloques = useQuery({
    queryKey: ["bloques"],
    queryFn: () => api("/blocages/"),
  });
  const debloquer = useMutation({
    mutationFn: (id) => api(`/blocages/${id}/`, { method: "DELETE" }),
    onSuccess: () =>
      ["bloques", "annuaire", "suggestions"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] })),
  });

  useEffect(() => { pushActif().then(setPush).catch(() => {}); }, []);

  async function basculerPush() {
    setErreurPush("");
    setOccupe(true);
    try {
      if (push) {
        await desactiverPush();
        setPush(false);
      } else {
        await activerPush();
        setPush(true);
      }
    } catch (e) {
      setErreurPush(ERREURS_PUSH[e.message] ?? "Impossible de modifier les notifications.");
    } finally {
      setOccupe(false);
    }
  }

  if (prefs.isPending) return <SqFormulaire champs={5} />;
  const p = prefs.data;
  const ios = estIOS() && !estInstalle();

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Parametres</h1>

      {/* ---- Apparence ---- */}
      <h2 style={{ fontSize: "1.05rem" }}>Apparence</h2>
      <div className="puces" role="group" aria-label="Theme">
        {[["auto", "Automatique"], ["light", "Clair"], ["dark", "Sombre"]].map(([k, l]) => (
          <button
            key={k} type="button" className="puce" aria-pressed={theme === k}
            onClick={() => { setTheme(k); appliquerTheme(k); }}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ---- Notifications ---- */}
      <h2 style={{ fontSize: "1.05rem", marginTop: "1.5rem" }}>Notifications</h2>
      <div className="carte" style={{ marginBottom: "1rem" }}>
        <div style={{ marginBottom: "0.75rem" }}>
          <label
            htmlFor="pref-pub"
            style={{ display: "block", fontWeight: 600, marginBottom: "0.3rem" }}
          >
            Nouvelles publications
          </label>
          <select
            id="pref-pub"
            className="champ"
            value={p.publications}
            onChange={(e) => maj.mutate({ publications: e.target.value })}
          >
            <option value="immediat">Immediatement</option>
            <option value="quotidien">Un resume par jour</option>
            <option value="desactive">Desactivees</option>
          </select>
        </div>
        <Interrupteur
          label="J'aime sur mes publications"
          valeur={p.likes}
          onChange={(v) => maj.mutate({ likes: v })}
        />
        <Interrupteur
          label="Commentaires"
          valeur={p.commentaires}
          onChange={(v) => maj.mutate({ commentaires: v })}
        />
        <Interrupteur
          label="Demandes d'ami"
          valeur={p.amis}
          onChange={(v) => maj.mutate({ amis: v })}
        />
        <Interrupteur
          label="Messages et invitations"
          valeur={p.discussions}
          onChange={(v) => maj.mutate({ discussions: v })}
        />
        <Interrupteur
          label="Alertes sur cet appareil (application fermee)"
          valeur={p.push}
          onChange={(v) => maj.mutate({ push: v })}
        />
      </div>

      {/* ---- Push cet appareil ---- */}
      <div className="carte" style={{ marginBottom: "1rem" }}>
        <strong>Alertes sur cet appareil</strong>
        {!pushSupporte() && !ios ? (
          <p className="doux" style={{ margin: "0.4rem 0 0" }}>
            Non disponibles sur ce navigateur.
          </p>
        ) : (
          <>
            <p className="doux" style={{ margin: "0.3rem 0 0.75rem" }}>
              {push
                ? "Les alertes sont activees sur cet appareil."
                : "Recevez une alerte meme quand l'application est fermee."}
            </p>
            {ios && (
              <p className="doux" style={{ margin: "0 0 0.75rem" }}>
                Sur iPhone, installez d'abord l'application sur l'ecran d'accueil.
              </p>
            )}
            <Bouton secondaire={push} chargement={occupe} onClick={basculerPush}>
              {push ? "Desactiver sur cet appareil" : "Activer sur cet appareil"}
            </Bouton>
          </>
        )}
        {erreurPush && (
          <p role="alert" className="erreur" style={{ marginTop: "0.5rem" }}>{erreurPush}</p>
        )}
      </div>

      {/* ---- Blocages ---- */}
      <h2 style={{ fontSize: "1.05rem", marginTop: "1.5rem" }}>Utilisateurs bloques</h2>
      {bloques.isPending ? (
        <SqFormulaire champs={1} />
      ) : !(bloques.data ?? []).length ? (
        <p className="doux">Vous n'avez bloque personne.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {bloques.data.map((b) => (
            <li key={b.id} className="ligne-membre">
              <div className="infos">
                <strong>{b.prenom} {b.nom}</strong>
              </div>
              <div className="actions">
                <Bouton
                  secondaire
                  chargement={debloquer.isPending}
                  onClick={() => debloquer.mutate(b.id)}
                >
                  Debloquer
                </Bouton>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ---- Deconnexion ---- */}
      <div style={{ marginTop: "1.5rem" }}>
        <Bouton secondaire onClick={deconnexion}>Se deconnecter</Bouton>
      </div>

      <ChargementLong actif={occupe} label="Activation des notifications..." />
    </div>
  );
}
