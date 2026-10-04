const lisser = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function passeH(s, d, w, h, r) {
  const n = 2 * r + 1, max = w - 1;
  for (let y = 0; y < h; y++) {
    const l = y * w * 4;
    for (let c = 0; c < 3; c++) {
      let somme = 0;
      for (let i = -r; i <= r; i++)
        somme += s[l + (i < 0 ? 0 : i > max ? max : i) * 4 + c];
      for (let x = 0; x < w; x++) {
        d[l + x * 4 + c] = somme / n;
        const plus = x + r + 1 > max ? max : x + r + 1;
        const moins = x - r < 0 ? 0 : x - r;
        somme += s[l + plus * 4 + c] - s[l + moins * 4 + c];
      }
    }
  }
}

function passeV(s, d, w, h, r) {
  const n = 2 * r + 1, max = h - 1, pas = w * 4;
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      const col = x * 4 + c;
      let somme = 0;
      for (let i = -r; i <= r; i++)
        somme += s[col + (i < 0 ? 0 : i > max ? max : i) * pas];
      for (let y = 0; y < h; y++) {
        d[col + y * pas] = somme / n;
        const plus = y + r + 1 > max ? max : y + r + 1;
        const moins = y - r < 0 ? 0 : y - r;
        somme += s[col + plus * pas] - s[col + moins * pas];
      }
    }
  }
}

/** Flou de boite separable : cout independant du rayon. */
export function flou(src, w, h, rayon, passes = 2) {
  const r = Math.max(1, Math.round(rayon));
  const a = new Uint8ClampedArray(src);
  const b = new Uint8ClampedArray(src.length);
  for (let p = 0; p < passes; p++) {
    passeH(a, b, w, h, r);
    passeV(b, a, w, h, r);
  }
  return a;
}

export const AJUST_NUL = {
  luminosite: 0, contraste: 0, saturation: 0, chaleur: 0,
  ombres: 0, hautes: 0, nettete: 0, flouFond: 0,
};

export const aDesEffets = (p) =>
  (p.filtre && p.intensite > 0) ||
  Object.values(p.ajust).some((v) => v !== 0);

/** Les flous ne dependent que de l'image de base : calcules une fois, reutilises. */
export function preparerFlous(data, w, h, a) {
  const long = Math.max(w, h);
  return {
    petit: a.nettete > 0 ? flou(data, w, h, long * 0.002, 1) : null,
    grand: a.flouFond > 0 ? flou(data, w, h, 1 + long * 0.03 * (a.flouFond / 100), 3) : null,
  };
}

/**
 * Applique tous les effets pixel par pixel sur img (ImageData).
 * p = { filtre (parametres ou null), intensite 0..1, ajust }
 * flous = resultat de preparerFlous (optionnel, calcule si absent)
 */
export function appliquerEffets(img, p, flous = null) {
  const { data, width: w, height: h } = img;
  const a = p.ajust, F = p.filtre, I = F ? p.intensite : 0;
  const net = a.nettete / 100, fl = a.flouFond / 100;
  const { petit, grand } = flous ?? preparerFlous(data, w, h, a);
  const lum = a.luminosite * 0.8;
  const ct = 1 + a.contraste / 100;
  const sa = 1 + a.saturation / 100;
  const ch = a.chaleur * 0.3;
  const om = a.ombres * 0.6;
  const hl = a.hautes * 0.6;
  const couleurs = lum !== 0 || ct !== 1 || sa !== 1 || ch !== 0 || om !== 0 || hl !== 0;
  const cx = w / 2, cy = h / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = data[i], g = data[i + 1], b = data[i + 2];

      // Nettete : masque flou
      if (petit) {
        r += net * 1.5 * (r - petit[i]);
        g += net * 1.5 * (g - petit[i + 1]);
        b += net * 1.5 * (b - petit[i + 2]);
      }

      // Flou d'arriere-plan radial : centre net, bords floutes
      if (grand) {
        const dx = (x - cx) / cx, dy = (y - cy) / cy;
        const m = lisser(0.35, 1.0, Math.sqrt(dx * dx + dy * dy));
        r += (grand[i] - r) * m;
        g += (grand[i + 1] - g) * m;
        b += (grand[i + 2] - b) * m;
      }

      // Filtre predefini avec intensite reglable
      if (I > 0) {
        let fr = r, fg = g, fb = b;
        if (F.gris) {
          const l = 0.299 * fr + 0.587 * fg + 0.114 * fb;
          fr = fg = fb = l;
        }
        if (F.sepia) {
          const sr = 0.393 * fr + 0.769 * fg + 0.189 * fb;
          const sg = 0.349 * fr + 0.686 * fg + 0.168 * fb;
          const sb = 0.272 * fr + 0.534 * fg + 0.131 * fb;
          fr += (sr - fr) * F.sepia;
          fg += (sg - fg) * F.sepia;
          fb += (sb - fb) * F.sepia;
        }
        if (F.sat) {
          const k = 1 + F.sat / 100;
          const l = 0.299 * fr + 0.587 * fg + 0.114 * fb;
          fr = l + (fr - l) * k;
          fg = l + (fg - l) * k;
          fb = l + (fb - l) * k;
        }
        const c2 = 1 + F.contraste / 100;
        const add = F.lum * 0.8;
        const lift = F.fondu * 0.4;
        fr = (fr + add + F.chaud * 0.3 + F.teinte[0] - 128) * c2 + 128;
        fg = (fg + add + F.teinte[1] - 128) * c2 + 128;
        fb = (fb + add - F.chaud * 0.3 + F.teinte[2] - 128) * c2 + 128;
        if (lift) {
          fr = lift + fr * (1 - lift / 255);
          fg = lift + fg * (1 - lift / 255);
          fb = lift + fb * (1 - lift / 255);
        }
        r += (fr - r) * I;
        g += (fg - g) * I;
        b += (fb - b) * I;
      }

      // Ajustements couleurs
      if (couleurs) {
        const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const dl = lum + om * (1 - L) * (1 - L) + hl * L * L;
        r += dl + ch; g += dl; b += dl - ch;
        r = (r - 128) * ct + 128;
        g = (g - 128) * ct + 128;
        b = (b - 128) * ct + 128;
        const l2 = 0.299 * r + 0.587 * g + 0.114 * b;
        r = l2 + (r - l2) * sa;
        g = l2 + (g - l2) * sa;
        b = l2 + (b - l2) * sa;
      }

      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
  }
  return img;
}
