import { infiniteQueryOptions, useInfiniteQuery, useQueries } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { bootstrap, buyerStorefrontOpen } from "../../app/bootstrap";
import { queryPolicy } from "../../app/query-defaults";
import { checkResponse } from "../../shared/http-error";
import { shopApi, shopKey } from "../../shared/shop-api";
import { resolveDocumentImage } from "./document-images";
import { offerPages, offersQuery } from "./offers";

const catalogKeys = {
  document: (version?: number) => ["shop", shopKey, "catalog", version ?? "current"] as const,
};
type CatalogDocument = InferResponseType<typeof shopApi.api.catalog.document.$get>;
function catalogQuery(version?: number) {
  return infiniteQueryOptions({
    queryKey: catalogKeys.document(version),
    ...queryPolicy.catalog,
    enabled: buyerStorefrontOpen,
    initialPageParam: undefined as { after: string; version: number } | undefined,
    getNextPageParam: (page: CatalogDocument) =>
      page.next ? { after: page.next, version: page.catalogVersion } : undefined,
    queryFn: async ({ pageParam, signal }) => {
      const response = await shopApi.api.catalog.document.$get(
        {
          query: {
            limit: "16",
            ...(pageParam
              ? { after: pageParam.after, version: String(pageParam.version) }
              : version
                ? { version: String(version) }
                : {}),
          },
        },
        { init: { signal } },
      );
      await checkResponse(response);
      const data = (await import("../../shared/contracts/catalog")).catalogDocumentContract.parse(
        await response.json(),
      );
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
export const useCatalog = (version?: number) => useInfiniteQuery(catalogQuery(version));
export function useOffers(pages: CatalogDocument[]) {
  const queries = useQueries({
    queries: offerPages(pages).map((ids) => ({ ...offersQuery(ids), enabled: buyerStorefrontOpen })),
  });
  const data = queries.flatMap((query) => (query.data ? [query.data] : []));
  return {
    data: data.length
      ? {
          ...data[0],
          catalogVersion: Math.max(...data.map((page) => page.catalogVersion)),
          items: data.flatMap((page) => page.items),
        }
      : undefined,
    isPending: queries.some((query) => query.isPending),
    isError: queries.some((query) => query.isError),
    error: queries.find((query) => query.error)?.error ?? null,
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
  };
}
