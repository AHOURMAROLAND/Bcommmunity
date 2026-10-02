import { useProfil } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import Avatar from "../components/Avatar";
import { Bouton, Chargement } from "../components/ui";

export default function MonProfil() {
  const { deconnexion } = useAuth();
  const { data } = useProfil();
  if (!data) return <Chargement />;
  const lignes = [...data.scolarites].sort((a, b) => b.annee_debut - a.annee_debut);
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Mon profil</h1>
      <div className="carte" style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
        <Avatar prenom={data.prenom} nom={data.nom} taille={72} />
        <div>
          <h2 style={{ margin: 0 }}>{data.prenom} {data.nom}</h2>
          <p className="doux" style={{ margin: 0 }}>
            {data.statut === "ancien" ? "Ancien élève" : "Élève"}{data.annee_sortie ? `, promo ${data.annee_sortie}` : ""}
          </p>
        </div>
      </div>
      {data.bio && <p>{data.bio}</p>}
      <h2>Parcours scolaire</h2>
      {lignes.length === 0 ? <p className="doux">Aucune classe renseignée.</p> : (
        <ol className="frise">
          {lignes.map((l) => (
            <li key={l.id}>
              <strong>{l.classe_detail.nom} {l.classe_detail.filiere}</strong>
              <div className="doux">{l.annee_debut} - {l.annee_fin}</div>
            </li>
          ))}
        </ol>
      )}
      <Bouton secondaire onClick={deconnexion}>Se déconnecter</Bouton>
    </div>
  );
}
