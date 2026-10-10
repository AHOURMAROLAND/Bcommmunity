import { fileURLToPath, URL } from "node:url";
import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const chemin = (p) => fileURLToPath(new URL(p, import.meta.url));
const dossierFrontend = chemin("./");
const dossierProjet = chemin("../");
const versionPaquet = JSON.parse(readFileSync(chemin("./package.json"), "utf8")).version;
const [versionMajeure, versionMineure = "0"] = versionPaquet.split(".");
const versionAffichee = `${versionMajeure}.${versionMineure.padStart(2, "0")}`;
const versionCode = versionPaquet.split(".").reduce(
  (code, partie, index) => code + Number(partie) * [10_000, 100, 1][index],
  0,
);

export default defineConfig(({ mode }) => {
  const natif = mode === "native"; // l'application Android embarque déjà tout : pas de service worker
  const prefixes = ["VITE_", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_IDS", "SITE_URL"];
  const variables = {
    ...loadEnv(mode, dossierProjet, prefixes),
    ...loadEnv(mode, dossierFrontend, prefixes),
  };
  const googleClientId = variables.VITE_GOOGLE_CLIENT_ID
    || variables.GOOGLE_CLIENT_ID
    || variables.GOOGLE_CLIENT_IDS?.split(",")[0]?.trim()
    || "";
  const apiUrl = variables.VITE_API_URL?.trim() || "";
  const manifestUrl = variables.VITE_ANDROID_UPDATE_MANIFEST_URL?.trim() || "";
  if (natif) {
    let api;
    let manifeste;
    try {
      api = new URL(apiUrl);
      manifeste = new URL(manifestUrl);
    } catch {
      throw new Error(
        "Build Android impossible : définissez VITE_API_URL et VITE_ANDROID_UPDATE_MANIFEST_URL dans frontend/.env.native.",
      );
    }
    if (
      api.protocol !== "https:"
      || !api.pathname.replace(/\/+$/, "").endsWith("/api")
      || api.hostname.endsWith(".example")
      || manifeste.protocol !== "https:"
    ) {
      throw new Error(
        "Build Android impossible : VITE_API_URL doit être une URL HTTPS réelle finissant par /api, et le manifeste R2 doit utiliser HTTPS.",
      );
    }
  }
  const variablesVite = Object.fromEntries(
    Object.entries(variables)
      .filter(([nom]) => nom.startsWith("VITE_"))
      .map(([nom, valeur]) => [`import.meta.env.${nom}`, JSON.stringify(valeur)]),
  );
  return {
    envDir: dossierProjet,
    define: {
      ...variablesVite,
      __APP_VERSION__: JSON.stringify(versionAffichee),
      __APP_VERSION_CODE__: JSON.stringify(versionCode),
      "import.meta.env.VITE_API_URL": JSON.stringify(apiUrl),
      "import.meta.env.VITE_ANDROID_UPDATE_MANIFEST_URL": JSON.stringify(manifestUrl),
      "import.meta.env.VITE_GOOGLE_CLIENT_ID": JSON.stringify(googleClientId),
      "import.meta.env.VITE_SITE_URL": JSON.stringify(variables.VITE_SITE_URL || variables.SITE_URL || ""),
    },
    plugins: [react(), tailwindcss(), VitePWA({
      disable: natif,
      strategies: "injectManifest", srcDir: "src", filename: "sw.js",
      registerType: "prompt", injectRegister: false,
      manifest: {
        id: "/", name: "Bakhita Community", short_name: "Bakhita",
        description: "Le réseau des élèves et anciens élèves de l'école.",
        lang: "fr", start_url: "/", scope: "/", display: "standalone", orientation: "portrait",
        background_color: "#ffffff", theme_color: "#0b1f4b", categories: ["social", "education"],
        icons: [
          { src: "/icons/192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Écrire une publication", url: "/publier", icons: [{ src: "/icons/192.png", sizes: "192x192" }] },
          { name: "Messages", url: "/messages", icons: [{ src: "/icons/192.png", sizes: "192x192" }] },
        ],
      },
      injectManifest: {
        globPatterns: [
          "**/*.{js,css,html}",
          "icons/*.png",
          "logos/*.jpeg",
          "**/*-latin-[0-9]*-normal*.woff2",
        ],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    })],
    resolve: {
      alias: {
        "@": chemin("./src"),
        ...(natif ? { "virtual:pwa-register/react": chemin("./src/stubs/pwa-register.js") } : {}),
      },
    },
    server: {
      proxy: {
        "/api": "http://127.0.0.1:8000",
        "/media": "http://127.0.0.1:8000",
        "/ws": { target: "ws://127.0.0.1:8000", ws: true },
        "^/p/\\d+": "http://127.0.0.1:8000",
        "^/profil-partage/\\d+": "http://127.0.0.1:8000",
      },
    },
  };
});
