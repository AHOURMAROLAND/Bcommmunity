import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ChargementLong from "@/components/ChargementLong";
import { api } from "../api/client";
import { useMajProfil, useProfil } from "../api/hooks";
import { useMajPreferences, usePreferences } from "../api/notifications";
import { useAuth } from "../auth/AuthContext";
import {
  activerPush, desactiverPush, estIOS, estInstalle, pushActif, pushSupporte,
} from "../utils/push";
import { appliquerTheme, themeActuel } from "../utils/theme";
import { Bouton, Selecteur } from "../components/ui";
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
  const majPref = useMajPreferences();
  const profil = useProfil();
  const majProfil = useMajProfil();
  const [theme, setTheme] = useState(themeActuel());
  const [push, setPush] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreurPush, setErreurPush] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [visibiliteWhatsapp, setVisibiliteWhatsapp] = useState("amis");

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

  useEffect(() => {
    pushActif().then(setPush).catch(() => {});
  }, []);

  useEffect(() => {
    if (profil.data) {
      setWhatsapp(profil.data.whatsapp ?? "");
      setVisibiliteWhatsapp(profil.data.whatsapp_visibilite ?? "amis");
    }
  }, [profil.data]);

  async function enregistrerWhatsapp() {
    if (!profil.data) return;
    await majProfil.mutateAsync({
      whatsapp,
      whatsapp_visibilite: visibiliteWhatsapp,
    });
  }

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

  if (prefs.isPending || profil.isPending) return <SqFormulaire champs={5} />;
  const p = prefs.data;
  const ios = estIOS() && !estInstalle();

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Paramètres</h1>

      <div className="carte" style={{ marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>Apparence</h2>
        <div className="puces" role="group" aria-label="Theme">
          {[['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']].map(([k, l]) => (
            <button
              key={k}
              type="button"
              className="puce"
              aria-pressed={theme === k}
              onClick={() => { setTheme(k); appliquerTheme(k); }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="carte" style={{ marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>Notifications</h2>
        <div style={{ marginBottom: "0.75rem" }}>
          <label htmlFor="pref-pub" style={{ display: "block", fontWeight: 600, marginBottom: "0.3rem" }}>
            Nouvelles publications
          </label>
          <select
            id="pref-pub"
            className="champ"
            value={p.publications}
            onChange={(e) => majPref.mutate({ publications: e.target.value })}
          >
            <option value="immediat">Immédiatement</option>
            <option value="quotidien">Un résumé par jour</option>
            <option value="desactive">Désactivées</option>
          </select>
        </div>
        <Interrupteur label="J'aime sur mes publications" valeur={p.likes} onChange={(v) => majPref.mutate({ likes: v })} />
        <Interrupteur label="Commentaires" valeur={p.commentaires} onChange={(v) => majPref.mutate({ commentaires: v })} />
        <Interrupteur label="Demandes d'ami" valeur={p.amis} onChange={(v) => majPref.mutate({ amis: v })} />
        <Interrupteur label="Messages et invitations" valeur={p.discussions} onChange={(v) => majPref.mutate({ discussions: v })} />
        <Interrupteur label="Alertes sur cet appareil (application fermée)" valeur={p.push} onChange={(v) => majPref.mutate({ push: v })} />
      </div>

      <div className="carte" style={{ marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>Confidentialité</h2>
        <div style={{ display: "grid", gap: "0.75rem" }}>
          <Selecteur label="Qui peut voir mon profil" value={profil.data.visibilite_profil ?? "tous"} onChange={(e) => majProfil.mutate({ visibilite_profil: e.target.value })}>
            <option value="tous">Tout le monde</option>
            <option value="amis">Mes amis</option>
            <option value="personne">Personne</option>
          </Selecteur>
          <Selecteur label="Qui peut voir mon parcours scolaire" value={profil.data.visibilite_parcours ?? "tous"} onChange={(e) => majProfil.mutate({ visibilite_parcours: e.target.value })}>
            <option value="tous">Tout le monde</option>
            <option value="amis">Mes amis</option>
            <option value="personne">Personne</option>
          </Selecteur>
          <Selecteur label="Qui peut voir ma situation actuelle" value={profil.data.visibilite_situation ?? "tous"} onChange={(e) => majProfil.mutate({ visibilite_situation: e.target.value })}>
            <option value="tous">Tout le monde</option>
            <option value="amis">Mes amis</option>
            <option value="personne">Personne</option>
          </Selecteur>
          <Selecteur label="Qui peut m'inviter à discuter" value={profil.data.qui_peut_inviter ?? "tous"} onChange={(e) => majProfil.mutate({ qui_peut_inviter: e.target.value })}>
            <option value="tous">Tout le monde</option>
            <option value="amis">Mes amis</option>
            <option value="personne">Personne</option>
          </Selecteur>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            <label htmlFor="wa" style={{ display: "block", fontWeight: 600 }}>WhatsApp</label>
            <input
              id="wa"
              className="champ"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+2250700000000"
            />
            <Selecteur label="Visibilité du WhatsApp" value={visibiliteWhatsapp} onChange={(e) => setVisibiliteWhatsapp(e.target.value)}>
              <option value="tous">Tout le monde</option>
              <option value="amis">Mes amis</option>
              <option value="personne">Personne</option>
            </Selecteur>
            <Bouton secondaire type="button" chargement={majProfil.isPending} onClick={enregistrerWhatsapp}>Enregistrer WhatsApp</Bouton>
          </div>
        </div>
      </div>

      <div className="carte" style={{ marginBottom: "1rem" }}>
        <strong>Alertes sur cet appareil</strong>
        {!pushSupporte() && !ios ? (
          <p className="doux" style={{ margin: "0.4rem 0 0" }}>Non disponibles sur ce navigateur.</p>
        ) : (
          <>
            <p className="doux" style={{ margin: "0.3rem 0 0.75rem" }}>
              {push ? "Les alertes sont actives sur cet appareil." : "Recevez une alerte même quand l'application est fermée."}
            </p>
            {ios && <p className="doux" style={{ margin: "0 0 0.75rem" }}>Sur iPhone, installez d'abord l'application sur l'écran d'accueil.</p>}
            <Bouton secondaire={push} chargement={occupe} onClick={basculerPush}>
              {push ? "Désactiver sur cet appareil" : "Activer sur cet appareil"}
            </Bouton>
          </>
        )}
        {erreurPush && <p role="alert" className="erreur" style={{ marginTop: "0.5rem" }}>{erreurPush}</p>}
      </div>

      <h2 style={{ fontSize: "1.05rem", marginTop: "1.5rem" }}>Utilisateurs bloqués</h2>
      {bloques.isPending ? (
        <SqFormulaire champs={1} />
      ) : !(bloques.data ?? []).length ? (
        <p className="doux">Vous n'avez bloqué personne.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {bloques.data.map((b) => (
            <li key={b.id} className="ligne-membre">
              <div className="infos"><strong>{b.prenom} {b.nom}</strong></div>
              <div className="actions">
                <Bouton secondaire chargement={debloquer.isPending} onClick={() => debloquer.mutate(b.id)}>
                  Débloquer
                </Bouton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: "1.5rem" }}>
        <Bouton secondaire onClick={deconnexion}>Se déconnecter</Bouton>
      </div>

      <ChargementLong actif={occupe} label="Activation des notifications..." />
    </div>
  );
}
