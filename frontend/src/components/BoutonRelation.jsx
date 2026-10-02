import { Clock, UserCheck, UserPlus } from "lucide-react";
import { useAccepterDemande, useEnvoyerDemande, useRefuserDemande } from "../api/amis";
import { tousMessages } from "../api/erreurs";
import { Bouton } from "./ui";

export default function BoutonRelation({ c }) {
  const envoyer = useEnvoyerDemande();
  const accepter = useAccepterDemande();
  const refuser = useRefuserDemande();
  const echec = [envoyer, accepter, refuser].find((m) => m.isError)?.error;

  let contenu;
  if (c.relation === "amis") {
    contenu = <button className="btn btn-sec" disabled><UserCheck size={16} /> Amis</button>;
  } else if (c.relation === "envoyee") {
    contenu = <button className="btn btn-sec" disabled><Clock size={16} /> En attente</button>;
  } else if (c.relation === "recue") {
    contenu = (
      <div className="duo">
        <Bouton chargement={accepter.isPending} onClick={() => accepter.mutate(c.demande_id)}>Accepter</Bouton>
        <Bouton secondaire chargement={refuser.isPending} onClick={() => refuser.mutate(c.demande_id)}>Refuser</Bouton>
      </div>
    );
  } else {
    contenu = (
      <Bouton chargement={envoyer.isPending} onClick={() => envoyer.mutate(c.id)}>
        <UserPlus size={16} /> Ajouter
      </Bouton>
    );
  }
  return <>{contenu}{echec && <p role="alert" className="erreur">{tousMessages(echec)}</p>}</>;
}
