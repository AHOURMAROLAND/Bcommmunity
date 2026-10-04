import { useMutation } from "@tanstack/react-query";
import { api } from "./client";

export function useSignaler() {
  return useMutation({
    mutationFn: ({ type, id, motif, commentaire = "" }) =>
      api("/signalements/", { method: "POST", body: { type, id, motif, commentaire } }),
  });
}
