export default function Banniere({ photo, prenom, nom, children }) {
  return (
    <div className="banniere">
      {photo ? (
        <img src={photo} alt={`Photo de ${prenom} ${nom}`} decoding="async" />
      ) : (
        <div className="banniere-vide" aria-hidden="true">
          {`${prenom?.[0] ?? ""}${nom?.[0] ?? ""}`.toUpperCase()}
        </div>
      )}
      {children}
    </div>
  );
}
