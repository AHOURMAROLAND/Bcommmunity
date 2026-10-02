import { useId } from "react";

export function Champ({ label, erreur, ...props }) {
  const id = useId();
  return (
    <div style={{ marginBottom: "1rem" }}>
      <label htmlFor={id} style={{ display: "block", marginBottom: "0.3rem", fontWeight: 600 }}>{label}</label>
      <input id={id} className="champ" aria-invalid={!!erreur}
        aria-describedby={erreur ? `${id}-e` : undefined} {...props} />
      {erreur && <p id={`${id}-e`} role="alert" className="erreur">{erreur}</p>}
    </div>
  );
}

export function Selecteur({ label, erreur, children, ...props }) {
  const id = useId();
  return (
    <div style={{ marginBottom: "1rem" }}>
      <label htmlFor={id} style={{ display: "block", marginBottom: "0.3rem", fontWeight: 600 }}>{label}</label>
      <select id={id} className="champ" aria-invalid={!!erreur} {...props}>{children}</select>
      {erreur && <p role="alert" className="erreur">{erreur}</p>}
    </div>
  );
}

export function Bouton({ chargement, secondaire, children, ...props }) {
  return (
    <button className={`btn${secondaire ? " btn-sec" : ""}`} disabled={chargement || props.disabled} {...props}>
      {chargement ? "Veuillez patienter..." : children}
    </button>
  );
}

export function Chargement() {
  return <p role="status" className="doux" style={{ padding: "2rem", textAlign: "center" }}>Chargement...</p>;
}

export function Marque({ sous }) {
  return (
    <header style={{ textAlign: "center", margin: "1rem 0 1.5rem" }}>
      <div className="titre" style={{ fontSize: "2rem", lineHeight: 1.1 }}>Bakhita</div>
      <div style={{ fontWeight: 500 }}>Community</div>
      {sous && <p className="doux" style={{ marginTop: "0.75rem" }}>{sous}</p>}
    </header>
  );
}
