import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export const useReferentiels = () =>
  useQuery({ queryKey: ["referentiels"], queryFn: () => api("/referentiels/"), staleTime: 10 * 60_000 });

export const useProfil = (actif = true) =>
  useQuery({ queryKey: ["profil"], queryFn: () => api("/profils/me/"), enabled: actif });

export function useMajProfil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api("/profils/me/", { method: "PATCH", body }),
    onSuccess: (data) => qc.setQueryData(["profil"], data),
  });
}

export function useAjouterScolarite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api("/scolarites/", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profil"] }),
  });
}

export function useRetirerScolarite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api(`/scolarites/${id}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profil"] }),
  });
}

export const useParcoursBrouillon = () =>
  useQuery({
    queryKey: ["parcours-brouillon"],
    queryFn: () => api("/onboarding/brouillon/"),
  });

export function useSauverParcoursBrouillon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api("/onboarding/brouillon/", { method: "PUT", body }),
    onSuccess: (data) => qc.setQueryData(["parcours-brouillon"], data),
  });
}

export function useValiderParcours() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api("/onboarding/valider/", { method: "POST", body }),
    onSuccess: () => {
      qc.setQueryData(["parcours-brouillon"], { etape: 0, donnees: {} });
      qc.invalidateQueries({ queryKey: ["profil"] });
    },
  });
}

export function useMajSituation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api("/profils/me/situation/", { method: "PUT", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profil"] }),
  });
}
