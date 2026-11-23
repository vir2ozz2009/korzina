import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChatSend, OrderChatEntry, OrderChatHistory, OrderChatList } from "../../shared/contracts/order-chat";
import { errorKind } from "../../shared/http-error";
import { buyerChatKey, orderPost, orderRequest, sellerChatKey } from "../order-changes";

const key = (store?: string) => (store ? sellerChatKey(store) : buyerChatKey);
const base = (store?: string) => (store ? "chat" : "orders/chat");

export function useChatList(store?: string) {
  return useInfiniteQuery({
    queryKey: [...key(store), "list"],
    initialPageParam: undefined as string | undefined,
    retry: false,
    queryFn: async ({ pageParam, signal }): Promise<OrderChatList> =>
      (await orderRequest(`${base(store)}${pageParam ? `?cursor=${pageParam}` : ""}`, store, { signal })).json(),
    getNextPageParam: (page) => page.cursor,
  });
}

export function useChatHistory(number: number, store?: string) {
  return useInfiniteQuery({
    queryKey: [...key(store), "history", number],
    initialPageParam: undefined as number | undefined,
    retry: false,
    enabled: Number.isSafeInteger(number) && number > 0,
    queryFn: async ({ pageParam, signal }): Promise<OrderChatHistory> =>
      (
        await orderRequest(`${base(store)}/${number}${pageParam ? `?before=${pageParam}` : ""}`, store, { signal })
      ).json(),
    getNextPageParam: (page) => page.cursor,
  });
}

export function useSendChat(number: number, store?: string) {
  const client = useQueryClient();
  return useMutation({
    retry: (count, error) => count === 0 && errorKind(error) === "retry",
    mutationFn: async ({ body, command }: { body: ChatSend; command: string }): Promise<OrderChatEntry> =>
      (await orderPost(`${base(store)}/${number}`, body, store, command)).json(),
    onSuccess: () => void client.invalidateQueries({ queryKey: key(store) }),
  });
}

export function useReadChat(number: number, store?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (through: number) => orderPost(`${base(store)}/${number}/read`, { through }, store),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [...key(store), "list"] });
      void client.invalidateQueries({ queryKey: [...key(store), "badge"] });
    },
  });
}

export function useChatBadge(store: string) {
  return useQuery({
    queryKey: [...key(store), "badge"],
    staleTime: 60_000,
    retry: false,
    enabled: !!store,
    queryFn: async ({ signal }): Promise<{ count: number }> =>
      (await orderRequest("chat/badge", store, { signal })).json(),
  });
}

export async function chatPhoto(number: number, mediaId: string, store: string | undefined, signal: AbortSignal) {
  return (await orderRequest(`${base(store)}/${number}/photos/${mediaId}`, store, { signal })).blob();
}
