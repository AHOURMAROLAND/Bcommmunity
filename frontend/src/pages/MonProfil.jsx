import { useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, ChevronRight, GraduationCap, MoreHorizontal, Pencil } from "lucide-react";
import { useMesPublications } from "../api/publications";
import { useProfil } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { ilYa } from "../utils/date";
import { LIBELLES_SITUATION, resumeSituation } from "../utils/situation";
import Banniere from "../components/Banniere";
import { Bouton } from "../components/ui";
import { SqListe, SqProfil } from "../components/Squelettes";
import { MesAmis } from "./Amis";

function MesPublications() {
  const q = useMesPublications();
  if (q.isPending) return <SqListe n={3} />;
  const items = q.data?.pages.flatMap((p) => p.results) ?? [];
  if (!items.length) return <p className="doux">Vous n'avez rien publié. <Link className="lien" to="/publier">Écrire une publication</Link></p>;
  return (
    <>
      <ul className="liste-pub">
        {items.map((p) => (
          <li key={p.id}>
            <Link to={p.statut === "brouillon" ? `/publier/${p.id}` : `/publications/${p.id}`} className="ligne-pub">
              {p.image ? <img src={p.image.mini ?? p.image.src} alt="" width="56" height="56" loading="lazy" decoding="async" /> : <span className="vignette" aria-hidden="true" />}
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>{p.titre}</strong>
                <span className="doux" style={{ display: "block", fontSize: "0.82rem" }}>{ilYa(p.cree_le)}</span>
              </span>
              {p.statut === "brouillon" && <span className="pastille pastille-attention">Brouillon</span>}
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      {q.hasNextPage && <Bouton secondaire chargement={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Voir plus</Bouton>}
    </>
  );
}

export default function MonProfil() {
  const { deconnexion } = useAuth();
  const { data } = useProfil();
  const [onglet, setOnglet] = useState("publications");
  const [menu, setMenu] = useState(false);
  if (!data) return <SqProfil />;

  const resume = resumeSituation(data.situation);
  const type = data.situation?.type;
  return (
    <div>
      <div className="entete">
        <h1 style={{ margin: 0 }}>Mon profil</h1>
        <div style={{ position: "relative" }}>
          <button className="puce" aria-label="Plus d'options" aria-expanded={menu} onClick={() => setMenu((v) => !v)}><MoreHorizontal size={18} /></button>
          {menu && <div className="carte" style={{ position: "absolute", right: 0, zIndex: 5, width: "13rem" }}><Bouton secondaire onClick={deconnexion}>Se déconnecter</Bouton></div>}
        </div>
      </div>

      <Banniere photo={data.photo} prenom={data.prenom} nom={data.nom}><span className="etiquette-banniere"><GraduationCap size={14} /> Bakhita</span></Banniere>
      <h2 style={{ margin: "0.75rem 0 0", fontSize: "1.5rem" }}>{data.prenom} {data.nom}</h2>
      <p className="doux" style={{ margin: 0 }}>{data.statut === "ancien" ? "Ancien élève" : "Élève"}{data.annee_sortie ? ` · promo ${data.annee_sortie}` : ""}</p>
      {resume && <p style={{ margin: "0.2rem 0 0.75rem" }}>{resume}</p>}
      <Link to="/profil/modifier" className="btn btn-sec" style={{ margin: "0.5rem 0 1rem" }}><Pencil size={16} /> Modifier le profil</Link>

      {data.statut === "ancien" && (
        <section className="carte" aria-label="Situation actuelle" style={{ marginBottom: "1rem" }}>
          <div className="entete" style={{ marginBottom: "0.5rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Situation actuelle</h2>
            {type && type !== "autre" && <span className="pastille"><Briefcase size={12} /> {LIBELLES_SITUATION[type]}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ flex: 1 }}>{resume ?? <span className="doux">Non renseignée</span>}</span>
            <Link to="/profil/modifier?section=situation" className="puce">Modifier</Link>
          </div>
        </section>
      )}

      <div className="puces" role="tablist">
        {[["publications", "Mes publications"], ["amis", "Mes amis"]].map(([k, l]) => (
          <button key={k} role="tab" className="puce" aria-selected={onglet === k} aria-pressed={onglet === k} onClick={() => setOnglet(k)}>{l}</button>
        ))}
      </div>
      {onglet === "publications" ? <MesPublications /> : <MesAmis />}
    </div>
  );
}
