import { queryOptions, useQuery } from "@tanstack/react-query";
import { queryPolicy } from "../../app/query-defaults";
import { checkResponse } from "../../shared/http-error";
import { shopApi, shopKey } from "../../shared/shop-api";

function productQuery(id: string) {
  return queryOptions({
    queryKey: ["shop", shopKey, "product", id],
    // Full product includes stock/price, so it follows the live policy.
    ...queryPolicy.stock,
    queryFn: async ({ signal }) => {
      const response = await shopApi.api.catalog.products[":id"].$get({ param: { id } }, { init: { signal } });
      await checkResponse(response);
      return response.json();
    },
  });
}
export const useProduct = (id: string) => useQuery(productQuery(id));
