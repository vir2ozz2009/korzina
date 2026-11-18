import { queryOptions, useQuery } from "@tanstack/react-query";
import { bootstrap } from "../../app/bootstrap";
import { queryPolicy } from "../../app/query-defaults";
import { checkResponse } from "../../shared/http-error";
import { shopApi, shopKey } from "../../shared/shop-api";
import { resolveDocumentImage } from "./document-images";

function productQuery(id: string) {
  return queryOptions({
    queryKey: ["shop", shopKey, "product", id],
    // Full product includes stock/price, so it follows the live policy.
    ...queryPolicy.stock,
    queryFn: async ({ signal }) => {
      const response = await shopApi.api.catalog.products[":id"].$get({ param: { id } }, { init: { signal } });
      await checkResponse(response);
      const result = await response.json();
      const origin = bootstrap?.mediaOrigin ?? "";
      return {
        ...result,
        recommendations: {
          ...result.recommendations,
          items: result.recommendations.items.map((item) => ({
            ...item,
            image: resolveDocumentImage(item.image, origin),
          })),
        },
      };
    },
  });
}
export const useProduct = (id: string) => useQuery(productQuery(id));
