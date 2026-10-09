import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

const curseur = (url) => (url ? new URL(url, window.location.origin).searchParams.get("cursor") : undefined);

function useCurseur(cle, chemin, params = "", actif = true) {
  return useInfiniteQuery({
    queryKey: [cle, chemin, params],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams(params);
      if (pageParam) p.set("cursor", pageParam);
      return api(`${chemin}?${p}`);
    },
    initialPageParam: null,
    getNextPageParam: (d) => curseur(d.next),
    enabled: actif,
  });
}

export const useFil = (auteur, recherche = "", actif = true) => {
  const params = new URLSearchParams();
  if (auteur) params.set("auteur", auteur);
  if (recherche) params.set("q", recherche);
  return useCurseur("fil", "/publications/", params.toString(), actif);
};
export const useMesPublications = () => useCurseur("mes-publications", "/publications/mes/");
export const useCommentaires = (id) => useCurseur("commentaires", `/publications/${id}/commentaires/`);

export const usePublication = (id, actif = true) =>
  useQuery({ queryKey: ["publication", id], queryFn: () => api(`/publications/${id}/`), enabled: actif, retry: false });

const CLES = ["fil", "mes-publications", "publication"];

export function useEnregistrerPublication(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData) =>
      id ? api(`/publications/${id}/`, { method: "PATCH", formData })
         : api("/publications/", { method: "POST", formData }),
    onSuccess: () => CLES.forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}

export function useSupprimerPublication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api(`/publications/${id}/`, { method: "DELETE" }),
    onSuccess: () => CLES.forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}

export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, aAime }) => {
      return api(`/publications/${id}/like/`, { method: aAime ? "DELETE" : "POST" });
    },
    onSuccess: (data, { id }) => {
      qc.setQueriesData({ queryKey: ["fil"] }, (ancien) => {
        if (!ancien?.pages) return ancien;
        return {
          ...ancien,
          pages: ancien.pages.map((page) => ({
            ...page,
            results: page.results.map((pub) =>
              pub.id === id ? { ...pub, a_aime: data?.a_aime, nb_likes: data?.nb_likes } : pub
            ),
          })),
        };
      });
      qc.invalidateQueries({ queryKey: ["publication", id] });
    },
  });
}

export function useAjouterCommentaire(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (texte) => api(`/publications/${id}/commentaires/`, { method: "POST", body: { texte } }),
    onSuccess: () => ["commentaires", "publication", "fil"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}

export function useSupprimerCommentaire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api(`/commentaires/${id}/`, { method: "DELETE" }),
    onSuccess: () => ["commentaires", "publication", "fil"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}

export function useChangerPhoto() {
  const qc = useQueryClient();
  const invalider = () => ["profil", "profil-public", "fil", "annuaire", "amis"]
    .forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  return {
    envoyer: useMutation({
      mutationFn: (fichier) => {
        const fd = new FormData();
        fd.append("image", fichier);
        return api("/profils/me/photo/", { method: "POST", formData: fd });
      },
      onSuccess: invalider,
    }),
    retirer: useMutation({
      mutationFn: () => api("/profils/me/photo/", { method: "DELETE" }),
      onSuccess: invalider,
    }),
  };
}
