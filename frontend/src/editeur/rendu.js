import { FORMAT_SORTIE } from "../utils/image";
import { dessinerCalques } from "./calques";
import { AJUST_NUL, aDesEffets, appliquerEffets, preparerFlous } from "./effets";
import { FILTRES } from "./filtres";
import { geometrie, tailleSortie } from "./geometrie";

function reduire(source, largeur, hauteur, cote) {
  const e = Math.min(1, cote / Math.max(largeur, hauteur));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(largeur * e));
  c.height = Math.max(1, Math.round(hauteur * e));
  const x = c.getContext("2d");
  x.imageSmoothingQuality = "high";
  x.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

/**
 * Lit l'image avec son orientation EXIF.
 * Retourne { img (3072px), mini (1400px), w, h }.
 */
export async function chargerSource(fichier) {
  let img, url;
  try {
    img = await createImageBitmap(fichier, { imageOrientation: "from-image" });
  } catch {
    url = URL.createObjectURL(fichier);
    img = new Image();
    img.src = url;
    await img.decode();
  }
  try {
    const W = img.naturalWidth ?? img.width;
    const H = img.naturalHeight ?? img.height;
    const grand = reduire(img, W, H, 3072);
    return { img: grand, mini: reduire(grand, grand.width, grand.height, 1400), w: grand.width, h: grand.height };
  } finally {
    img.close?.();
    if (url) URL.revokeObjectURL(url);
  }
}

function peindre(ctx, bm, src, g, e, k) {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.translate((g.W * k) / 2, (g.H * k) / 2);
  ctx.scale(e.flipH ? -1 : 1, e.flipV ? -1 : 1);
  ctx.rotate(g.theta);
  ctx.translate(g.qx * k, g.qy * k);
  const f = (g.s * k * src.w) / bm.width;
  ctx.scale(f, f);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bm, -bm.width / 2, -bm.height / 2);
  ctx.restore();
}

export function paramsEffets(e) {
  const f = FILTRES.find((x) => x.id === e.filtreId);
  return {
    filtre: f && f.id !== "aucun" ? f.p : null,
    intensite: e.intensite / 100,
    ajust: e.ajust,
  };
}

// Cache: canvas -> { cle, base (pixels), cleFlous, flous }
const caches = new WeakMap();

export function rendre(canvas, src, e, { cote, selId = null, mini = true, plancher = true }) {
  const g = geometrie(e, src);
  const t = tailleSortie(g, cote, plancher);
  if (canvas.width !== t.w || canvas.height !== t.h) {
    canvas.width = t.w;
    canvas.height = t.h;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const cleBase = [t.w, t.h, e.rot90, e.angle, e.flipH, e.flipV, e.ratioId, e.ratioLibre, e.zoom, g.qx, g.qy, mini].join("|");

  let c = caches.get(canvas);
  if (!c || c.cle !== cleBase) {
    peindre(ctx, mini ? src.mini : src.img, src, g, e, t.k);
    c = { cle: cleBase, base: ctx.getImageData(0, 0, t.w, t.h).data, cleFlous: "", flous: null };
    caches.set(canvas, c);
  }

  const img = new ImageData(new Uint8ClampedArray(c.base), t.w, t.h);
  const p = paramsEffets(e);
  if (aDesEffets(p)) {
    const cleFlous = `${e.ajust.nettete}|${e.ajust.flouFond}`;
    if (c.cleFlous !== cleFlous) {
      c.flous = preparerFlous(c.base, t.w, t.h, e.ajust);
      c.cleFlous = cleFlous;
    }
    appliquerEffets(img, p, c.flous);
  }
  ctx.putImageData(img, 0, 0);
  dessinerCalques(ctx, t.w, t.h, e.calques, selId);
  return { g, t };
}

/** Cree les vignettes de tous les filtres (112px, sans calques). */
export function creerVignettes(src, e) {
  const c = document.createElement("canvas");
  rendre(c, src, { ...e, filtreId: "aucun", ajust: { ...AJUST_NUL }, calques: [] }, { cote: 112, plancher: false });
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const base = ctx.getImageData(0, 0, c.width, c.height).data;
  return FILTRES.map((f) => {
    const img = new ImageData(new Uint8ClampedArray(base), c.width, c.height);
    if (f.id !== "aucun") {
      appliquerEffets(img, { filtre: f.p, intensite: 1, ajust: { ...AJUST_NUL } });
    }
    ctx.putImageData(img, 0, 0);
    return { id: f.id, label: f.label, url: c.toDataURL("image/jpeg", 0.7) };
  });
}

/** Export final a 2048px max, qualite maximale, sans mini. */
export function exporter(src, e) {
  const canvas = document.createElement("canvas");
  rendre(canvas, src, e, { cote: 2048, mini: false });
  const ext = FORMAT_SORTIE === "image/webp" ? "webp" : "jpg";
  return new Promise((ok, ko) =>
    canvas.toBlob(
      (b) => (b ? ok(new File([b], `image.${ext}`, { type: b.type })) : ko(new Error("export"))),
      FORMAT_SORTIE,
      FORMAT_SORTIE === "image/webp" ? 0.92 : 0.95,
    ));
}
