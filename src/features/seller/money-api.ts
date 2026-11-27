import { type QueryFilters, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type {
  SellerMoneyOperation,
  SellerMoneyOverview,
  SellerMoneyPage,
  SellerMoneyTask,
} from "../../shared/contracts/seller-money";
import type { SalesPeriod } from "../../shared/contracts/seller-sales";
import { ConnectionError } from "../../shared/http-error";
import { sellerHttp } from "./http";

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

export function sellerMoneyRefresh(store: string): QueryFilters {
  return {
    queryKey: ["seller-money", store],
    // Live updates bypass refetchOnReconnect. Leave a failed first read to its visible Retry action.
    predicate: ({ queryKey, state }) =>
      !(
        (queryKey[3] === "overview" || queryKey[3] === "operations") &&
        state.data === undefined &&
        state.error instanceof ConnectionError
      ),
  };
}

async function read<T>(
  session: Session,
  path: string,
  filters: Record<string, string | undefined>,
  signal: AbortSignal,
) {
  const query = new URLSearchParams({ store: session.store });
  for (const [name, value] of Object.entries(filters)) if (value) query.set(name, value);
  try {
    const response = await sellerHttp(`/api/seller/money${path}?${query}`, { signal });
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
