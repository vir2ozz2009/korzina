import { Hono } from "hono";
import { ApiError } from "../../../src/shared/errors";
import { authenticateSeller, requirePermission, requireRole, type SellerEnv } from "../../auth/roles";
import { resolveShop } from "../resolve-shop";

export const sellerAccess = new Hono<SellerEnv>()
  .use("*", async (c, next) => {
    const shop = await resolveShop(c.req.raw, c.env.PLATFORM);
    if (!shop) throw new ApiError("SHOP_NOT_FOUND", "Магазин не найден");
    c.set("shopId", shop.id);
    await next();
  })
  .use("*", authenticateSeller)
  .get("/", (c) => c.json(c.get("seller")))
  .get("/orders", requirePermission("orders"), (c) => c.json({ allowed: true }))
  .get("/payments", requirePermission("payments"), (c) => c.json({ allowed: true }))
  .get("/team", requireRole("owner"), (c) => c.json({ allowed: true }));
