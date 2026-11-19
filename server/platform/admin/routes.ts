import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { type AdminShopStatus, shopDraftInput } from "../../../src/shared/contracts/admin";
import { ApiError } from "../../../src/shared/errors";
import type { AuthSecrets } from "../../auth/config";
import { authBodyLimit, authCommand, validationFailure } from "../../auth/request";
import type { CommandVariables } from "../../middleware/idempotency";
import { requireAdmin } from "./access";
import { createDraft, registry, slugAvailability, storefrontUrl } from "./registry";

export const adminRoutes = new Hono<{
  Bindings: Env & AuthSecrets;
  Variables: CommandVariables & { actorId: string };
}>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    const actor = await requireAdmin(c.env.PLATFORM, c.env, c.req.raw);
    c.set("actorId", actor.id);
    await next();
  })
  .get("/shops", async (c) => c.json(await registry(c.env.PLATFORM, c.req.raw, c.env.APP_ENV)))
  .get(
    "/shops/slug-availability",
    zValidator("query", z.object({ slug: z.string().max(63) }), validationFailure),
    async (c) => c.json(await slugAvailability(c.env.PLATFORM, c.req.valid("query").slug)),
  )
  .get("/shops/:id", async (c) => {
    const id = c.req.param("id");
    const row = await c.env.PLATFORM.withSession("first-primary")
      .prepare(`SELECT id,name,slug,status,country,currency,
      time_zone AS timeZone, version FROM shops WHERE id=? AND status IN ('draft','active','paused')`)
      .bind(id)
      .first<{
        id: string;
        name: string;
        slug: string;
        status: AdminShopStatus;
        country: string | null;
        currency: string | null;
        timeZone: string | null;
        version: number;
      }>();
    if (!row) throw new ApiError("SHOP_NOT_FOUND", "Магазин не найден");
    return c.json({ ...row, storefrontUrl: storefrontUrl(c.req.raw, c.env.APP_ENV, row.slug) });
  })
  .post("/shops", authBodyLimit, authCommand, zValidator("json", shopDraftInput, validationFailure), async (c) =>
    c.json(await createDraft(c.env.PLATFORM, c.env, c.get("actorId"), c.get("command"), c.req.valid("json")), 201),
  );
