import { exports } from "cloudflare:workers";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { botChange, shopChange, shopDraftInput } from "../../../src/shared/contracts/admin";
import { ApiError } from "../../../src/shared/errors";
import type { AuthSecrets } from "../../auth/config";
import { authBodyLimit, authCommand, validationFailure } from "../../auth/request";
import { type CommandVariables, idempotency } from "../../middleware/idempotency";
import { invalidateShopAddress } from "../resolve-shop";
import { shopContexts } from "../shop-context";
import { requireAdmin } from "./access";
import { createDraft, registry, slugAvailability } from "./registry";
import { botCoordinator } from "./shop-bot";
import { changeShop } from "./shop-change";
import { managedShop, shopDetail } from "./shop-detail";

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
    const shop = await managedShop(c.env.PLATFORM, id);
    const stats = await exports.Shop.get(exports.Shop.idFromName(id)).adminShopStats();
    const detail = await shopDetail(c.env.PLATFORM, c.env, c.req.raw, shop, stats.products, c.get("actorId"));
    const readiness =
      shop.status === "draft" ? await exports.Shop.get(exports.Shop.idFromName(id)).launchReadiness(id) : undefined;
    return c.json({ ...detail, readiness });
  })
  .patch("/shops/:id", authBodyLimit, idempotency, zValidator("json", shopChange, validationFailure), async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const current =
      input.action === "data" || input.action === "status" ? await managedShop(c.env.PLATFORM, id) : undefined;
    const locked =
      input.action === "data"
        ? (await exports.Shop.get(exports.Shop.idFromName(id)).adminShopStats()).hasOrders
        : false;
    const mutation = { id, actor: c.get("actorId"), command: c.get("command"), version: input.version };
    let result: { id: string; version: number };
    if (input.action === "status" && input.status === "active" && current?.status === "draft") {
      const response = await exports.Shop.get(exports.Shop.idFromName(id)).launchDraft(id, {
        actor: mutation.actor,
        via: "admin",
        command: mutation.command,
        version: input.version,
        force: input.force,
      });
      if (!response.ok) throw new ApiError(response.code, response.message, response.details);
      result = { id, version: response.result.version };
    } else {
      result = await changeShop(c.env.PLATFORM, mutation, input, c.env, locked);
    }
    shopContexts.invalidate(id);
    if (current) {
      const changedAddress = input.action === "data" && input.slug && input.slug !== current.slug;
      await Promise.all([
        invalidateShopAddress(c.env.APP_ENV, current.slug),
        ...(changedAddress && input.slug ? [invalidateShopAddress(c.env.APP_ENV, input.slug)] : []),
      ]).catch(() => {});
    }
    return c.json(result);
  })
  .post("/shops/:id/bot", authBodyLimit, authCommand, zValidator("json", botChange, validationFailure), async (c) => {
    const input = c.req.valid("json");
    const mutation = {
      id: c.req.param("id"),
      actor: c.get("actorId"),
      command: c.get("command"),
      version: input.version,
    };
    const result = await exports.Shop.get(exports.Shop.idFromName(botCoordinator)).adminBotChange(
      mutation,
      input,
      new URL(c.req.url).origin,
    );
    if (!result.ok) throw new ApiError(result.code, result.message);
    return c.json(result.result);
  })
  .post("/shops", authBodyLimit, authCommand, zValidator("json", shopDraftInput, validationFailure), async (c) =>
    c.json(await createDraft(c.env.PLATFORM, c.env, c.get("actorId"), c.get("command"), c.req.valid("json")), 201),
  );
