import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { useFil } from "../api/publications";
import { useSuggestions } from "../api/amis";
import { useProfil } from "../api/hooks";
import useSentinelle from "../hooks/useSentinelle";
import Avatar from "../components/Avatar";
import PublicationCard from "../components/PublicationCard";
import { SqCartes } from "../components/Squelettes";

export default function Fil() {
  const { data: profil } = useProfil();
  const fil = useFil();
  const sugg = useSuggestions();
  const items = fil.data?.pages.flatMap((p) => p.results) ?? [];
  const cartes = (sugg.data?.pages[0]?.results ?? []).slice(0, 10);
  const sentinelle = useSentinelle(() => fil.fetchNextPage(), !!fil.hasNextPage && !fil.isFetchingNextPage);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Fil</h1>

      <Link to="/publier" className="carte ecrire">
        <Avatar prenom={profil?.prenom} nom={profil?.nom} photo={profil?.photo_mini ?? profil?.photo} taille={44} />
        <span style={{ flex: 1 }}>
          <strong>Écrire une publication</strong>
          <span className="doux" style={{ display: "block", fontSize: "0.85rem" }}>Partagez des nouvelles avec votre école</span>
        </span>
        <span className="plus" aria-hidden="true"><Plus size={22} /></span>
      </Link>

      {cartes.length > 0 && (
        <section aria-label="Suggestions de camarades" style={{ margin: "1rem 0" }}>
          <div className="entete">
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Suggestions de camarades</h2>
            <Link className="lien" to="/amis">Tout voir</Link>
          </div>
          <ul className="bande">
            {cartes.map((c) => (
              <li key={c.id}>
                <Link to={`/profil/${c.id}`} className="bulle">
                  <Avatar prenom={c.prenom} nom={c.nom} photo={c.photo} taille={64} />
                  <span>{c.prenom} {c.nom[0]}.</span>
                  <span className="badge-commun">{c.classes_communes} classe{c.classes_communes > 1 ? "s" : ""} en commun</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {fil.isPending ? <SqCartes /> : fil.isError ? (
        <p role="alert" className="erreur">Impossible de charger le fil. Réessayez.</p>
      ) : items.length === 0 ? (
        <p className="doux">Aucune publication pour le moment. Soyez le premier à partager des nouvelles.</p>
      ) : (
        <>
          {items.map((p) => <PublicationCard key={p.id} p={p} />)}
          <div ref={sentinelle} style={{ height: 1 }} />
          {fil.isFetchingNextPage && <SqCartes n={1} />}
        </>
      )}
    </div>
  );
}
