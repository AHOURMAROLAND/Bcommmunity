const F = (id, label, p) => ({
  id,
  label,
  p: {
    lum: 0, contraste: 0, sat: 0, chaud: 0, fondu: 0,
    gris: false, sepia: 0, teinte: [0, 0, 0],
    ...p,
  },
});

export const FILTRES = [
  F("aucun",   "Original",      {}),
  F("naturel", "Naturel",       { contraste: 6, sat: 8 }),
  F("vivid",   "Vivid",         { sat: 45, contraste: 15 }),
  F("nb",      "Noir et blanc", { gris: true, contraste: 12 }),
  F("vintage", "Vintage",       { sepia: 0.35, fondu: 35, chaud: 20, sat: -15, contraste: -5 }),
  F("chaud",   "Chaud",         { chaud: 40, sat: 10, teinte: [4, 0, -4] }),
  F("froid",   "Froid",         { chaud: -40, sat: 5, teinte: [-4, 0, 4] }),
  F("drama",   "Dramatique",    { contraste: 38, sat: -12, lum: -8 }),
  F("fondu",   "Fondu",         { fondu: 45, contraste: -12, sat: -20 }),
  F("sepia",   "Sepia",         { sepia: 1, contraste: 6 }),
  F("eclat",   "Eclat",         { lum: 12, contraste: 8, sat: 12, chaud: 6 }),
];
