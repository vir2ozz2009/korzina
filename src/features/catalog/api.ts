import { infiniteQueryOptions, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { bootstrap } from "../../app/bootstrap";
import { queryPolicy } from "../../app/query-defaults";
import { checkResponse } from "../../shared/http-error";
import { shopApi, shopKey } from "../../shared/shop-api";

const catalogKeys = {
  document: (version?: number) => ["shop", shopKey, "catalog", version ?? "current"] as const,
  live: (ids: string[]) => ["shop", shopKey, "offers", ids] as const,
};
type CatalogDocument = InferResponseType<typeof shopApi.api.catalog.document.$get>;
function catalogQuery(version?: number) {
  return infiniteQueryOptions({
    queryKey: catalogKeys.document(version),
    ...queryPolicy.catalog,
    enabled: bootstrap?.status === "active",
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: CatalogDocument) => page.next ?? undefined,
    queryFn: async ({ pageParam, signal }) => {
      const response = await shopApi.api.catalog.document.$get(
        {
          query: {
            limit: "16",
            ...(pageParam ? { after: pageParam } : {}),
            ...(version ? { version: String(version) } : {}),
          },
        },
        { init: { signal } },
      );
      await checkResponse(response);
      return response.json();
    },
  });
}
export const useCatalog = (version?: number) => useInfiniteQuery(catalogQuery(version));
export function useOffers(ids: string[]) {
  return useQuery({
    queryKey: catalogKeys.live(ids),
    ...queryPolicy.stock,
    enabled: ids.length > 0 && bootstrap?.status === "active",
    queryFn: async ({ signal }) => {
      const pages = await Promise.all(
        Array.from({ length: Math.ceil(ids.length / 50) }, async (_, i) => {
          const response = await shopApi.api.catalog.live.$get(
            { query: { ids: ids.slice(i * 50, (i + 1) * 50).join(",") } },
            { init: { signal } },
          );
          await checkResponse(response);
          return response.json();
        }),
      );
      return { ...pages[0], items: pages.flatMap((page) => page.items) };
    },
  });
}
