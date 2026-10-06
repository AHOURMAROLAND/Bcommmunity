let prochainId = 0;

export function afficherToast(message, type = "info") {
  if (typeof window === "undefined" || !message) return undefined;
  window.dispatchEvent(new CustomEvent("bakhita:toast", {
    detail: { id: ++prochainId, message: String(message), type },
  }));
  return prochainId;
}
