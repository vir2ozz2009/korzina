import { QueryClient } from "@tanstack/react-query";
import { errorKind } from "../shared/http-error";

export const queryPolicy = {
  catalog: { staleTime: 5 * 60_000 },
  stock: { staleTime: 30_000 },
  cart: { staleTime: 30_000 },
  orders: { staleTime: 30_000, refetchOnWindowFocus: true },
  chat: { staleTime: 30_000, refetchOnWindowFocus: true },
  reference: { staleTime: 24 * 60 * 60_000 },
} as const;

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        refetchIntervalInBackground: false,
        retry: (count, error) => count < 1 && errorKind(error) === "retry",
      },
    },
  });
}

// Commands store the returned entity and invalidate only its actual dependencies.
export function commitQueryResult<T>(
  client: QueryClient,
  key: readonly unknown[],
  value: T,
  dependencies: readonly (readonly unknown[])[] = [],
) {
  client.setQueryData(key, value);
  return Promise.all(dependencies.map((queryKey) => client.invalidateQueries({ queryKey })));
}
