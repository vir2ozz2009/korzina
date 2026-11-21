import type { Context } from "hono";
import type { CatalogListInput } from "../../../src/shared/contracts/catalog-list";
import type { ShopInfo } from "../../../src/shared/contracts/shop";
import { ApiError, errorStatus } from "../../../src/shared/errors";
import type { FeatureState } from "../../../src/shared/flags";
import { forwardToShop } from "../../shop/forward";
import { cachedDocument } from "./cache";
import { readPage } from "./page";
import type { readSelection } from "./selection";
import type { readDocument, readLive } from "./service";

export async function pageGateway(
  c: Context<{ Bindings: Env }>,
  shop: ShopInfo & { features: FeatureState; teamPreview?: boolean },
  input: CatalogListInput,
) {
  const request = (path: string, query: URLSearchParams) => {
    const url = new URL(c.req.url);
    url.pathname = `/api/catalog/${path}`;
    url.search = query.toString();
    const headers = new Headers(c.req.raw.headers);
    headers.delete("If-None-Match");
    return new Request(url, { headers });
  };
  const decode = async <T>(response: Response): Promise<T> => {
    if (!response.ok) {
      const body = await response
        .json<{ error?: { code?: keyof typeof errorStatus; message?: string } }>()
        .catch(() => null);
      if (body?.error?.code && Object.hasOwn(errorStatus, body.error.code))
        throw new ApiError(body.error.code, body.error.message ?? "Не удалось загрузить каталог");
      throw new Error(`Catalog upstream ${response.status}`);
    }
    return response.json<T>();
  };
  return readPage(
    input,
    async (params) => {
      const query = new URLSearchParams({ limit: String(params.limit) });
      for (const [key, value] of Object.entries(params)) if (value !== undefined) query.set(key, String(value));
      const raw = request("document", query);
      const load = () => forwardToShop({ req: { raw } }, shop);
      return decode<ReturnType<typeof readDocument>>(
        await (shop.teamPreview ? load() : cachedDocument(raw, params, c.env.APP_ENV, shop.id, load)),
      );
    },
    async (ids) =>
      decode<ReturnType<typeof readLive>>(
        await forwardToShop(
          { req: { raw: request("page-offers", new URLSearchParams({ ids: ids.join(",") })) } },
          shop,
        ),
      ),
    async (params) => {
      const q = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) if (value !== undefined) q.set(key, String(value));
      return decode<ReturnType<typeof readSelection>>(
        await forwardToShop({ req: { raw: request("selection", q) } }, shop),
      );
    },
  );
}
