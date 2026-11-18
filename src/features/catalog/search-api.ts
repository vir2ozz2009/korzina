import { queryOptions, useQuery } from "@tanstack/react-query";
import { bootstrap } from "../../app/bootstrap";
import { queryPolicy } from "../../app/query-defaults";
import type { CatalogFilters } from "../../shared/contracts/catalog-list";
import { checkResponse } from "../../shared/http-error";
import { shopApi, shopKey } from "../../shared/shop-api";
import { resolveDocumentImage } from "./document-images";

function searchQuery(q: string, filters: CatalogFilters = {}, active = true) {
  return queryOptions({
    queryKey: ["shop", shopKey, "catalog-search", q, filters] as const,
    ...queryPolicy.stock,
    enabled: active && q.length >= 2 && bootstrap?.status === "active",
    queryFn: async ({ signal }) => {
      const response = await shopApi.api.catalog.search.$get(
        {
          query: {
            q,
            ...filters,
            min: filters.min?.toString(),
            max: filters.max?.toString(),
          },
        },
        { init: { signal } },
      );
      await checkResponse(response);
      const data = await response.json();
      const image = (item: Parameters<typeof resolveDocumentImage>[0]) =>
        resolveDocumentImage(item, bootstrap?.mediaOrigin ?? "");
      return { ...data, items: data.items.map((item) => ({ ...item, image: image(item.image) })) };
    },
  });
}
export function useCatalogSearch(q: string, filters?: CatalogFilters, active?: boolean) {
  return useQuery(searchQuery(q, filters, active));
}

export function useShoppingMatches(q: string, enabled: boolean) {
  return useQuery({
    queryKey: ["shop", shopKey, "shopping-search", q] as const,
    ...queryPolicy.stock,
    enabled: enabled && bootstrap?.status === "active",
    queryFn: async ({ signal }) => {
      const response = await shopApi.api.catalog["shopping-search"].$post({ json: { q } }, { init: { signal } });
      await checkResponse(response);
      const data = await response.json();
      const image = (item: Parameters<typeof resolveDocumentImage>[0]) =>
        resolveDocumentImage(item, bootstrap?.mediaOrigin ?? "");
      return { ...data, items: data.items.map((item) => ({ ...item, image: image(item.image) })) };
    },
  });
}
