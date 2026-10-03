export async function partager(pub) {
  const url = `${window.location.origin}/p/${pub.id}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: pub.titre, text: (pub.extrait || "").slice(0, 120), url });
      return "partage";
    } catch (e) {
      if (e.name === "AbortError") return "annule";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copie";
  } catch {
    window.prompt("Copiez ce lien :", url);
    return "manuel";
  }
}
