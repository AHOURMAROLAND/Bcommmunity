export default function Bientot({ titre, jalon }) {
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>{titre}</h1>
      <p className="doux">Cette section arrive avec le jalon {jalon}.</p>
    </div>
  );
}
