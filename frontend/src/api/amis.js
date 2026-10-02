import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

const suite = (derniere, toutes) => (derniere.next ? toutes.length + 1 : undefined);

function useListe(cle, chemin, params = "") {
  return useInfiniteQuery({
    queryKey: [cle, params],
    queryFn: ({ pageParam }) => api(`${chemin}?${params}${params ? "&" : ""}page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: suite,
  });
}

export function useAnnuaire(filtres) {
  const p = new URLSearchParams(Object.entries(filtres).filter(([, v]) => v !== "" && v != null));
  return useListe("annuaire", "/annuaire/", p.toString());
}
export const useSuggestions = () => useListe("suggestions", "/amis/suggestions/");
export const useAmis = () => useListe("amis", "/amis/");
export const useDemandes = (type) => useListe("demandes", "/amis/demandes/", `type=${type}`);

export const useCompteurs = () =>
  useQuery({ queryKey: ["compteurs"], queryFn: () => api("/amis/compteurs/"), refetchInterval: 60_000 });

export const useProfilPublic = (id) =>
  useQuery({ queryKey: ["profil-public", id], queryFn: () => api(`/profils/${id}/`), retry: false });

function useAction(fn) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => ["annuaire", "suggestions", "amis", "demandes", "compteurs", "profil-public"]
      .forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}
export const useEnvoyerDemande = () => useAction((user) => api("/amis/demandes/", { method: "POST", body: { user } }));
export const useAccepterDemande = () => useAction((id) => api(`/amis/demandes/${id}/accepter/`, { method: "POST" }));
export const useRefuserDemande = () => useAction((id) => api(`/amis/demandes/${id}/refuser/`, { method: "POST" }));
export const useAnnulerDemande = () => useAction((id) => api(`/amis/demandes/${id}/`, { method: "DELETE" }));
export const useRetirerAmi = () => useAction((uid) => api(`/amis/${uid}/`, { method: "DELETE" }));
export const useBloquer = () => useAction((user) => api("/blocages/", { method: "POST", body: { user } }));
