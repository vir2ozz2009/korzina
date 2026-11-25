import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type {
  SellerMoneyOperation,
  SellerMoneyOverview,
  SellerMoneyPage,
  SellerMoneyTask,
} from "../../shared/contracts/seller-money";
import type { SalesPeriod } from "../../shared/contracts/seller-sales";
import { ConnectionError, checkResponse } from "../../shared/http-error";
import { sellerSessionHeaders } from "./api";

type Session = { store: string; account: string };
type Selection = Partial<SalesPeriod> & { method?: "cash" | "transfer" | "unknown"; search?: string };
const options = { retry: false, refetchOnWindowFocus: "always" } as const;
const periodOptions = {
  retry: false,
  // A paused request never reaches the recoverable error state while offline.
  networkMode: "always",
  refetchOnReconnect: false,
  refetchOnWindowFocus: (query: { state: { error: unknown } }) =>
    query.state.error instanceof ConnectionError ? false : "always",
} as const;
const key = (session: Session) => ["seller-money", session.store, session.account] as const;

async function read<T>(
  session: Session,
  path: string,
  filters: Record<string, string | undefined>,
  signal: AbortSignal,
) {
  const query = new URLSearchParams({ store: session.store });
  for (const [name, value] of Object.entries(filters)) if (value) query.set(name, value);
  try {
    const response = await fetch(`/api/seller/money${path}?${query}`, { signal, headers: sellerSessionHeaders() });
    await checkResponse(response);
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof TypeError && !signal.aborted) throw new ConnectionError("Нет соединения", { cause: error });
    throw error;
  }
}

export function useMoneyOverview(session: Session, period: Partial<SalesPeriod>) {
  return useQuery({
    queryKey: [...key(session), "overview", period],
    queryFn: async ({ signal, client, queryKey }) => {
      const previous = client.getQueryData<SellerMoneyOverview>(queryKey);
      const filters = previous
        ? { ...period, rev: String(previous.revision), cachedDay: previous.period.from }
        : period;
      const result = await read<SellerMoneyOverview | { unchanged: true }>(session, "", filters, signal);
      return "unchanged" in result && previous ? previous : (result as SellerMoneyOverview);
    },
    ...periodOptions,
  });
}

export function useMoneyOperations(session: Session, selection: Selection) {
  return useInfiniteQuery({
    queryKey: [...key(session), "operations", selection],
    queryFn: ({ signal, pageParam }) =>
      read<SellerMoneyPage<SellerMoneyOperation>>(session, "/operations", { ...selection, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (data) => data.cursor,
    ...periodOptions,
  });
}

export function useMoneyTasks(session: Session, group: SellerMoneyTask["kind"]) {
  return useInfiniteQuery({
    queryKey: [...key(session), "tasks", group],
    queryFn: ({ signal, pageParam }) =>
      read<SellerMoneyPage<SellerMoneyTask>>(session, "/tasks", { group, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (data) => data.cursor,
    ...options,
  });
}
