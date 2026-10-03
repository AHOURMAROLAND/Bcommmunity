import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

const suite = (derniere, toutes) => (derniere.next ? toutes.length + 1 : undefined);

export function usePublications(filtres = {}) {
  const p = new URLSearchParams(Object.entries(filtres).filter(([, v]) => v !== "" && v != null));
  const queryStr = p.toString();
  return useInfiniteQuery({
    queryKey: ["publications", queryStr],
    queryFn: ({ pageParam }) =>
      api(`/publications/?${queryStr}${queryStr ? "&" : ""}page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: suite,
  });
}

export function usePublication(id) {
  return useQuery({
    queryKey: ["publication", id],
    queryFn: () => api(`/publications/${id}/`),
    enabled: Boolean(id),
  });
}

export function useCreerPublication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData) => api("/publications/", { method: "POST", formData }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["publications"] });
    },
  });
}

export function useModifierPublication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, formData }) => api(`/publications/${id}/`, { method: "PATCH", formData }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["publications"] });
      qc.invalidateQueries({ queryKey: ["publication", id] });
    },
  });
}

export function useSupprimerPublication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api(`/publications/${id}/`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["publications"] });
    },
  });
}

export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api(`/publications/${id}/like/`, { method: "POST" }),
    onSuccess: (data, id) => {
      // Met à jour les requêtes en cache
      qc.setQueriesData({ queryKey: ["publications"] }, (ancien) => {
        if (!ancien?.pages) return ancien;
        return {
          ...ancien,
          pages: ancien.pages.map((page) => ({
            ...page,
            results: page.results.map((pub) =>
              pub.id === id ? { ...pub, a_aime: data.aime, nb_likes: data.nb_likes } : pub
            ),
          })),
        };
      });
      qc.invalidateQueries({ queryKey: ["publication", id] });
    },
  });
}

export function useCommentaires(pubId) {
  return useInfiniteQuery({
    queryKey: ["commentaires", pubId],
    queryFn: ({ pageParam }) =>
      api(`/publications/${pubId}/commentaires/?page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: suite,
    enabled: Boolean(pubId),
  });
}

export function useAjouterCommentaire(pubId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (texte) =>
      api(`/publications/${pubId}/commentaires/`, { method: "POST", body: { texte } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commentaires", pubId] });
      qc.invalidateQueries({ queryKey: ["publications"] });
      qc.invalidateQueries({ queryKey: ["publication", pubId] });
    },
  });
}

export function useSupprimerCommentaire(pubId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api(`/commentaires/${id}/`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commentaires", pubId] });
      qc.invalidateQueries({ queryKey: ["publications"] });
      qc.invalidateQueries({ queryKey: ["publication", pubId] });
    },
  });
}
