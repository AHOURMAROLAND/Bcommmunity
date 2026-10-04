import "@fontsource/pacifico/400.css";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/caveat/700.css";
import "@fontsource/permanent-marker/400.css";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Crop, FlipHorizontal2, FlipVertical2,
  Pencil, RotateCw, SlidersHorizontal, Sparkles, Trash2, Type, Undo2, X,
} from "lucide-react";
import ChargementLong from "@/components/ChargementLong";
import { Sq } from "@/components/Squelettes";
import { COULEURS, POLICES, STICKERS, toucherCalque } from "./calques";
import { AJUST_NUL } from "./effets";
import { FILTRES } from "./filtres";
import { RATIOS, bornerRatio, geometrie, normaliser } from "./geometrie";
import { chargerSource, creerVignettes, exporter, rendre } from "./rendu";
import useGestes from "./useGestes";

const ETAT0 = {
  ratioId: "4-5", ratioLibre: 1,
  rot90: 0, angle: 0, flipH: false, flipV: false,
  zoom: 1, qx: 0, qy: 0,
  filtreId: "aucun", intensite: 100,
  ajust: { ...AJUST_NUL },
  calques: [],
};

const AJUSTEMENTS = [
  ["luminosite",  "Luminosite",         -100, 100],
  ["contraste",   "Contraste",          -100, 100],
  ["saturation",  "Saturation",         -100, 100],
  ["chaleur",     "Chaleur",            -100, 100],
  ["ombres",      "Ombres",             -100, 100],
  ["hautes",      "Hautes lumieres",    -100, 100],
  ["nettete",     "Nettete",               0, 100],
  ["flouFond",    "Flou d'arriere-plan",   0, 100],
];

let compteur = 0;
const nouvelId = () => `c${Date.now().toString(36)}${compteur++}`;

function Curseur({ label, valeur, min, max, pas = 1, onChange }) {
  const id = useId();
  return (
    <div className="curseur">
      <label htmlFor={id}>
        <span>{label}</span>
        <output>{Math.round(valeur * 100) / 100}</output>
      </label>
      <input
        id={id} type="range" min={min} max={max} step={pas} value={valeur}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(min < 0 ? 0 : min)}
      />
    </div>
  );
}

function Couleurs({ valeur, onChange }) {
  return (
    <div className="puces" role="group" aria-label="Couleur">
      {COULEURS.map((c) => (
        <button
          key={c} type="button" className="pastille-couleur"
          aria-label={`Couleur ${c}`} aria-pressed={valeur === c}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

export default function EditeurImage({ fichier, initial, onTerminer, onAnnuler }) {
  const [src, setSrc] = useState(null);
  const [erreur, setErreur] = useState("");
  const [etat, setEtat] = useState(initial ?? ETAT0);
  const [onglet, setOnglet] = useState("recadrer");
  const [mode, setMode] = useState("texte");
  const [selId, setSelId] = useState(null);
  const [crayon, setCrayon] = useState({ couleur: "#ffffff", epaisseur: 0.012 });
  const [grille, setGrille] = useState(true);
  const [zone, setZone] = useState({ w: 0, h: 0 });
  const [rapide, setRapide] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const scene = useRef(null), canvas = useRef(null);
  const minuterie = useRef(0), trait = useRef(null);
  const etatRef = useRef(etat), srcRef = useRef(null);
  etatRef.current = etat;
  srcRef.current = src;

  // Chargement de l'image source
  useEffect(() => {
    let ok = true;
    setErreur("");
    chargerSource(fichier)
      .then((s) => ok && setSrc(s))
      .catch(() => ok && setErreur("Impossible de lire cette image."));
    return () => { ok = false; };
  }, [fichier]);

  // Polices : redessiner quand chargees
  useEffect(() => {
    Promise.all(POLICES.map((p) => document.fonts.load(`${p.p} 32px ${p.f}`)))
      .then(() => setEtat((e) => ({ ...e })))
      .catch(() => {});
  }, []);

  // Observer la taille de la zone
  useEffect(() => {
    const o = new ResizeObserver(([e]) =>
      setZone({ w: e.contentRect.width, h: e.contentRect.height }));
    o.observe(scene.current);
    return () => o.disconnect();
  }, []);

  // Pendant un geste : apercu 640px ; au repos : 1080px
  const bouger = useCallback(() => {
    setRapide(true);
    clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => setRapide(false), 220);
  }, []);
  useEffect(() => () => clearTimeout(minuterie.current), []);

  const majGeo = useCallback((f) => {
    bouger();
    setEtat((e) => normaliser(
      { ...e, ...(typeof f === "function" ? f(e) : f) },
      srcRef.current,
    ));
  }, [bouger]);

  const majCalque = (id, patch) =>
    setEtat((e) => ({ ...e, calques: e.calques.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  const g = useMemo(() => (src ? geometrie(etat, src) : null), [src, etat]);
  const dw = g ? Math.min(Math.max(80, zone.w - 24), Math.max(80, zone.h - 24) * g.ratio) : 0;
  const dh = g ? dw / g.ratio : 0;

  // Rendu canvas (RAF)
  useEffect(() => {
    if (!src || !dw) return undefined;
    const id = requestAnimationFrame(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cote = Math.min(rapide ? 640 : 1080, Math.round(Math.max(dw, dh) * dpr));
      rendre(canvas.current, src, etat, {
        cote,
        selId: onglet === "creer" && mode !== "dessin" ? selId : null,
      });
    });
    return () => cancelAnimationFrame(id);
  }, [src, etat, dw, dh, rapide, onglet, mode, selId]);

  // Conversion deplacement ecran -> repere image
  const decaler = (v, dx, dy) => {
    const gg = geometrie(v, srcRef.current), k = gg.W / dw;
    const ux = dx * k * (v.flipH ? -1 : 1), uy = dy * k * (v.flipV ? -1 : 1);
    const c = Math.cos(gg.theta), s = Math.sin(gg.theta);
    return { qx: v.qx + c * ux + s * uy, qy: v.qy - s * ux + c * uy };
  };
  const rectCanvas = () => canvas.current.getBoundingClientRect();

  const gestes = useGestes({
    debut: ({ x, y }) => {
      if (onglet !== "creer") return;
      const r = rectCanvas();
      const px = (x - r.left) / r.width, py = (y - r.top) / r.height;
      if (mode === "dessin") {
        const id = nouvelId();
        trait.current = id;
        setEtat((e) => ({
          ...e,
          calques: [...e.calques, { id, type: "trait", couleur: crayon.couleur, epaisseur: crayon.epaisseur, points: [[px, py]] }],
        }));
      } else {
        const cv = canvas.current;
        setSelId(toucherCalque(cv.getContext("2d"), etatRef.current.calques, px * cv.width, py * cv.height, cv.width, cv.height));
      }
    },
    deplacer: ({ dx, dy, x, y }) => {
      if (onglet === "recadrer") { majGeo((v) => decaler(v, dx, dy)); return; }
      if (onglet !== "creer") return;
      const r = rectCanvas();
      if (mode === "dessin" && trait.current) {
        const p = [(x - r.left) / r.width, (y - r.top) / r.height];
        setEtat((v) => ({
          ...v,
          calques: v.calques.map((c) =>
            c.id === trait.current ? { ...c, points: [...c.points, p] } : c),
        }));
      } else if (selId) {
        setEtat((v) => ({
          ...v,
          calques: v.calques.map((c) =>
            c.id === selId ? { ...c, x: c.x + dx / r.width, y: c.y + dy / r.height } : c),
        }));
      }
    },
    pincer: ({ echelle, rotation, dx, dy }) => {
      if (onglet === "recadrer") {
        majGeo((v) => ({ zoom: v.zoom * echelle, ...decaler(v, dx, dy) }));
      } else if (onglet === "creer" && mode !== "dessin" && selId) {
        setEtat((v) => ({
          ...v,
          calques: v.calques.map((c) =>
            c.id === selId
              ? { ...c, taille: Math.min(0.6, Math.max(0.03, c.taille * echelle)), rot: c.rot + rotation }
              : c),
        }));
      }
    },
    fin: () => { trait.current = null; },
  });

  // Zoom molette (souris)
  useEffect(() => {
    const el = scene.current;
    const roue = (ev) => {
      if (onglet !== "recadrer") return;
      ev.preventDefault();
      majGeo((v) => ({ zoom: v.zoom * (ev.deltaY < 0 ? 1.08 : 0.93) }));
    };
    el.addEventListener("wheel", roue, { passive: false });
    return () => el.removeEventListener("wheel", roue);
  }, [onglet, majGeo]);

  // Poignee de coin pour le format libre
  const poignee = (e) => {
    const r = scene.current.getBoundingClientRect();
    const dx = Math.abs(e.clientX - (r.left + r.width / 2));
    const dy = Math.abs(e.clientY - (r.top + r.height / 2));
    if (dx > 8 && dy > 8) majGeo({ ratioLibre: bornerRatio(dx / dy), zoom: 1 });
  };

  // Vignettes filtres : recalcul seulement quand la geometrie change
  const vignettes = useMemo(
    () => (onglet === "filtres" && src ? creerVignettes(src, etat) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onglet, src, etat.rot90, etat.angle, etat.flipH, etat.flipV, etat.ratioId, etat.ratioLibre, etat.zoom, etat.qx, etat.qy],
  );

  const sel = etat.calques.find((c) => c.id === selId);

  const ajouter = (c) => {
    const id = nouvelId();
    setEtat((e) => ({ ...e, calques: [...e.calques, { id, x: 0.5, y: 0.5, rot: 0, ...c }] }));
    setSelId(id);
  };
  const supprimer = () => {
    setEtat((e) => ({ ...e, calques: e.calques.filter((c) => c.id !== selId) }));
    setSelId(null);
  };
  const annulerTrait = () =>
    setEtat((e) => {
      const i = e.calques.map((c) => c.type).lastIndexOf("trait");
      return i < 0 ? e : { ...e, calques: e.calques.filter((_, j) => j !== i) };
    });

  async function terminer() {
    if (envoi || !src) return;
    setEnvoi(true);
    try {
      await document.fonts.ready;
      onTerminer(await exporter(src, etatRef.current), etatRef.current);
    } catch {
      setErreur("Impossible de preparer l'image. Essayez avec une autre photo.");
      setEnvoi(false);
    }
  }

  const actifGestes = onglet === "recadrer" || onglet === "creer";
  const ONGLETS_ED = [
    ["recadrer", "Recadrer",  Crop],
    ["filtres",  "Filtres",   Sparkles],
    ["ajuster",  "Ajuster",   SlidersHorizontal],
    ["creer",    "Creer",     Type],
  ];

  return (
    <div className="editeur" role="dialog" aria-modal="true" aria-label="Modifier l'image">
      <header className="editeur-tete">
        <button type="button" className="puce" onClick={onAnnuler}>
          <X size={18} /> Annuler
        </button>
        <strong>Modifier l'image</strong>
        <button type="button" className="puce puce-plein" onClick={terminer} disabled={!src || envoi}>
          Terminer
        </button>
      </header>

      <div className="editeur-scene" ref={scene} {...(actifGestes ? gestes : {})}>
        {!src ? (
          erreur
            ? <p role="alert" className="erreur">{erreur}</p>
            : <Sq w="70%" h="60%" r="1rem" />
        ) : (
          <div className="cadre" style={{ width: dw, height: dh }}>
            <canvas ref={canvas} style={{ width: "100%", height: "100%" }} aria-label="Apercu de l'image" />
            {onglet === "recadrer" && grille && <div className="tiers" aria-hidden="true" />}
            {onglet === "recadrer" && etat.ratioId === "libre" &&
              ["hg", "hd", "bg", "bd"].map((p) => (
                <span key={p} className={`poignee ${p}`} role="presentation"
                  onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); }}
                  onPointerMove={(e) => e.buttons && poignee(e)}
                />
              ))}
          </div>
        )}
      </div>

      {erreur && src && <p role="alert" className="erreur" style={{ padding: "0 1rem" }}>{erreur}</p>}

      <div className="editeur-panneau">
        {/* ---- RECADRER ---- */}
        {onglet === "recadrer" && (
          <>
            <div className="puces" role="group" aria-label="Format">
              {RATIOS.map((r) => (
                <button key={r.id} type="button" className="puce" aria-pressed={etat.ratioId === r.id}
                  onClick={() => majGeo({ ratioId: r.id, ratioLibre: r.id === "libre" ? g.ratio : etat.ratioLibre, zoom: 1, qx: 0, qy: 0 })}>
                  {r.label}
                </button>
              ))}
            </div>
            <Curseur label="Redressement (degres)" valeur={etat.angle} min={-45} max={45} pas={0.5}
              onChange={(angle) => majGeo({ angle })} />
            <Curseur label="Zoom" valeur={etat.zoom} min={1} max={4} pas={0.01}
              onChange={(zoom) => majGeo({ zoom })} />
            <div className="puces">
              <button type="button" className="puce"
                onClick={() => majGeo((v) => ({ rot90: (v.rot90 + 1) % 4, qx: 0, qy: 0 }))}>
                <RotateCw size={16} /> Rotation 90
              </button>
              <button type="button" className="puce"
                onClick={() => majGeo((v) => ({ flipH: !v.flipH }))}>
                <FlipHorizontal2 size={16} /> Miroir H
              </button>
              <button type="button" className="puce"
                onClick={() => majGeo((v) => ({ flipV: !v.flipV }))}>
                <FlipVertical2 size={16} /> Miroir V
              </button>
              <button type="button" className="puce" aria-pressed={grille}
                onClick={() => setGrille((v) => !v)}>
                Grille des tiers
              </button>
              <button type="button" className="puce"
                onClick={() => majGeo({ rot90: 0, angle: 0, flipH: false, flipV: false, zoom: 1, qx: 0, qy: 0 })}>
                Reinitialiser
              </button>
            </div>
            <p className="doux" style={{ fontSize: "0.8rem", margin: 0 }}>
              Glissez pour deplacer, pincez a deux doigts pour zoomer.
            </p>
          </>
        )}

        {/* ---- FILTRES ---- */}
        {onglet === "filtres" && (
          <>
            <div className="vignettes">
              {vignettes.map((v) => (
                <button key={v.id} type="button" className="vignette-filtre" aria-pressed={etat.filtreId === v.id}
                  onClick={() => setEtat((e) => ({ ...e, filtreId: v.id }))}>
                  <img src={v.url} alt="" />
                  <span>{v.label}</span>
                </button>
              ))}
            </div>
            <Curseur label="Intensite du filtre" valeur={etat.intensite} min={0} max={100}
              onChange={(intensite) => { bouger(); setEtat((e) => ({ ...e, intensite })); }} />
          </>
        )}

        {/* ---- AJUSTER ---- */}
        {onglet === "ajuster" && (
          <>
            {AJUSTEMENTS.map(([cle, label, min, max]) => (
              <Curseur key={cle} label={label} valeur={etat.ajust[cle]} min={min} max={max}
                onChange={(v) => { bouger(); setEtat((e) => ({ ...e, ajust: { ...e.ajust, [cle]: v } })); }} />
            ))}
            <p className="doux" style={{ fontSize: "0.8rem", margin: 0 }}>
              Le flou d'arriere-plan garde le centre net. Double-clic sur un curseur pour le remettre a zero.
            </p>
            <button type="button" className="puce"
              onClick={() => setEtat((e) => ({ ...e, ajust: { ...AJUST_NUL } }))}>
              Reinitialiser les reglages
            </button>
          </>
        )}

        {/* ---- CREER (texte / sticker / dessin) ---- */}
        {onglet === "creer" && (
          <>
            <div className="puces" role="group" aria-label="Outil">
              {[["texte", "Texte", Type], ["sticker", "Sticker", Sparkles], ["dessin", "Dessin", Pencil]].map(
                ([id, l, Icone]) => (
                  <button key={id} type="button" className="puce" aria-pressed={mode === id}
                    onClick={() => { setMode(id); setSelId(null); }}>
                    <Icone size={16} /> {l}
                  </button>
                ),
              )}
            </div>

            {mode === "texte" && (
              sel?.type === "texte" ? (
                <>
                  <textarea className="champ" rows={2} maxLength={120} aria-label="Texte"
                    value={sel.texte}
                    onChange={(e) => majCalque(sel.id, { texte: e.target.value })} />
                  <div className="puces" role="group" aria-label="Police">
                    {POLICES.map((p) => (
                      <button key={p.id} type="button" className="puce" aria-pressed={sel.police === p.id}
                        style={{ fontFamily: `${p.f}, sans-serif`, fontWeight: p.p }}
                        onClick={() => majCalque(sel.id, { police: p.id })}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <Couleurs valeur={sel.couleur} onChange={(couleur) => majCalque(sel.id, { couleur })} />
                  <Curseur label="Taille" valeur={sel.taille} min={0.03} max={0.25} pas={0.005}
                    onChange={(taille) => majCalque(sel.id, { taille })} />
                  <div className="puces">
                    <button type="button" className="puce" aria-pressed={sel.fond}
                      onClick={() => majCalque(sel.id, { fond: !sel.fond })}>
                      Fond derriere le texte
                    </button>
                    <button type="button" className="puce" onClick={supprimer}>
                      <Trash2 size={16} /> Supprimer
                    </button>
                  </div>
                </>
              ) : (
                <button type="button" className="btn"
                  onClick={() => ajouter({ type: "texte", texte: "Votre texte", police: "moderne", couleur: "#ffffff", taille: 0.09, fond: false })}>
                  Ajouter un texte
                </button>
              )
            )}

            {mode === "sticker" && (
              <>
                <div className="grille-stickers">
                  {STICKERS.map((s) => (
                    <button key={s.id} type="button" aria-label={s.label}
                      onClick={() => ajouter({ type: "sticker", forme: s.id, couleur: "#ffffff", taille: 0.2 })}>
                      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
                        <path d={s.d} fill="currentColor" fillRule="evenodd" />
                      </svg>
                    </button>
                  ))}
                </div>
                {sel?.type === "sticker" && (
                  <>
                    <Couleurs valeur={sel.couleur} onChange={(couleur) => majCalque(sel.id, { couleur })} />
                    <Curseur label="Taille" valeur={sel.taille} min={0.05} max={0.6} pas={0.005}
                      onChange={(taille) => majCalque(sel.id, { taille })} />
                    <button type="button" className="puce" onClick={supprimer}>
                      <Trash2 size={16} /> Supprimer
                    </button>
                  </>
                )}
              </>
            )}

            {mode === "dessin" && (
              <>
                <Couleurs valeur={crayon.couleur} onChange={(couleur) => setCrayon((c) => ({ ...c, couleur }))} />
                <Curseur label="Epaisseur" valeur={crayon.epaisseur} min={0.004} max={0.04} pas={0.002}
                  onChange={(epaisseur) => setCrayon((c) => ({ ...c, epaisseur }))} />
                <div className="puces">
                  <button type="button" className="puce" onClick={annulerTrait}>
                    <Undo2 size={16} /> Annuler le dernier trait
                  </button>
                  <button type="button" className="puce"
                    onClick={() => setEtat((e) => ({ ...e, calques: e.calques.filter((c) => c.type !== "trait") }))}>
                    Tout effacer
                  </button>
                </div>
              </>
            )}

            {mode !== "dessin" && (
              <p className="doux" style={{ fontSize: "0.8rem", margin: 0 }}>
                Touchez un element pour le selectionner. Un doigt le deplace, deux doigts le agrandissent et le tournent.
              </p>
            )}
          </>
        )}
      </div>

      <nav className="editeur-onglets" role="tablist" aria-label="Outils">
        {ONGLETS_ED.map(([id, l, Icone]) => (
          <button key={id} type="button" role="tab" aria-selected={onglet === id}
            onClick={() => { setOnglet(id); setSelId(null); }}>
            <Icone size={20} aria-hidden="true" />
            {l}
          </button>
        ))}
      </nav>

      <ChargementLong actif={envoi} delai={600} label="Preparation de l'image en HD..." />
    </div>
  );
}
