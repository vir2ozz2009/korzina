import { exports } from "cloudflare:workers";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { emptyInput } from "../../../src/shared/contracts/auth";
import { notificationChange, staffAccess, staffUpdate, staffVersion } from "../../../src/shared/contracts/staff";
import { ApiError } from "../../../src/shared/errors";
import type { AuthSecrets } from "../../auth/config";
import { authBodyLimit, validationFailure } from "../../auth/request";
import { authenticateSeller, requirePermission, requireRole, type SellerEnv } from "../../auth/roles";
import { type CommandVariables, idempotency } from "../../middleware/idempotency";
import { scheduleSellerCleanup } from "../cleanup";
import { auditFilters, readTeamAudit } from "./audit";
import { staffBot, staffBotStatus } from "./bot";
import { createStaffInvite, listStaffInvites, readStaffInvite, revokeStaffInvite } from "./invitations";
import { getTeam, getTeamMember, revokeTeamMember, updateTeamMember } from "./members";
import { changeNotification, staffNotificationSettings } from "./notifications";
import { sendStaffTest } from "./test-message";

type TeamEnv = { Bindings: Env & AuthSecrets; Variables: SellerEnv["Variables"] & CommandVariables };
const memberId = z.object({ id: z.string().min(1).max(64) });
const inviteId = z.object({ id: z.uuid() });
const page = z.object({ after: z.string().max(64).optional() });
const owner = requireRole("owner");
const context = (c: Context<TeamEnv>) => ({
  shop: c.get("shopId"),
  actor: c.get("seller").accountId,
  command: c.get("command"),
  now: Date.now(),
});
function expireSubscription(c: Context<TeamEnv>, id: string) {
  const shop = c.get("shopId");
  c.executionCtx.waitUntil(exports.Shop.get(exports.Shop.idFromName(shop)).closeSellerOrderSubscription(id));
}

export const teamRoutes = new Hono<TeamEnv>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    const slug = c.req.query("store");
    if (!slug || !/^[a-z0-9-]{1,63}$/u.test(slug)) throw new ApiError("VALIDATION", "Выберите магазин");
    const id = await c.env.PLATFORM.withSession("first-primary")
      .prepare("SELECT id FROM shops WHERE slug=? AND status IN ('draft','active','paused')")
      .bind(slug)
      .first<string>("id");
    if (!id) throw new ApiError("SHOP_NOT_FOUND", "Магазин не найден");
    c.set("shopId", id);
    await next();
  })
  .use("*", authenticateSeller)
  .get("/bot", async (c) => c.json(await staffBotStatus(c.env.PLATFORM, c.get("shopId"), c.get("seller").accountId)))
  .get("/notifications", requirePermission("shop_settings"), async (c) => {
    const shop = c.get("shopId");
    const bot = await staffBot(c.env.PLATFORM, shop);
    return c.json(await staffNotificationSettings(c.env.PLATFORM, shop, bot?.id ?? ""));
  })
  .put(
    "/notifications",
    requirePermission("shop_settings"),
    authBodyLimit,
    idempotency,
    zValidator("json", notificationChange, validationFailure),
    async (c) => {
      const bot = await staffBot(c.env.PLATFORM, c.get("shopId"));
      return c.json(await changeNotification(c.env.PLATFORM, context(c), bot?.id ?? "", c.req.valid("json")));
    },
  )
  .get("/audit", requirePermission("shop_audit"), zValidator("query", auditFilters, validationFailure), async (c) =>
    c.json(await readTeamAudit(c.env.PLATFORM, c.get("shopId"), c.req.valid("query"))),
  )
  .get("/members", owner, zValidator("query", page, validationFailure), async (c) =>
    c.json(await getTeam(c.env.PLATFORM, c.get("shopId"), c.req.valid("query").after)),
  )
  .get("/members/:id", owner, zValidator("param", memberId, validationFailure), async (c) =>
    c.json(await getTeamMember(c.env.PLATFORM, c.get("shopId"), c.req.valid("param").id)),
  )
  .put(
    "/members/:id",
    owner,
    authBodyLimit,
    idempotency,
    zValidator("param", memberId, validationFailure),
    zValidator("json", staffUpdate, validationFailure),
    async (c) => {
      const { id } = c.req.valid("param");
      const { version, access } = c.req.valid("json");
      const after = await updateTeamMember(c.env.PLATFORM, context(c), id, version, access);
      if (!after.permissions.includes("orders")) expireSubscription(c, id);
      return c.json(after);
    },
  )
  .post(
    "/members/:id/revoke",
    owner,
    authBodyLimit,
    idempotency,
    zValidator("param", memberId, validationFailure),
    zValidator("json", staffVersion, validationFailure),
    async (c) => {
      const { id } = c.req.valid("param");
      const result = await revokeTeamMember(c.env.PLATFORM, context(c), id, c.req.valid("json").version);
      expireSubscription(c, id);
      return c.json(result);
    },
  )
  .post(
    "/members/:id/test",
    owner,
    authBodyLimit,
    idempotency,
    zValidator("param", memberId, validationFailure),
    zValidator("json", emptyInput, validationFailure),
    async (c) => c.json(await sendStaffTest(c.env.PLATFORM, c.env, context(c), c.req.valid("param").id)),
  )
  .get("/invites", owner, zValidator("query", page, validationFailure), async (c) =>
    c.json(await listStaffInvites(c.env.PLATFORM, c.get("shopId"), Date.now(), c.req.valid("query").after)),
  )
  .get("/invites/:id", owner, zValidator("param", inviteId, validationFailure), async (c) =>
    c.json(
      await readStaffInvite(c.env.PLATFORM, c.get("shopId"), c.req.valid("param").id, c.env.ENCRYPTION_KEY, Date.now()),
    ),
  )
  .post(
    "/invites",
    owner,
    authBodyLimit,
    idempotency,
    zValidator("json", staffAccess, validationFailure),
    async (c) => {
      const invitation = await createStaffInvite(c.env.PLATFORM, c.env, context(c), c.req.valid("json"));
      c.executionCtx.waitUntil(scheduleSellerCleanup());
      return c.json(invitation, 201);
    },
  )
  .post(
    "/invites/:id/revoke",
    owner,
    authBodyLimit,
    idempotency,
    zValidator("param", inviteId, validationFailure),
    zValidator("json", emptyInput, validationFailure),
    async (c) => c.json(await revokeStaffInvite(c.env.PLATFORM, context(c), c.req.valid("param").id)),
  );
