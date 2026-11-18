import { infiniteQueryOptions, useInfiniteQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { bootstrap } from "../../app/bootstrap";
import { queryPolicy } from "../../app/query-defaults";
import type { CatalogFilters, CatalogScope } from "../../shared/contracts/catalog-list";
import { checkResponse } from "../../shared/http-error";
import { shopApi, shopKey } from "../../shared/shop-api";
import { resolveDocumentImage } from "./document-images";

type CatalogPage = InferResponseType<typeof shopApi.api.catalog.page.$get>;
export function productListQuery(scope: CatalogScope, filters: CatalogFilters = {}, enabled = true) {
  return infiniteQueryOptions({
    queryKey: ["shop", shopKey, "product-list", scope, filters] as const,
    ...queryPolicy.stock,
    enabled: enabled && bootstrap?.status === "active",
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: CatalogPage) => page.next ?? undefined,
    queryFn: async ({ pageParam, signal }) => {
      const response = await shopApi.api.catalog.page.$get(
        {
          query: {
            scope,
            count: "1",
            ...filters,
            min: filters.min?.toString(),
            max: filters.max?.toString(),
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
        { init: { signal } },
      );
      await checkResponse(response);
      const data = await response.json();
      const image = (value: Parameters<typeof resolveDocumentImage>[0]) =>
        resolveDocumentImage(value, bootstrap?.mediaOrigin ?? "");
      return {
        ...data,
        items: data.items.map((item) => ({ ...item, image: image(item.image) })),
        categories: data.categories.map((item) => ({ ...item, image: image(item.image) })),
        brands: data.brands.map((item) => ({ ...item, image: image(item.image) })),
      };
    },
  });
}
export const useProductList = (scope: CatalogScope, filters?: CatalogFilters, enabled?: boolean) =>
  useInfiniteQuery(productListQuery(scope, filters, enabled));
