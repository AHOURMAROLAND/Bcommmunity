import { Link } from "react-router-dom";
import Avatar from "./Avatar";

export default function LigneMembre({ c, sous, children }) {
  return (
    <li className="ligne-membre">
      <Link to={`/profil/${c.id}`} aria-label={`Profil de ${c.prenom} ${c.nom}`}>
        <Avatar prenom={c.prenom} nom={c.nom} />
      </Link>
      <div className="infos">
        <Link to={`/profil/${c.id}`} style={{ color: "inherit", textDecoration: "none" }}>
          <strong>{c.prenom} {c.nom}</strong>
        </Link>
        <div className="doux" style={{ fontSize: "0.85rem" }}>
          {sous ?? c.situation?.texte ?? (c.statut === "ancien" ? "Ancien élève" : "Élève")}
        </div>
      </div>
      <div className="actions">{children}</div>
    </li>
  );
}
