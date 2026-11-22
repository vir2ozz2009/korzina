import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  SellerOrder,
  SellerOrderCommand,
  SellerOrderPage,
  SellerOrdersQuery,
} from "../../shared/contracts/seller-order";
import type { SellerOrderCalendar, SellerPackingList, SellerWorkday } from "../../shared/contracts/workday";
import { checkResponse, HttpError } from "../../shared/http-error";
import { commandHeaders } from "../../shared/shop-api";
import { sellerSessionHeaders } from "./api";

const root = (store: string) => ["seller-orders", store] as const;
const orderKey = (store: string, number: number) => [...root(store), "order", number] as const;
const badgeKey = (store: string) => [...root(store), "badge"] as const;
type ListSelection = Omit<SellerOrdersQuery, "rev" | "cursor">;

async function request(store: string, path: string, params: Record<string, unknown> = {}, init: RequestInit = {}) {
  const url = new URL(`/api/seller/orders${path}`, location.origin);
  url.searchParams.set("store", store);
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  const answer = await fetch(url, {
    ...init,
    headers: { ...sellerSessionHeaders(), ...init.headers },
    cache: "no-store",
  });
  await checkResponse(answer);
  return answer;
}

export function useSellerOrderList(store: string, selection: ListSelection) {
  const client = useQueryClient();
  const key = [...root(store), "list", selection] as const;
  return useQuery({
    queryKey: key,
    enabled: !!store,
    queryFn: async ({ signal }): Promise<SellerOrderPage> => {
      const previous = client.getQueryData<SellerOrderPage>(key);
      const result: SellerOrderPage | { unchanged: true; timeZone?: string } = await (
        await request(store, "", { ...selection, rev: previous?.rev }, { signal })
      ).json();
      if ("unchanged" in result) {
        if (!previous) throw new Error("Список недоступен");
        return result.timeZone && result.timeZone !== previous.timeZone
          ? { ...previous, timeZone: result.timeZone }
          : previous;
      }
      client.setQueryData(badgeKey(store), { rev: result.rev, count: result.newlyPlaced });
      return result;
    },
  });
}

export async function moreSellerOrders(
  store: string,
  selection: ListSelection,
  cursor: string,
): Promise<SellerOrderPage> {
  return (await request(store, "", { ...selection, cursor })).json();
}

export function useSellerOrderBadge(store: string) {
  const client = useQueryClient();
  const key = badgeKey(store);
  return useQuery({
    queryKey: key,
    enabled: !!store,
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<{ rev: number; count: number }> => {
      const previous = client.getQueryData<{ rev: number; count: number }>(key);
      const result: { rev: number; count: number } | { unchanged: true } = await (
        await request(store, "/badge", { rev: previous?.rev }, { signal })
      ).json();
      if ("unchanged" in result) {
        if (!previous) throw new Error("Счётчик заказов недоступен");
        return previous;
      }
      return result;
    },
  });
}

export function useSellerOrder(store: string, number: number) {
  return useQuery({
    queryKey: orderKey(store, number),
    enabled: !!store && Number.isSafeInteger(number) && number > 0,
    queryFn: async ({ signal }): Promise<SellerOrder> => (await request(store, `/${number}`, {}, { signal })).json(),
  });
}

export function useSellerOrderCommand(store: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      number,
      command,
      key,
    }: {
      number: number;
      command: SellerOrderCommand;
      key: string;
    }): Promise<SellerOrder> =>
      (
        await request(
          store,
          `/${number}/transition`,
          {},
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...commandHeaders(key) },
            body: JSON.stringify(command),
          },
        )
      ).json(),
    onSuccess: (order) => {
      const key = orderKey(store, order.number);
      client.setQueryData<SellerOrder>(key, (previous) =>
        previous && previous.revision > order.revision ? previous : order,
      );
      void invalidateSellerOrders(client, store, order.number);
    },
    onError: (error, { number }) => {
      if (error instanceof HttpError && (error.status === 409 || error.status === 403))
        void invalidateSellerOrders(client, store, number);
    },
  });
}

export async function sellerReceiptFile(store: string, number: number, id: string, signal: AbortSignal) {
  return (await request(store, `/${number}/receipts/${id}`, {}, { signal })).blob();
}

export async function sellerOrdersSocket(store: string, signal: AbortSignal) {
  const { ticket }: { ticket: string } = await (
    await request(store, "/live-ticket", {}, { method: "POST", signal })
  ).json();
  const url = new URL("/api/seller/orders/live", location.origin);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("store", store);
  url.searchParams.set("ticket", ticket);
  return new WebSocket(url);
}

export function invalidateSellerOrders(
  client: ReturnType<typeof useQueryClient>,
  store: string,
  number?: number,
  cursor?: number,
) {
  return client.invalidateQueries({
    queryKey: root(store),
    predicate: ({ queryKey, state }) => {
      if (queryKey[2] === "order") return number === undefined || queryKey[3] === number;
      if (cursor === undefined) return true;
      const data = state.data as { rev?: number } | undefined;
      return (data?.rev ?? -1) < cursor;
    },
  });
}

export function useSellerWorkday(store: string, money: boolean) {
  const client = useQueryClient();
  const key = [...root(store), "workday", money] as const;
  return useQuery({
    queryKey: key,
    queryFn: async ({ signal }): Promise<SellerWorkday> => {
      const previous = client.getQueryData<SellerWorkday>(key);
      const result: SellerWorkday | { unchanged: true } = await (
        await request(store, "/workday", { version: previous?.version }, { signal })
      ).json();
      if ("unchanged" in result) {
        if (!previous) throw new Error("Сводка недоступна");
        return previous;
      }
      return result;
    },
  });
}
export function useSellerPacking(store: string, day?: string) {
  return useQuery({
    queryKey: [...root(store), "packing", day],
    queryFn: async ({ signal }): Promise<SellerPackingList> =>
      (await request(store, "/packing", { day }, { signal })).json(),
  });
}
export function useSellerCalendar(store: string, month?: string) {
  return useQuery({
    queryKey: [...root(store), "calendar", month],
    queryFn: async ({ signal }): Promise<SellerOrderCalendar> =>
      (await request(store, "/calendar", { month }, { signal })).json(),
  });
}
