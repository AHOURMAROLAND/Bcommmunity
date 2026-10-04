export const RATIOS = [
  { id: "1-1",      label: "1:1 Carre",       valeur: 1 },
  { id: "4-5",      label: "4:5 Portrait",     valeur: 4 / 5 },
  { id: "9-16",     label: "9:16 Story",       valeur: 9 / 16 },
  { id: "16-9",     label: "16:9 Paysage",     valeur: 16 / 9 },
  { id: "libre",    label: "Libre",            valeur: null },
  { id: "original", label: "Original",         valeur: null },
];

export const RATIO_MIN = 0.49;
export const RATIO_MAX = 2.05;
const REF = 1000;

export const borner = (v, a, b) => Math.min(b, Math.max(a, v));
export const bornerRatio = (r) => borner(r, RATIO_MIN, RATIO_MAX);

export function ratioDe(e, src) {
  if (e.ratioId === "libre") return bornerRatio(e.ratioLibre);
  if (e.ratioId === "original") return bornerRatio(e.rot90 % 2 ? src.h / src.w : src.w / src.h);
  const r = RATIOS.find((x) => x.id === e.ratioId);
  return r?.valeur ?? 1;
}

/**
 * Calcule la geometrie du cadre de reference (W x H) et les parametres de
 * transformation pour couvrir entierement le cadre sans agrandissement.
 */
export function geometrie(e, src) {
  const ratio = ratioDe(e, src);
  const W = ratio >= 1 ? REF : REF * ratio;
  const H = ratio >= 1 ? REF / ratio : REF;
  const theta = ((e.rot90 * 90 + e.angle) * Math.PI) / 180;
  const c = Math.cos(theta), s = Math.sin(theta);

  // Boite englobante du cadre apres rotation inverse
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of [[W / 2, H / 2], [-W / 2, H / 2], [W / 2, -H / 2], [-W / 2, -H / 2]]) {
    const ax = c * x + s * y, ay = -s * x + c * y;
    minX = Math.min(minX, ax); maxX = Math.max(maxX, ax);
    minY = Math.min(minY, ay); maxY = Math.max(maxY, ay);
  }

  const sMin = Math.max((maxX - minX) / src.w, (maxY - minY) / src.h);
  const echelle = sMin * borner(e.zoom, 1, 8);

  return {
    ratio, W, H, theta, s: echelle, sMin,
    qx: borner(e.qx, maxX - (echelle * src.w) / 2, minX + (echelle * src.w) / 2),
    qy: borner(e.qy, maxY - (echelle * src.h) / 2, minY + (echelle * src.h) / 2),
  };
}

export function normaliser(e, src) {
  const g = geometrie(e, src);
  return { ...e, zoom: borner(e.zoom, 1, 8), qx: g.qx, qy: g.qy };
}

/**
 * Calcule la taille de sortie (pixels reels, sans agrandissement).
 * plancher=true garantit 200 px sur le petit cote (limite serveur).
 */
export function tailleSortie(g, cote, plancher = true) {
  const natif = Math.max(g.W, g.H) / g.s;
  const mini = plancher
    ? Math.ceil((200 * Math.max(g.W, g.H)) / Math.min(g.W, g.H))
    : 16;
  const long = Math.max(mini, Math.min(cote, Math.round(natif)));
  const k = long / Math.max(g.W, g.H);
  return {
    w: Math.max(1, Math.round(g.W * k)),
    h: Math.max(1, Math.round(g.H * k)),
    k,
  };
}
