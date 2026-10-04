const CLE = "bk_theme";
const lire = () => { try { return localStorage.getItem(CLE) ?? "auto"; } catch { return "auto"; } };
export const themeActuel = lire;

export function appliquerTheme(t) {
  const r = document.documentElement;
  try { t === "auto" ? localStorage.removeItem(CLE) : localStorage.setItem(CLE, t); } catch { /* stockage indisponible */ }
  if (t === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", t);
  const sombre = t === "dark" || (t === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  r.classList.toggle("dark-mode", sombre); // pour les composants Untitled UI
}

export function initialiserTheme() {
  appliquerTheme(lire());
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => lire() === "auto" && appliquerTheme("auto"));
}
