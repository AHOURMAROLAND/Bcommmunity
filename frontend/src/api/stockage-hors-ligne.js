const NOM_BD = "bakhita-hors-ligne";
const VERSION_BD = 1;
const TABLE_FILE = "file";
const TABLE_CACHE = "caches";
const EVENEMENT_FILE = "bakhita-file-change";
const DUREE_FILE_MS = 48 * 60 * 60 * 1000;

let ouverture;

function ouvrir() {
  ouverture ??= new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Le stockage hors ligne n'est pas disponible sur cet appareil."));
      return;
    }
    const requete = indexedDB.open(NOM_BD, VERSION_BD);
    requete.onupgradeneeded = () => {
      const db = requete.result;
      if (!db.objectStoreNames.contains(TABLE_FILE)) {
        db.createObjectStore(TABLE_FILE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(TABLE_CACHE)) {
        db.createObjectStore(TABLE_CACHE, { keyPath: "id" });
      }
    };
    requete.onsuccess = () => resolve(requete.result);
    requete.onerror = () => {
      ouverture = null;
      reject(requete.error ?? new Error("Impossible d'ouvrir le stockage hors ligne."));
    };
  });
  return ouverture;
}

async function operation(table, mode, action) {
  const db = await ouvrir();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(table, mode);
    const resultat = action(transaction.objectStore(table));
    transaction.oncomplete = () => resolve(resultat?.result);
    transaction.onerror = () => reject(transaction.error ?? new Error("Échec du stockage hors ligne."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Échec du stockage hors ligne."));
  });
}

export function persisterRequetes(utilisateurId) {
  const id = `requete:${utilisateurId}`;
  return {
    persistClient: (client) =>
      operation(TABLE_CACHE, "readwrite", (store) => store.put({ id, client })),
    restoreClient: async () => (await operation(TABLE_CACHE, "readonly", (store) => store.get(id)))?.client,
    removeClient: () => operation(TABLE_CACHE, "readwrite", (store) => store.delete(id)),
  };
}

export function effacerCacheHorsLigne(utilisateurId) {
  if (!utilisateurId) return Promise.resolve();
  return persisterRequetes(utilisateurId).removeClient();
}

export async function ajouterALaFile(operationHorsLigne) {
  const element = {
    ...operationHorsLigne,
    id: operationHorsLigne.id ?? crypto.randomUUID(),
    creeLe: operationHorsLigne.creeLe ?? new Date().toISOString(),
    expireLe: operationHorsLigne.expireLe ?? new Date(Date.now() + DUREE_FILE_MS).toISOString(),
    essais: 0,
  };
  await operation(TABLE_FILE, "readwrite", (store) => store.put(element));
  window.dispatchEvent(new Event(EVENEMENT_FILE));
  return element;
}

export async function lireFile(utilisateurId) {
  const elements = await operation(TABLE_FILE, "readonly", (store) => store.getAll());
  return (elements ?? [])
    .filter((element) => element.utilisateurId === utilisateurId)
    .map((element) => ({
      ...element,
      expireLe: element.expireLe
        ?? new Date(Date.parse(element.creeLe) + DUREE_FILE_MS).toISOString(),
    }))
    .sort((a, b) => a.creeLe.localeCompare(b.creeLe));
}

export async function supprimerDeLaFile(id) {
  await operation(TABLE_FILE, "readwrite", (store) => store.delete(id));
  window.dispatchEvent(new Event(EVENEMENT_FILE));
}

export async function noterEchecFile(element, erreur) {
  await operation(TABLE_FILE, "readwrite", (store) => store.put({
    ...element,
    essais: element.essais + 1,
    derniereErreur: erreur,
  }));
  window.dispatchEvent(new Event(EVENEMENT_FILE));
}

export async function retenterElementFile(element) {
  await operation(TABLE_FILE, "readwrite", (store) => store.put({
    ...element,
    derniereErreur: "",
    expireLe: new Date(Date.now() + DUREE_FILE_MS).toISOString(),
  }));
  window.dispatchEvent(new Event(EVENEMENT_FILE));
}

export async function effacerFileHorsLigne(utilisateurId) {
  if (!utilisateurId) return;
  const elements = await lireFile(utilisateurId);
  const db = await ouvrir();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(TABLE_FILE, "readwrite");
    const store = transaction.objectStore(TABLE_FILE);
    elements.forEach((element) => store.delete(element.id));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error ?? new Error("Impossible d'effacer la file hors ligne."));
  });
}

export function ecouterFile(callback) {
  window.addEventListener(EVENEMENT_FILE, callback);
  return () => window.removeEventListener(EVENEMENT_FILE, callback);
}

export function creerFormData(entrees) {
  const formData = new FormData();
  for (const [cle, valeur] of entrees) {
    formData.append(cle, valeur);
  }
  return formData;
}

export function estErreurReseau(erreur) {
  return !navigator.onLine || erreur instanceof TypeError;
}
