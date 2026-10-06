import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

const curseur = (url) =>
  url ? new URL(url, location.origin).searchParams.get("cursor") : undefined;

/** Liste paginee par curseur. */
export const useNotifications = () =>
  useInfiniteQuery({
    queryKey: ["notifications"],
    initialPageParam: null,
    getNextPageParam: (d) => curseur(d.next),
    queryFn: ({ pageParam }) =>
      api(`/notifications/${pageParam ? `?cursor=${pageParam}` : ""}`),
  });

/** Compteur de notifications non lues (badge cloche). */
export const useCompteurNotifs = () =>
  useQuery({
    queryKey: ["compteur-notifs"],
    queryFn: () => api("/notifications/compteur/"),
    refetchInterval: 90_000,
  });

/** Preferences de l'utilisateur connecte. */
export const usePreferences = () =>
  useQuery({
    queryKey: ["preferences"],
    queryFn: () => api("/notifications/preferences/"),
  });

/** Marquer des notifications comme lues (ids:[]) ou toutes (tout:true). */
export function useMarquerLues() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      api("/notifications/lu/", { method: "POST", body }),
    onSuccess: () =>
      ["notifications", "compteur-notifs"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] })),
  });
}

/**
 * Mise a jour optimiste des preferences.
 * Si le serveur refuse, l'ancienne valeur est restauree.
 */
export function useMajPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      api("/notifications/preferences/", { method: "PATCH", body }),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: ["preferences"] });
      const avant = qc.getQueryData(["preferences"]);
      qc.setQueryData(["preferences"], (o) => ({ ...o, ...body }));
      return { avant };
    },
    onError: (_e, _b, ctx) =>
      qc.setQueryData(["preferences"], ctx.avant),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["preferences"] }),
  });
}
