import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const chemin = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ mode }) => {
  const natif = mode === "native"; // l'application Android embarque déjà tout : pas de service worker
  const variables = loadEnv(mode, "..", ["VITE_", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_IDS", "SITE_URL"]);
  if (process.env.VERCEL && mode === "production") {
    for (const nom of ["VITE_API_URL", "VITE_WS_URL", "VITE_SITE_URL"]) {
      if (!variables[nom]) throw new Error(`La variable ${nom} doit être configurée dans Vercel.`);
    }
    const apiUrl = new URL(variables.VITE_API_URL);
    const wsUrl = new URL(variables.VITE_WS_URL);
    const siteUrl = new URL(variables.VITE_SITE_URL);
    if (apiUrl.protocol !== "https:" || apiUrl.pathname !== "/api") {
      throw new Error("VITE_API_URL doit être une URL HTTPS terminant exactement par /api.");
    }
    if (wsUrl.protocol !== "wss:" || wsUrl.pathname !== "/ws/") {
      throw new Error("VITE_WS_URL doit être une URL WSS pointant exactement vers /ws/.");
    }
    if (siteUrl.protocol !== "https:" || siteUrl.pathname !== "/") {
      throw new Error("VITE_SITE_URL doit être l'origine HTTPS du backend, sans chemin.");
    }
  }
  const googleClientId = variables.VITE_GOOGLE_CLIENT_ID
    || variables.GOOGLE_CLIENT_ID
    || variables.GOOGLE_CLIENT_IDS?.split(",")[0]?.trim()
    || "";
  return {
    envDir: "..",
    define: {
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
