import { exports } from "cloudflare:workers";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { openDraftInput } from "../../src/shared/contracts/launch";
import { ApiError } from "../../src/shared/errors";
import { authBodyLimit, validationFailure } from "../auth/request";
import { authenticateSeller, requirePermission, type SellerEnv } from "../auth/roles";
import { type CommandVariables, idempotency } from "../middleware/idempotency";
import { invalidateShopAddress } from "./resolve-shop";
import { shopContexts } from "./shop-context";

type EnvWithCommand = { Bindings: Env; Variables: SellerEnv["Variables"] & CommandVariables };
const storeQuery = z.object({ store: z.string().regex(/^[a-z0-9-]{1,63}$/u) });
export const launchRoutes = new Hono<EnvWithCommand>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    const slug = c.req.query("store");
    if (!slug || !/^[a-z0-9-]{1,63}$/u.test(slug)) throw new ApiError("VALIDATION", "Выберите магазин");
    const shop = await c.env.PLATFORM.withSession("first-primary")
      .prepare("SELECT id FROM shops WHERE slug=? AND status IN ('draft','active','paused')")
      .bind(slug)
      .first<string>("id");
    if (!shop) throw new ApiError("SHOP_NOT_FOUND", "Магазин не найден");
    c.set("shopId", shop);
    await next();
  })
  .use("*", authenticateSeller)
  .use("*", requirePermission("publish"))
  .get("/", zValidator("query", storeQuery, validationFailure), async (c) => {
    const shop = c.get("shopId");
    return c.json(await exports.Shop.get(exports.Shop.idFromName(shop)).launchReadiness(shop));
  })
  .post(
    "/open",
    authBodyLimit,
    idempotency,
    zValidator("query", storeQuery, validationFailure),
    zValidator("json", openDraftInput, validationFailure),
    async (c) => {
      const shop = c.get("shopId");
      const response = await exports.Shop.get(exports.Shop.idFromName(shop)).launchDraft(shop, {
        actor: c.get("seller").accountId,
        via: "seller",
        command: c.get("command"),
        revision: c.req.valid("json").revision,
      });
      if (!response.ok) throw new ApiError(response.code, response.message, response.details);
      shopContexts.invalidate(shop);
      await invalidateShopAddress(c.env.APP_ENV, response.result.slug).catch(() => {});
      return c.json(response.result);
    },
  );
