export const POLICES = [
  { id: "moderne",   label: "Moderne",   f: '"Quicksand"',          p: 700 },
  { id: "script",    label: "Script",    f: '"Pacifico"',            p: 400 },
  { id: "affiche",   label: "Affiche",   f: '"Bebas Neue"',          p: 400 },
  { id: "classique", label: "Classique", f: '"Playfair Display"',    p: 700 },
  { id: "main",      label: "Manuscrit", f: '"Caveat"',              p: 700 },
  { id: "marqueur",  label: "Marqueur",  f: '"Permanent Marker"',    p: 400 },
];

export const COULEURS = [
  "#ffffff", "#0b1f4b", "#000000", "#e5484d",
  "#f5a623", "#2bb673", "#4f7fe0", "#a855f7",
];

export const STICKERS = [
  { id: "coeur",   label: "Coeur",   d: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" },
  { id: "etoile",  label: "Etoile",  d: "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" },
  { id: "eclair",  label: "Eclair",  d: "M7 2v11h3v9l7-12h-4l4-8z" },
  { id: "toque",   label: "Diplome", d: "M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z" },
  { id: "soleil",  label: "Soleil",  d: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM11 1h2v3h-2zM11 20h2v3h-2zM1 11h3v2H1zM20 11h3v2h-3zM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4zM19.8 5.6l-1.4-1.4-2.1 2.1 1.4 1.4zM4.2 18.4l1.4 1.4 2.1-2.1-1.4-1.4zM19.8 18.4l-1.4 1.4-2.1-2.1 1.4-1.4z" },
  { id: "pin",     label: "Lieu",    d: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" },
  { id: "bulle",   label: "Bulle",   d: "M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" },
  { id: "fleche",  label: "Fleche",  d: "M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" },
];

// Cache des Path2D par sticker id
const chemins = new Map();
const chemin = (id) => {
  if (!chemins.has(id)) {
    chemins.set(id, new Path2D(STICKERS.find((s) => s.id === id).d));
  }
  return chemins.get(id);
};

const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

const police = (c, W) => {
  const p = POLICES.find((x) => x.id === c.police);
  return `${p.p} ${Math.round(c.taille * W)}px ${p.f}, sans-serif`;
};

export function mesurer(ctx, c, W) {
  if (c.type === "sticker") {
    const t = c.taille * W;
    return { hw: t / 2, hh: t / 2 };
  }
  const px = c.taille * W;
  ctx.font = police(c, W);
  const lignes = c.texte.split("\n");
  const largeur = Math.max(...lignes.map((l) => ctx.measureText(l || " ").width));
  return {
    hw: largeur / 2 + px * 0.25,
    hh: (lignes.length * px * 1.2) / 2 + px * 0.12,
    lignes,
    px,
  };
}

function rect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function dessinerCalques(ctx, W, H, calques, selId = null) {
  for (const c of calques) {
    if (c.type === "trait") {
      ctx.save();
      ctx.lineCap = ctx.lineJoin = "round";
      ctx.strokeStyle = ctx.fillStyle = c.couleur;
      ctx.lineWidth = c.epaisseur * W;
      const pts = c.points;
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0][0] * W, pts[0][1] * H, ctx.lineWidth / 2, 0, 7);
        ctx.fill();
      } else {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H)));
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }

    ctx.save();
    ctx.translate(c.x * W, c.y * H);
    ctx.rotate(c.rot);

    if (c.type === "texte") {
      const m = mesurer(ctx, c, W);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = police(c, W);
      if (c.fond) {
        ctx.fillStyle = luminance(c.couleur) > 0.6
          ? "rgba(0,0,0,0.6)"
          : "rgba(255,255,255,0.85)";
        rect(ctx, -m.hw, -m.hh, m.hw * 2, m.hh * 2, m.px * 0.25);
        ctx.fill();
      } else {
        ctx.shadowColor = "rgba(0,0,0,0.4)";
        ctx.shadowBlur = m.px * 0.12;
        ctx.shadowOffsetY = m.px * 0.03;
      }
      ctx.fillStyle = c.couleur;
      m.lignes.forEach((l, i) =>
        ctx.fillText(l, 0, (i - (m.lignes.length - 1) / 2) * m.px * 1.2));
    } else {
      const t = (c.taille * W) / 24;
      ctx.scale(t, t);
      ctx.translate(-12, -12);
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 3;
      ctx.fillStyle = c.couleur;
      ctx.fill(chemin(c.forme), "evenodd");
    }
    ctx.restore();
  }

  // Cadre de selection (apercu seulement, pas dans l'export)
  const sel = selId && calques.find((c) => c.id === selId);
  if (sel && sel.type !== "trait") {
    const m = mesurer(ctx, sel, W);
    ctx.save();
    ctx.translate(sel.x * W, sel.y * H);
    ctx.rotate(sel.rot);
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#fff";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 3;
    ctx.strokeRect(-m.hw, -m.hh, m.hw * 2, m.hh * 2);
    ctx.restore();
  }
}

export function toucherCalque(ctx, calques, px, py, W, H) {
  for (let i = calques.length - 1; i >= 0; i--) {
    const c = calques[i];
    if (c.type === "trait") continue;
    const m = mesurer(ctx, c, W);
    const dx = px - c.x * W, dy = py - c.y * H;
    const cs = Math.cos(-c.rot), sn = Math.sin(-c.rot);
    if (
      Math.abs(dx * cs - dy * sn) <= m.hw + 10 &&
      Math.abs(dx * sn + dy * cs) <= m.hh + 10
    ) return c.id;
  }
  return null;
}
