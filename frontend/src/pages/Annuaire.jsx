import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useAnnuaire } from "../api/amis";
import { useReferentiels } from "../api/hooks";
import useDebounce from "../hooks/useDebounce";
import BoutonRelation from "../components/BoutonRelation";
import { Bouton, Champ, Selecteur } from "../components/ui";
import { SqGrilleMembres } from "../components/Squelettes";

export const LIBELLES_SITUATION = { emploi: "Emploi", etudes: "Études", recherche: "En recherche" };
const VIDE = { q: "", promo: "", statut: "", cycle: "", situation: "", domaine: "", etablissement: "" };

export default function Annuaire() {
  const [f, setF] = useState(VIDE);
  const [panneau, setPanneau] = useState(false);
  const ref = useReferentiels();
  const q = useDebounce(f.q);
  const etablissement = useDebounce(f.etablissement);
  const res = useAnnuaire({ ...f, q, etablissement });
  const cartes = res.data?.pages.flatMap((p) => p.results) ?? [];
  const maj = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));

  const cycles = ref.data?.cycles ?? [];
  const domaines = ref.data?.domaines ?? [];
  const actifs = [
    f.promo && ["promo", `Promo ${f.promo}`],
    f.statut && ["statut", f.statut === "ancien" ? "Anciens" : "Élèves"],
    f.cycle && ["cycle", cycles.find((c) => String(c.id) === f.cycle)?.nom],
    f.situation && ["situation", LIBELLES_SITUATION[f.situation]],
    f.domaine && ["domaine", domaines.find((d) => String(d.id) === f.domaine)?.nom],
    f.etablissement && ["etablissement", f.etablissement],
  ].filter(Boolean);

  return (
    <div>
      <div className="entete">
        <h1 style={{ margin: 0 }}>Annuaire</h1>
        <button className="puce" aria-pressed={panneau} aria-label="Filtres" onClick={() => setPanneau((v) => !v)}>
          <SlidersHorizontal size={18} /> Filtres
        </button>
      </div>

      <div className="recherche">
        <Search size={18} aria-hidden="true" />
        <input className="champ" type="search" placeholder="Rechercher un camarade" aria-label="Rechercher un camarade"
          value={f.q} onChange={maj("q")} maxLength={80} />
      </div>

      {actifs.length > 0 && (
        <div className="puces">
          {actifs.map(([k, libelle]) => (
            <button key={k} className="puce" aria-pressed="true" onClick={() => setF((v) => ({ ...v, [k]: "" }))}>
              {libelle} <X size={14} aria-label="Retirer le filtre" />
            </button>
          ))}
        </div>
      )}

      {panneau && (
        <div className="carte" style={{ marginBottom: "1rem" }}>
          <Champ label="Promotion (année de sortie)" type="number" inputMode="numeric" min={1950}
            value={f.promo} onChange={maj("promo")} />
          <Selecteur label="Je cherche" value={f.statut} onChange={maj("statut")}>
            <option value="">Tout le monde</option>
            <option value="ancien">Anciens élèves</option>
            <option value="eleve">Élèves actuels</option>
          </Selecteur>
          <Selecteur label="Cycle fréquenté" value={f.cycle} onChange={maj("cycle")}>
            <option value="">Tous</option>
            {cycles.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </Selecteur>
          <Selecteur label="Situation" value={f.situation} onChange={maj("situation")}>
            <option value="">Toutes</option>
            {Object.entries(LIBELLES_SITUATION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Selecteur>
          <Selecteur label="Domaine d'études" value={f.domaine} onChange={maj("domaine")}>
            <option value="">Tous</option>
            {domaines.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
          </Selecteur>
          <Champ label="Université ou établissement" value={f.etablissement} onChange={maj("etablissement")} maxLength={80} />
          <Bouton secondaire onClick={() => setF(VIDE)}>Réinitialiser</Bouton>
        </div>
      )}

      {res.isPending ? <SqGrilleMembres /> : res.isError ? (
        <p role="alert" className="erreur">Impossible de charger l'annuaire. Réessayez.</p>
      ) : cartes.length === 0 ? (
        <p className="doux">Aucun résultat. Essayez d'élargir votre recherche.</p>
      ) : (
        <>
          <ul className="grille" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {cartes.map((c) => (
              <li key={c.id}>
                <article className="carte-membre-photo">
                  {/* Photo hero avec overlay nom/métier */}
                  <Link to={`/profil/${c.id}`} className="carte-membre-photo-img" style={{ display: "block", textDecoration: "none" }}>
                    {c.photo ? (
                      <img src={c.photo} alt={`${c.prenom} ${c.nom}`} loading="lazy" decoding="async" />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", background: "var(--primaire)", color: "var(--sur-primaire)", fontSize: "2.5rem", fontWeight: 700 }}>
                        {(c.prenom?.[0] ?? "").toUpperCase()}
                      </div>
                    )}
                    <div className="carte-membre-photo-overlay">
                      <h2>{c.prenom} {c.nom}</h2>
                      <span className="doux">
                        {c.situation?.texte || (c.statut === "ancien" ? "Ancien élève" : "Élève")}
                      </span>
                    </div>
                  </Link>
                  {/* Corps : badge promo + bouton relation */}
                  <div className="carte-membre-photo-body">
                    <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                      {c.annee_sortie && <span className="pastille">Promo {c.annee_sortie}</span>}
                      {c.situation && <span className="pastille">{LIBELLES_SITUATION[c.situation.type]}</span>}
                    </div>
                    <BoutonRelation c={c} />
                  </div>
                </article>
              </li>
            ))}
          </ul>
          {res.hasNextPage && (
            <div style={{ marginTop: "1rem" }}>
              <Bouton secondaire chargement={res.isFetchingNextPage} onClick={() => res.fetchNextPage()}>
                Voir plus
              </Bouton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
