const BASE = import.meta.env.VITE_API_URL ?? "/api";
let accessToken = null; // en mémoire uniquement : jamais dans localStorage
let rafraichissement = null; // une seule requête de refresh à la fois

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.detail ?? "Une erreur est survenue.");
    this.status = status;
    this.data = data;
  }
}

export const setAccessToken = (t) => { accessToken = t; };

async function lire(reponse) {
  try { return await reponse.json(); } catch { return null; }
}

export function rafraichir() {
  rafraichissement ??= fetch(`${BASE}/auth/rafraichir/`, { method: "POST", credentials: "include" })
    .then(async (r) => {
      const data = await lire(r);
      if (!r.ok) throw new ApiError(r.status, data);
      accessToken = data.access;
      return data.access;
    })
    .finally(() => { rafraichissement = null; });
  return rafraichissement;
}

export async function api(chemin, options = {}, dejaRetente = false) {
  const { method = "GET", body, formData, signal } = options;
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const r = await fetch(`${BASE}${chemin}`, {
    method, headers, signal, credentials: "include",
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });

  if (r.status === 401 && !dejaRetente) {
    try { await rafraichir(); } catch { accessToken = null; throw new ApiError(401, null); }
    return api(chemin, options, true);
  }
  if (!r.ok) throw new ApiError(r.status, await lire(r));
  return r.status === 204 ? null : r.json();
}
