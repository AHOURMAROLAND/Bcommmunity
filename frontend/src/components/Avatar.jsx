export function Avatar({ prenom, nom, photo, taille = 56 }) {
  const base = { width: taille, height: taille, borderRadius: "50%", flexShrink: 0 };
  if (photo) {
    return <img src={photo} alt="" loading="lazy" decoding="async" width={taille} height={taille}
      style={{ ...base, objectFit: "cover" }} />;
  }
  return (
    <div aria-hidden="true" style={{ ...base, background: "var(--primaire)", color: "var(--sur-primaire)",
      display: "grid", placeItems: "center", fontWeight: 700, fontSize: taille * 0.38 }}>
      {`${prenom?.[0] ?? ""}${nom?.[0] ?? ""}`.toUpperCase()}
    </div>
  );
}

export default Avatar;
