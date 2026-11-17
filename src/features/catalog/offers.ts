import { queryOptions } from "@tanstack/react-query";
import { queryPolicy } from "../../app/query-defaults";
import { checkResponse } from "../../shared/http-error";
import { shopApi, shopKey } from "../../shared/shop-api";

export const offerPages = (pages: { items: { variants: { id: string }[] }[] }[]) =>
  pages.flatMap((page) => {
    const ids = page.items.flatMap((item) => item.variants.map((v) => v.id));
    return Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) => ids.slice(i * 50, (i + 1) * 50));
  });
export function offersQuery(ids: string[]) {
  return queryOptions({
    queryKey: ["shop", shopKey, "offers", ids] as const,
    ...queryPolicy.stock,
    queryFn: async ({ signal }) => {
      const response = await shopApi.api.catalog.live.$get({ query: { ids: ids.join(",") } }, { init: { signal } });
      await checkResponse(response);
      return response.json();
    },
  });
}
