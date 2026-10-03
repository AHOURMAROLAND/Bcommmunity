export const TYPES_IMAGE = ["image/jpeg", "image/png", "image/webp"];
export const POIDS_MAX = 12 * 1024 * 1024;
export const COTE_PUBLICATION = 2048;
export const COTE_AVATAR = 800;

// Safari ne sait pas encoder le WebP partout : on retombe alors sur le JPEG.
export const FORMAT_SORTIE = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  return c.toDataURL("image/webp").startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
})();

export function verifierFichier(f) {
  if (!TYPES_IMAGE.includes(f.type)) return "Formats acceptés : JPEG, PNG ou WebP.";
  if (f.size > POIDS_MAX) return "Image trop lourde (12 Mo maximum).";
  return null;
}

function charger(src) {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ko(new Error("Image illisible"));
    img.src = src;
  });
}

// Découpe la zone choisie à sa taille réelle (plafonnée), sans étape de réduction inutile.
export async function rogner(src, zone, coteMax) {
  const img = await charger(src);
  const echelle = Math.min(1, coteMax / Math.max(zone.width, zone.height));
  const w = Math.max(1, Math.round(zone.width * echelle));
  const h = Math.max(1, Math.round(zone.height * echelle));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (FORMAT_SORTIE === "image/jpeg") {
    ctx.fillStyle = "#fff"; // le JPEG n'a pas de transparence
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, zone.x, zone.y, zone.width, zone.height, 0, 0, w, h);
  const qualite = FORMAT_SORTIE === "image/webp" ? 0.92 : 0.95;
  return new Promise((ok, ko) =>
    canvas.toBlob((b) => (b ? ok(b) : ko(new Error("Export impossible"))), FORMAT_SORTIE, qualite));
}
