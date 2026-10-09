import { useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { useAnnuaire } from "../api/amis";
import { useFil } from "../api/publications";
import useDebounce from "../hooks/useDebounce";
import Avatar from "../components/Avatar";
import PublicationCard from "../components/PublicationCard";
import { Bouton } from "../components/ui";

const TYPES = [
  ["tout", "Tout"],
  ["membres", "Personnes"],
  ["publications", "Publications"],
];

export default function Recherche() {
  const [texte, setTexte] = useState("");
  const [type, setType] = useState("tout");
  const terme = useDebounce(texte.trim());
  const actif = terme.length > 0;
  const membres = useAnnuaire({ q: terme }, actif && type !== "publications");
  const publications = useFil(undefined, terme, actif && type !== "membres");
  const resultatMembres = membres.data?.pages.flatMap((page) => page.results) ?? [];
  const resultatPublications = publications.data?.pages.flatMap((page) => page.results) ?? [];

  return (
    <div>
      <h1>Recherche</h1>
      <label className="recherche" style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
        <Search size={18} aria-hidden="true" />
        <input
          className="champ"
          type="search"
          autoFocus
          maxLength={120}
          placeholder="Rechercher une personne ou une publication"
          aria-label="Rechercher une personne ou une publication"
          value={texte}
          onChange={(event) => setTexte(event.target.value)}
        />
      </label>
      <div className="puces" role="tablist" aria-label="Type de résultats">
        {TYPES.map(([valeur, label]) => (
          <button
            key={valeur}
            type="button"
            role="tab"
            aria-selected={type === valeur}
            className="puce"
            onClick={() => setType(valeur)}
          >
            {label}
          </button>
        ))}
      </div>

      {!actif ? (
        <p className="doux">Saisissez un nom, un mot ou une phrase pour rechercher.</p>
      ) : (
        <>
          {type !== "publications" && (
            <section aria-labelledby="resultats-personnes">
              <h2 id="resultats-personnes">Personnes</h2>
              {membres.isPending ? <p className="doux">Recherche…</p> : membres.isError ? (
                <p role="alert" className="erreur">Impossible de rechercher des personnes.</p>
              ) : resultatMembres.length ? (
                <>
                  <ul style={{ listStyle: "none", padding: 0 }}>
                    {resultatMembres.map((personne) => (
                      <li key={personne.id} className="ligne-membre">
                        <Link to={`/profil/${personne.id}`}>
                          <Avatar prenom={personne.prenom} nom={personne.nom} photo={personne.photo} taille={44} />
                        </Link>
                        <Link className="infos" to={`/profil/${personne.id}`}>
                          <strong>{personne.prenom} {personne.nom}</strong>
                          <span className="doux">{personne.situation?.texte || personne.ville || ""}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {membres.hasNextPage && (
                    <Bouton secondaire chargement={membres.isFetchingNextPage} onClick={() => membres.fetchNextPage()}>
                      Voir plus de personnes
                    </Bouton>
                  )}
                </>
              ) : <p className="doux">Aucune personne trouvée.</p>}
            </section>
          )}

          {type !== "membres" && (
            <section aria-labelledby="resultats-publications">
              <h2 id="resultats-publications">Publications</h2>
              {publications.isPending ? <p className="doux">Recherche…</p> : publications.isError ? (
                <p role="alert" className="erreur">Impossible de rechercher des publications.</p>
              ) : resultatPublications.length ? (
                <>
                  {resultatPublications.map((publication) => (
                    <PublicationCard key={publication.id} p={publication} />
                  ))}
                  {publications.hasNextPage && (
                    <Bouton secondary chargement={publications.isFetchingNextPage} onClick={() => publications.fetchNextPage()}>
                      Voir plus de publications
                    </Bouton>
                  )}
                </>
              ) : <p className="doux">Aucune publication trouvée.</p>}
            </section>
          )}
        </>
      )}
    </div>
  );
}
