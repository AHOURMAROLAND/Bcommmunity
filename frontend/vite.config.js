import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const chemin = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ mode }) => {
  const natif = mode === "native"; // l'application Android embarque déjà tout : pas de service worker
  const variables = loadEnv(mode, "..", ["VITE_", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_IDS"]);
  const googleClientId = variables.VITE_GOOGLE_CLIENT_ID
    || variables.GOOGLE_CLIENT_ID
    || variables.GOOGLE_CLIENT_IDS?.split(",")[0]?.trim()
    || "";
  return {
    envDir: "..",
    define: {
      "import.meta.env.VITE_GOOGLE_CLIENT_ID": JSON.stringify(googleClientId),
    },
    plugins: [react(), tailwindcss(), VitePWA({
      disable: natif,
      strategies: "injectManifest", srcDir: "src", filename: "sw.js",
      registerType: "prompt", injectRegister: false,
      manifest: {
        id: "/", name: "Bakhita Community", short_name: "Bakhita",
        description: "Le réseau des élèves et anciens élèves de l'école.",
        lang: "fr", start_url: "/", scope: "/", display: "standalone", orientation: "portrait",
        background_color: "#FFFFFF", theme_color: "#0B1F4B", categories: ["social", "education"],
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
        globPatterns: ["**/*.{js,css,html}", "icons/*.png", "**/*-latin-[0-9]*-normal*.woff2"],
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
      },
    },
  };
});
