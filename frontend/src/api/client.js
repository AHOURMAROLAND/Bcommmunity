import { estNatif } from "../utils/plateforme";

const BASE = import.meta.env.VITE_API_URL ?? "/api";
const CLE_REFRESH = "bk_refresh";
let accessToken = null;
let rafraichissement = null;

export class ApiError extends Error {
  constructor(status, data) {
    super(typeof data?.detail === "string" ? data.detail : "Une erreur est survenue.");
    this.status = status;
    this.data = data;
  }
}

export const setAccessToken = (t) => { accessToken = t; };
const entetes = () => (estNatif() ? { "X-Client": "natif" } : {});
const lire = async (r) => { try { return await r.json(); } catch { return null; } };

const stockage = async () => (await import("capacitor-secure-storage-plugin")).SecureStoragePlugin;
export async function sauverRefresh(v) { if (estNatif() && v) await (await stockage()).set({ key: CLE_REFRESH, value: v }); }
export async function lireRefresh() {
  if (!estNatif()) return null;
  try { return (await (await stockage()).get({ key: CLE_REFRESH })).value; } catch { return null; }
}
export async function effacerRefresh() {
  if (!estNatif()) return;
  try { await (await stockage()).remove({ key: CLE_REFRESH }); } catch { /* déjà absent */ }
}

export function rafraichir() {
  rafraichissement ??= (async () => {
    const natif = estNatif();
    const r = await fetch(`${BASE}/auth/rafraichir/`, {
      method: "POST", credentials: "include",
      headers: { ...entetes(), ...(natif ? { "Content-Type": "application/json" } : {}) },
      body: natif ? JSON.stringify({ refresh: await lireRefresh() }) : undefined,
    });
    const data = await lire(r);
    if (!r.ok) throw new ApiError(r.status, data);
    accessToken = data.access;
    if (natif && data.refresh) await sauverRefresh(data.refresh);
    return data.access;
  })().finally(() => { rafraichissement = null; });
  return rafraichissement;
}

export async function api(chemin, options = {}, dejaRetente = false) {
  const { method = "GET", body, formData, signal } = options;
  const headers = { ...entetes() };
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
  if (!r.ok) {
    const data = await lire(r);
    if (r.status === 403 && ["non_valide", "suspendu", "banni"].includes(data?.code)) {
      window.dispatchEvent(new CustomEvent("acces-bloque", { detail: data }));
    }
    throw new ApiError(r.status, data);
  }
  return r.status === 204 ? null : r.json();
}

export const jetonPourWs = () => rafraichir();
