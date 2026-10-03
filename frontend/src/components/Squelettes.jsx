import { matchPath, useLocation } from "react-router-dom";

export function Sq({ w = "100%", h = "1rem", r = "0.5rem", style }) {
  return <span className="sq" aria-hidden="true" style={{ display: "block", width: w, height: h, borderRadius: r, ...style }} />;
}

// Annonce « Chargement » une seule fois aux lecteurs d'écran ; les blocs eux-mêmes sont masqués.
function Zone({ children }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement en cours</span>
      {children}
    </div>
  );
}

const Rond = ({ t = 44 }) => <Sq w={t} h={t} r="50%" style={{ flexShrink: 0 }} />;

function CartePub({ image = true }) {
  return (
    <div className="carte-pub" aria-hidden="true">
      <div className="entete-pub">
        <Rond />
        <div style={{ flex: 1 }}><Sq w="40%" h="0.9rem" /><Sq w="25%" h="0.7rem" style={{ marginTop: "0.4rem" }} /></div>
      </div>
      <Sq w="75%" h="1.2rem" style={{ marginBottom: "0.6rem" }} />
      <Sq h="0.85rem" style={{ marginBottom: "0.4rem" }} />
      <Sq w="90%" h="0.85rem" />
      {image && <Sq h="auto" r="0.75rem" style={{ aspectRatio: "4 / 3", margin: "0.75rem 0 0.5rem" }} />}
      <Sq h="2rem" style={{ marginTop: "0.5rem" }} />
    </div>
  );
}

function Lignes({ n = 4, bouton = true }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="ligne-membre">
          <Rond t={56} />
          <div className="infos"><Sq w="55%" h="1rem" /><Sq w="35%" h="0.75rem" style={{ marginTop: "0.4rem" }} /></div>
          {bouton && <div className="actions"><Sq h="2.4rem" r="0.75rem" /></div>}
        </div>
      ))}
    </div>
  );
}

function Grille({ n = 6 }) {
  return (
    <div className="grille" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="carte-membre" style={{ alignItems: "center" }}>
          <Rond t={72} /><Sq w="70%" h="1rem" /><Sq w="55%" h="0.75rem" /><Sq h="2.4rem" r="0.75rem" />
        </div>
      ))}
    </div>
  );
}

const Titre = ({ w = "35%" }) => <Sq w={w} h="2rem" style={{ marginBottom: "1rem" }} />;

// Pièces utilisables dans une page déjà affichée
export const SqCartes = ({ n = 2 }) => <Zone>{Array.from({ length: n }, (_, i) => <CartePub key={i} image={i % 2 === 0} />)}</Zone>;
export const SqListe = ({ n = 4 }) => <Zone><Lignes n={n} /></Zone>;
export const SqGrilleMembres = ({ n = 6 }) => <Zone><Grille n={n} /></Zone>;

// Pages entières
export function SqFil() {
  return (
    <Zone>
      <Titre w="20%" />
      <div className="carte" aria-hidden="true" style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <Rond />
        <div style={{ flex: 1 }}><Sq w="55%" h="1rem" /><Sq w="75%" h="0.75rem" style={{ marginTop: "0.4rem" }} /></div>
        <Rond t={42} />
      </div>
      <div className="bande" aria-hidden="true" style={{ margin: "1rem 0" }}>
        {Array.from({ length: 5 }, (_, i) => <div key={i} className="bulle"><Rond t={64} /><Sq w="4rem" h="0.7rem" /></div>)}
      </div>
      <CartePub /><CartePub image={false} />
    </Zone>
  );
}

export function SqAnnuaire() {
  return (
    <Zone>
      <Titre w="40%" />
      <Sq h="2.8rem" r="999px" style={{ marginBottom: "1rem" }} />
      <Grille />
    </Zone>
  );
}

export function SqAmis() {
  return (
    <Zone>
      <Titre w="25%" />
      <div className="puces" aria-hidden="true">{[5, 6, 5].map((w, i) => <Sq key={i} w={`${w}rem`} h="2rem" r="999px" />)}</div>
      <Lignes n={5} />
    </Zone>
  );
}

export function SqProfil() {
  return (
    <Zone>
      <div className="entete" aria-hidden="true"><Sq w="40%" h="2rem" /><Sq w="2.4rem" h="2.4rem" r="999px" /></div>
      <Sq h="auto" r="1.25rem" style={{ aspectRatio: "1 / 1", maxHeight: "20rem" }} />
      <Sq w="55%" h="1.6rem" style={{ margin: "0.75rem 0 0.4rem" }} />
      <Sq w="40%" h="0.9rem" />
      <Sq h="2.8rem" r="0.75rem" style={{ margin: "1rem 0" }} />
      <Lignes n={3} bouton={false} />
    </Zone>
  );
}

export function SqPublication() {
  return (
    <Zone>
      <Sq w="6rem" h="2rem" r="999px" style={{ marginBottom: "0.75rem" }} />
      <CartePub />
      <Sq w="45%" h="1.2rem" style={{ margin: "1rem 0" }} />
      <Lignes n={3} bouton={false} />
    </Zone>
  );
}

export function SqFormulaire({ champs = 4 }) {
  return (
    <Zone>
      <Titre w="50%" />
      <div className="carte" aria-hidden="true">
        {Array.from({ length: champs }, (_, i) => (
          <div key={i} style={{ marginBottom: "1rem" }}>
            <Sq w="30%" h="0.9rem" style={{ marginBottom: "0.4rem" }} />
            <Sq h="2.8rem" r="0.75rem" />
          </div>
        ))}
        <Sq h="2.8rem" r="0.75rem" />
      </div>
    </Zone>
  );
}

export function SqEditeur() {
  return (
    <Zone>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}><Sq w="50%" h="1.6rem" /></div>
      <Sq h="2.8rem" r="0.75rem" />
      <Sq h="12rem" r="1rem" style={{ margin: "0.75rem 0" }} />
      <Sq h="auto" r="1rem" style={{ aspectRatio: "16 / 6" }} />
    </Zone>
  );
}

export function SqPage() {
  return (
    <Zone>
      <Titre w="40%" />
      <CartePub image={false} /><CartePub image={false} />
    </Zone>
  );
}

export function SqCentree() {
  return <main className="page"><div className="boite"><SqFormulaire champs={2} /></div></main>;
}

// Choisit le bon squelette selon l'adresse : utilisé pendant le chargement d'une page.
export function SqRoute() {
  const { pathname: p } = useLocation();
  if (matchPath("/fil", p)) return <SqFil />;
  if (matchPath("/annuaire", p)) return <SqAnnuaire />;
  if (matchPath("/amis", p)) return <SqAmis />;
  if (matchPath("/profil/modifier", p)) return <SqFormulaire />;
  if (matchPath("/profil", p) || matchPath("/profil/:id", p)) return <SqProfil />;
  if (matchPath("/publications/:id", p)) return <SqPublication />;
  if (matchPath("/publier", p) || matchPath("/publier/:id", p)) return <SqEditeur />;
  return <SqPage />;
}
