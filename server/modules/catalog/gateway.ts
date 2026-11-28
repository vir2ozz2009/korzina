import { createMiddleware } from "hono/factory";
import { catalogPageInput } from "../../../src/shared/contracts/catalog";
import { catalogListInput } from "../../../src/shared/contracts/catalog-list";
import { ApiError } from "../../../src/shared/errors";
import { applyDemoSeed } from "../../platform/demo-seed";
import { readFeatures } from "../../platform/features";
import { resolveShop } from "../../platform/resolve-shop";
import { authorizeBuyerShop } from "../../platform/shop-preview";
import { forwardToShop } from "../../shop/forward";
import { cachedDocument } from "./cache";
import { pageGateway } from "./page-gateway";

export const catalogGateway = createMiddleware<{ Bindings: Env }>(async (c) => {
  const shop = await resolveShop(c.req.raw, c.env.PLATFORM, c.env.APP_ENV);
  if (!shop) throw new ApiError("SHOP_NOT_FOUND", "Магазин не найден");
  if (c.env.APP_ENV === "demo") await applyDemoSeed(c.env.PLATFORM, c.env.APP_ENV, shop.id);
  const teamPreview = await authorizeBuyerShop(c.req.raw, c.env.PLATFORM, shop);
  if (c.req.method === "GET" && c.req.path === "/api/catalog/page") {
    const parsed = catalogListInput.safeParse(c.req.query());
    if (!parsed.success) throw new ApiError("VALIDATION", "Некорректные параметры каталога");
    c.header("Cache-Control", "no-store");
    return c.json(
      await pageGateway(
        c,
        { ...shop, teamPreview, features: await readFeatures(c.env.PLATFORM, shop.id) },
        parsed.data,
      ),
    );
  }
  const load = async () =>
    forwardToShop(c, { ...shop, teamPreview, features: await readFeatures(c.env.PLATFORM, shop.id) });
  if (!teamPreview && c.req.method === "GET" && c.req.path === "/api/catalog/document") {
    const parsed = catalogPageInput.safeParse(c.req.query());
    if (!parsed.success) throw new ApiError("VALIDATION", "Некорректные параметры каталога");
    return cachedDocument(c.req.raw, parsed.data, c.env.APP_ENV, shop.id, load, true);
  }
  return load();
});
