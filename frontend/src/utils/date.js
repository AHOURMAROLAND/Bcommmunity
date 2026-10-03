const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

export function ilYa(iso) {
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  const a = Math.abs(s);
  if (a < 60) return "à l'instant";
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (a < 604800) return rtf.format(Math.round(s / 86400), "day");
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(iso));
}

export const dateCourte = (iso) => new Date(iso).toLocaleDateString("fr-FR");
