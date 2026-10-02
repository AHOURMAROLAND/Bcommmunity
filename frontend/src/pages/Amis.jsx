import { useState } from "react";
import { useAmis, useAnnulerDemande, useDemandes, useRetirerAmi, useSuggestions } from "../api/amis";
import BoutonRelation from "../components/BoutonRelation";
import LigneMembre from "../components/LigneMembre";
import { Bouton, Chargement } from "../components/ui";

function Liste({ requete, vide, rendu }) {
  if (requete.isPending) return <Chargement />;
  const items = requete.data?.pages.flatMap((p) => p.results) ?? [];
  if (!items.length) return <p className="doux">{vide}</p>;
  return (
    <>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>{items.map(rendu)}</ul>
      {requete.hasNextPage && (
        <Bouton secondaire chargement={requete.isFetchingNextPage} onClick={() => requete.fetchNextPage()}>
          Voir plus
        </Bouton>
      )}
    </>
  );
}

function Suggestions() {
  return (
    <Liste requete={useSuggestions()}
      vide="Aucune suggestion pour le moment. Complétez votre parcours scolaire pour retrouver vos camarades."
      rendu={(c) => (
        <LigneMembre key={c.id} c={c}
          sous={`${c.classes_communes} classe${c.classes_communes > 1 ? "s" : ""} en commun`}>
          <BoutonRelation c={c} />
        </LigneMembre>
      )} />
  );
}

function Demandes() {
  const annuler = useAnnulerDemande();
  const recues = useDemandes("recues");
  const envoyees = useDemandes("envoyees");
  return (
    <>
      <h2 style={{ fontSize: "1.05rem" }}>Reçues</h2>
      <Liste requete={recues} vide="Aucune demande reçue."
        rendu={(c) => <LigneMembre key={c.id} c={c}><BoutonRelation c={c} /></LigneMembre>} />
      <h2 style={{ fontSize: "1.05rem" }}>Envoyées</h2>
      <Liste requete={envoyees} vide="Aucune demande en attente."
        rendu={(c) => (
          <LigneMembre key={c.id} c={c}>
            <Bouton secondaire chargement={annuler.isPending} onClick={() => annuler.mutate(c.demande_id)}>Annuler</Bouton>
          </LigneMembre>
        )} />
    </>
  );
}

function MesAmis() {
  const retirer = useRetirerAmi();
  return (
    <Liste requete={useAmis()} vide="Vous n'avez pas encore d'amis. Consultez l'annuaire ou les suggestions."
      rendu={(c) => (
        <LigneMembre key={c.id} c={c}>
          <Bouton secondaire chargement={retirer.isPending}
            onClick={() => window.confirm(`Retirer ${c.prenom} de vos amis ?`) && retirer.mutate(c.id)}>
            Retirer
          </Bouton>
        </LigneMembre>
      )} />
  );
}

const ONGLETS = [["suggestions", "Suggestions", Suggestions], ["demandes", "Demandes", Demandes], ["amis", "Mes amis", MesAmis]];

export default function Amis() {
  const [actif, setActif] = useState("suggestions");
  const Contenu = ONGLETS.find(([id]) => id === actif)[2];
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Amis</h1>
      <div className="puces" role="tablist" aria-label="Amis">
        {ONGLETS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={actif === id} aria-pressed={actif === id}
            className="puce" onClick={() => setActif(id)}>{label}</button>
        ))}
      </div>
      <Contenu />
    </div>
  );
}
