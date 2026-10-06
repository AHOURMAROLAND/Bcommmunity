const CLE = "bk_theme";

const lire = () => {
  try { return localStorage.getItem(CLE) ?? "auto"; } catch { return "auto"; }
};

export const themeActuel = lire;

export function appliquerTheme(t) {
  const r = document.documentElement;
  try {
    t === "auto" ? localStorage.removeItem(CLE) : localStorage.setItem(CLE, t);
  } catch { /* stockage indisponible en navigation privee */ }

  if (t === "auto") r.removeAttribute("data-theme");
  else r.setAttribute("data-theme", t);

  const sombre =
    t === "dark" ||
    (t === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  // Synchronise la classe dark-mode pour les composants Untitled UI
  r.classList.toggle("dark-mode", sombre);
}

export function initialiserTheme() {
  appliquerTheme(lire());
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (lire() === "auto") appliquerTheme("auto");
    });
}
