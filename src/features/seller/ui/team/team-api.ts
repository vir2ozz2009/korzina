import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useRef } from "react";
import type { api } from "../../../../shared/api";
import type { TeamRole } from "../../../../shared/contracts/staff";
import { checkResponse, errorKind } from "../../../../shared/http-error";
import { sellerSessionHeaders } from "../../api";

type Endpoints = typeof api.api.seller.team;
export type Members = InferResponseType<Endpoints["members"]["$get"], 200>;
export type Invites = InferResponseType<Endpoints["invites"]["$get"], 200>;
export type Notifications = InferResponseType<Endpoints["notifications"]["$get"], 200>;
export type Audit = InferResponseType<Endpoints["audit"]["$get"], 200>;
type BotStatus = InferResponseType<Endpoints["bot"]["$get"], 200>;
export const roleName: Record<TeamRole, string> = {
  owner: "Владелец",
  manager: "Управляющий",
  picker: "Сборщик",
  accountant: "Бухгалтер",
  custom: "Настроить вручную",
};

export const teamKey = (store: string) => ["seller", "team", store] as const;
export function useStaffBot(store: string) {
  return useQuery({
    queryKey: [...teamKey(store), "bot"],
    queryFn: ({ signal }) => teamRequest<BotStatus>(store, "bot", { signal }),
    retry: false,
    staleTime: 30_000,
  });
}
export async function teamRequest<T>(
  store: string,
  path: string,
  options?: { signal?: AbortSignal; method?: string; key?: string; body?: object; filters?: Record<string, string> },
): Promise<T> {
  const query = new URLSearchParams({ store, ...options?.filters });
  const response = await fetch(`/api/seller/team/${path}?${query}`, {
    method: options?.method,
    signal: options?.signal,
    headers: {
      ...sellerSessionHeaders(),
      ...(options?.key && { "Idempotency-Key": options.key, "Content-Type": "application/json" }),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  await checkResponse(response);
  return (await response.json()) as T;
}

export function useTeamCommand<T>(store: string) {
  const cache = useQueryClient();
  const previous = useRef<{ fingerprint: string; key: string } | undefined>(undefined);
  return useMutation({
    mutationFn: ({ path, method = "POST", body = {} }: { path: string; method?: "POST" | "PUT"; body?: object }) => {
      const fingerprint = JSON.stringify([path, method, body]);
      const key = previous.current?.fingerprint === fingerprint ? previous.current.key : crypto.randomUUID();
      previous.current = { fingerprint, key };
      return teamRequest<T>(store, path, { method, body, key });
    },
    onSuccess: async () => {
      previous.current = undefined;
      await cache.invalidateQueries({ queryKey: teamKey(store) });
    },
    onError: (error) => {
      if (errorKind(error) !== "retry") previous.current = undefined;
    },
  });
}
