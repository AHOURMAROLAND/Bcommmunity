import assert from "node:assert/strict";
import test from "node:test";
import { calculerParcours } from "./calculParcours.js";

const cycle = (nom, classes, anneeArrivee, extra = {}) => ({
  nom,
  classes,
  premiereClasseId: classes[0]?.id,
  derniereClasseId: classes.at(-1)?.id,
  anneeArrivee,
  ...extra,
});

test("chains school years and accounts for a repeated grade", () => {
  const result = calculerParcours([
    cycle("Primaire", [{ id: 1, nom: "CP1" }, { id: 2, nom: "CP2" }], 2020, { durees: { 1: 2 } }),
    cycle("Collège", [{ id: 3, nom: "6e" }], ""),
  ]);
  assert.deepEqual(
    result.map((item) => item.classes.map((classe) => [classe.anneeDebut, classe.anneeFin])),
    [[[2020, 2022], [2022, 2023]], [[2023, 2024]]],
  );
});

test("allows a skipped cycle before an independently dated cycle", () => {
  const result = calculerParcours([
    { nom: "Maternelle", saute: true, classes: [] },
    cycle("Primaire", [{ id: 1, nom: "CP1" }], 2018),
  ]);
  assert.equal(result[1].classes[0].anneeDebut, 2018);
});

test("uses a manually chosen arrival year for each cycle", () => {
  const result = calculerParcours([
    cycle("Primaire", [{ id: 1, nom: "CE1" }], 2012),
    cycle("Collège", [{ id: 2, nom: "6e" }], 2018),
  ]);
  assert.deepEqual(
    result.map((item) => item.classes[0].anneeDebut),
    [2012, 2018],
  );
});

test("only calculates classes selected when a grade is skipped", () => {
  const result = calculerParcours([
    {
      nom: "Primaire",
      classes: [
        { id: 1, nom: "CE1" },
        { id: 2, nom: "CE2" },
        { id: 3, nom: "CM1" },
        { id: 4, nom: "CM2" },
      ],
      classeIds: [1, 4],
      anneeArrivee: 2012,
    },
  ]);
  assert.deepEqual(
    result[0].classes.map(({ nom, anneeDebut, anneeFin }) => [nom, anneeDebut, anneeFin]),
    [["CE1", 2012, 2013], ["CM2", 2015, 2016]],
  );
});

test("counts a skipped grade as a year before the next selected grade", () => {
  const result = calculerParcours([
    {
    nom: "Primaire",
    classes: [
      { id: 1, nom: "CE2" },
      { id: 2, nom: "CM1" },
      { id: 3, nom: "CM2" },
    ],
    classeIds: [1, 3],
    anneeArrivee: 2013,
    },
  ]);
  assert.deepEqual(
    result[0].classes.map(({ nom, anneeDebut, anneeFin }) => [nom, anneeDebut, anneeFin]),
    [["CE2", 2013, 2014], ["CM2", 2015, 2016]],
  );
});

test("leaves an ongoing final class without an end year", () => {
  const result = calculerParcours([
    cycle("Lycée", [{ id: 1, nom: "Terminale" }], 2026),
  ], { toujoursALEcole: true });
  assert.equal(result[0].classes[0].anneeFin, null);
});
