import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

const suite = (d, toutes) => (d.next ? toutes.length + 1 : undefined);
const curseur = (url) => (url ? new URL(url, location.origin).searchParams.get("cursor") : undefined);

// ---- Invitations ----
export const useInvitations = (type) =>
  useInfiniteQuery({
    queryKey: ["invitations", type],
    initialPageParam: 1,
    getNextPageParam: suite,
    queryFn: ({ pageParam }) =>
      api(`/discussions/invitations/?type=${type}&page=${pageParam}`),
  });

// ---- Conversations ----
export const useConversations = () =>
  useInfiniteQuery({
    queryKey: ["conversations"],
    initialPageParam: 1,
    getNextPageParam: suite,
    queryFn: ({ pageParam }) => api(`/conversations/?page=${pageParam}`),
  });

// ---- Compteurs (badge nav) ----
export const useCompteursDisc = () =>
  useQuery({
    queryKey: ["compteurs-disc"],
    queryFn: () => api("/discussions/compteurs/"),
    refetchInterval: 90_000,
  });

// ---- Detail d'une conversation ----
export const useConversation = (id) =>
  useQuery({
    queryKey: ["conversation", String(id)],
    queryFn: () => api(`/conversations/${id}/`),
    retry: false,
    enabled: !!id,
  });

// ---- Messages (curseur) ----
export const useMessages = (id) =>
  useInfiniteQuery({
    queryKey: ["messages", String(id)],
    initialPageParam: null,
    retry: false,
    enabled: !!id,
    getNextPageParam: (d) => curseur(d.next),
    queryFn: ({ pageParam }) =>
      api(`/conversations/${id}/messages/${pageParam ? `?cursor=${pageParam}` : ""}`),
  });

// ---- Mutations ----
function useAction(fn) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      ["invitations", "conversations", "compteurs-disc", "profil-public"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] })),
  });
}

export const useEnvoyerInvitation = () =>
  useAction(({ user, message }) =>
    api("/discussions/invitations/", { method: "POST", body: { user, message } }));

export const useAccepterInvitation = () =>
  useAction((id) =>
    api(`/discussions/invitations/${id}/accepter/`, { method: "POST" }));

export const useRefuserInvitation = () =>
  useAction((id) =>
    api(`/discussions/invitations/${id}/refuser/`, { method: "POST" }));

export const useAnnulerInvitation = () =>
  useAction((id) =>
    api(`/discussions/invitations/${id}/`, { method: "DELETE" }));
