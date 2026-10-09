import { Link, useParams } from "react-router-dom";
import { useProfil } from "../api/hooks";
import { useProfilPublic } from "../api/amis";
import GalerieCarousel from "../components/GalerieCarousel";

export default function Galerie() {
  const { id } = useParams();
  const mien = useProfil(!id);
  const publicProfil = useProfilPublic(id ?? "", Boolean(id));
  const profil = id ? publicProfil : mien;

  if (profil.isPending) return <p className="doux">Chargement de la galerie…</p>;
  if (profil.isError) return <p role="alert" className="erreur">Cette galerie n'est pas disponible.</p>;

  const cheminRetour = id ? `/profil/${id}` : "/profil";
  const photos = profil.data.galerie ?? [];

  return (
    <section>
      <div className="entete">
        <h1 style={{ margin: 0 }}>Galerie de {id ? profil.data.prenom : "mon profil"}</h1>
        <Link className="puce" to={cheminRetour}>Retour au profil</Link>
      </div>
      {photos.length ? (
        <GalerieCarousel photos={photos} />
      ) : (
        <p className="doux">Aucune photo dans cette galerie pour le moment.</p>
      )}
      {!id && (
        <Link className="puce" to="/parametres">Gérer mes photos</Link>
      )}
    </section>
  );
}
