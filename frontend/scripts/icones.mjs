import { mkdirSync } from "node:fs";
import sharp from "sharp";

const SRC = "assets/logo.png";
const blanc = { r: 255, g: 255, b: 255, alpha: 1 };
mkdirSync("public/icons", { recursive: true });
const rond = (n) => sharp(SRC).resize(n, n, { fit: "cover" });

await Promise.all([
  rond(192).png().toFile("public/icons/192.png"),
  rond(512).png().toFile("public/icons/512.png"),
  rond(180).flatten({ background: blanc }).png().toFile("public/icons/apple-touch-icon.png"),
  rond(32).png().toFile("public/icons/favicon-32.png"),
]);

// Version "maskable" : le logo n'occupe que 70 % du centre, pour que les formes rondes d'Android ne le coupent pas.
const logo = await sharp(SRC).resize(358, 358).toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: blanc } })
  .composite([{ input: logo, gravity: "center" }]).png().toFile("public/icons/maskable-512.png");
console.log("Icônes générées dans public/icons");
