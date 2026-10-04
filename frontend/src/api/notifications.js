import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

const curseur = (url) => (url ? new URL(url, location.origin).searchParams.get("cursor") : undefined);

export const useNotifications = () => useInfiniteQuery({
  queryKey: ["notifications"], initialPageParam: null, getNextPageParam: (d) => curseur(d.next),
  queryFn: ({ pageParam }) => api(`/notifications/${pageParam ? `?cursor=${pageParam}` : ""}`),
});
export const useCompteurNotifs = () =>
  useQuery({ queryKey: ["compteur-notifs"], queryFn: () => api("/notifications/compteur/"), refetchInterval: 90_000 });
export const usePreferences = () => useQuery({ queryKey: ["preferences"], queryFn: () => api("/notifications/preferences/") });

export function useMarquerLues() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api("/notifications/lu/", { method: "POST", body }),
    onSuccess: () => ["notifications", "compteur-notifs"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}

export function useMajPreferences() { // mise à jour immédiate à l'écran, annulée si le serveur refuse
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api("/notifications/preferences/", { method: "PATCH", body }),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: ["preferences"] });
      const avant = qc.getQueryData(["preferences"]);
      qc.setQueryData(["preferences"], (o) => ({ ...o, ...body }));
      return { avant };
    },
    onError: (_e, _b, ctx) => qc.setQueryData(["preferences"], ctx.avant),
    onSettled: () => qc.invalidateQueries({ queryKey: ["preferences"] }),
  });
}
