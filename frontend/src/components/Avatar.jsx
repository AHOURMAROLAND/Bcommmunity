export function Avatar({ prenom, nom, taille = 56 }) {
  const initiales = `${prenom?.[0] ?? ""}${nom?.[0] ?? ""}`.toUpperCase();
  return (
    <div aria-hidden="true" style={{
      width: taille, height: taille, borderRadius: "50%", background: "var(--primaire)",
      color: "var(--sur-primaire)", display: "grid", placeItems: "center",
      fontWeight: 700, fontSize: taille * 0.38, flexShrink: 0 }}>
      {initiales}
    </div>
  );
}

export default Avatar;

