import { exports } from "cloudflare:workers";
import worker, { Shop as Store } from "../server";
import { sellerCookie, sessionCookie } from "../server/auth/cookies";
import { newToken, tokenHash } from "../server/auth/tokens";
import catalog from "../server/demo-catalog.json";
import { expandNewOrders, telegramMessage } from "../server/modules/seller-orders/notifications";
import { invalidateShopAddress } from "../server/platform/resolve-shop";
import { schedulePlatformOrders } from "../server/shop/order-projection";
import { weekdays } from "../src/shared/contracts/receiving-time";

import { receiveE2eStaffInvite } from "./staff-invite-fixture";

export { app } from "../server";

const path = "/__e2e/test2/tomatoes";
const sellerPath = "/__e2e/test2/seller";
const staffInvitePath = "/__e2e/test2/staff-invite";
const orderMessagePath = "/__e2e/test2/order-message";
const workdayPath = "/__e2e/test2/workday";
const shopStatusPath = "/__e2e/test2/status";
const shopId = "korzina-demo-test2";

export class Shop extends Store {
  private previousSchedule: string | undefined;

  private get isTestShop() {
    return this.ctx.exports.Shop.idFromName(shopId).equals(this.ctx.id);
  }

  protected override async dispatchOrderNotifications() {
    if (!this.isTestShop) return super.dispatchOrderNotifications();
    // Exercise real recipient selection and enqueueing while leaving the messages
    // in the local outbox for inspection.
    const storage = this.ctx.storage;
    if (await expandNewOrders(storage, this.env, shopId, Date.now())) await schedulePlatformOrders(storage);
  }

  async setE2eWorkday(action: "setup" | "empty" | "restore") {
    if (!this.isTestShop) throw new Error("Wrong test shop");
    const sql = this.ctx.storage.sql;
    if (action === "restore") {
      if (this.previousSchedule !== undefined)
        sql.exec("UPDATE settings SET value=? WHERE key='receiving_schedule'", this.previousSchedule);
      this.previousSchedule = undefined;
      return;
    }
    this.previousSchedule ??= sql
      .exec<{ value: string }>("SELECT value FROM settings WHERE key='receiving_schedule'")
      .one().value;
    // Keep a future window on the shop's current day regardless of the runner's time.
    const offset = ((9 - new Date().getUTCHours() + 36) % 24) - 12;
    const timeZone = offset === 0 ? "Etc/UTC" : `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset)}`;
    const pickup = {
      mode: "slots",
      days:
        action === "empty" ? {} : Object.fromEntries(weekdays.map((day) => [day, [{ start: "12:00", end: "13:00" }]])),
      preparationMinutes: 0,
    };
    sql.exec(
      "UPDATE settings SET value=? WHERE key='receiving_schedule'",
      JSON.stringify({ ...JSON.parse(this.previousSchedule), timeZone, pickup }),
    );
  }

  e2eQueuedOrderMessage(number: number, now: number) {
    if (!this.isTestShop) throw new Error("Wrong test shop");
    const storage = this.ctx.storage;
    const event = storage.sql
      .exec<Parameters<typeof telegramMessage>[3]>(
        "SELECT kind,order_number,recipient,amount,currency FROM order_notification_outbox WHERE order_number=? AND kind='new' AND recipient='990000001'",
        number,
      )
      .toArray()[0];
    return event
      ? {
          recipient: event.recipient,
          text: telegramMessage(storage, "http://127.0.0.1", "test2", event, now).text,
        }
      : null;
  }

  e2eOrderMessage(number: number, now: number) {
    if (!this.ctx.exports.Shop.idFromName(shopId).equals(this.ctx.id)) throw new Error("Wrong test shop");
    return telegramMessage(
      this.ctx.storage,
      "http://127.0.0.1",
      "test2",
      { kind: "new", order_number: number, recipient: "990000001", amount: 0, currency: "VND" },
      now,
    ).text;
  }

  setE2eTomatoOffer(changed: boolean) {
    if (!this.ctx.exports.Shop.idFromName(shopId).equals(this.ctx.id)) throw new Error("Wrong test shop");
    const original = catalog.products.find(({ id }) => id === 1);
    if (!original) throw new Error("Missing test tomatoes");
    this.ctx.storage.sql.exec(
      "UPDATE variants SET price_minor=?, stock=? WHERE id='sku-01'",
      changed ? 52000 : original.price,
      changed ? 1 : original.stock,
    );
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (
      env.LOCAL_E2E === "1" &&
      url.hostname === "127.0.0.1" &&
      url.searchParams.get("store") === "test2" &&
      /^\/api\/seller\/team\/invites(?:\/|$)/.test(url.pathname)
    )
      return worker.fetch(
        request,
        {
          ...env,
          PLATFORM_BOT_USERNAME: "korzinaapp_demo_bot",
          PLATFORM_BOT_TOKEN: "local-e2e-placeholder",
          ENCRYPTION_KEY: "ab".repeat(32),
        } as Env,
        ctx,
      );
    if (
      url.pathname !== path &&
      url.pathname !== sellerPath &&
      url.pathname !== staffInvitePath &&
      url.pathname !== orderMessagePath &&
      url.pathname !== shopStatusPath &&
      url.pathname !== workdayPath
    )
      return worker.fetch(request, env, ctx);
    if (
      url.hostname !== "127.0.0.1" ||
      request.method !== "POST" ||
      request.headers.has("Origin") ||
      env.APP_ENV !== "demo"
    )
      return new Response(null, { status: 404 });
    if (url.pathname === staffInvitePath) return receiveE2eStaffInvite(request, env, shopId);
    if (url.pathname === sellerPath) {
      const account = "e2e-seller";
      const token = newToken();
      await env.PLATFORM.batch([
        env.PLATFORM.prepare("INSERT OR IGNORE INTO accounts(id,telegram_id) VALUES(?,'990000001')").bind(account),
        env.PLATFORM.prepare("INSERT OR IGNORE INTO memberships(shop_id,account_id,role) VALUES(?,?,'owner')").bind(
          shopId,
          account,
        ),
        env.PLATFORM.prepare("INSERT INTO seller_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)").bind(
          await tokenHash(token),
          account,
          Date.now() + 300_000,
        ),
      ]);
      return new Response(null, {
        status: 204,
        headers: { "Set-Cookie": sessionCookie(request, sellerCookie, token, 300) },
      });
    }
    if (url.pathname === shopStatusPath) {
      const status = await request.text();
      if (status !== "active" && status !== "draft") return new Response(null, { status: 400 });
      await env.PLATFORM.prepare("UPDATE shops SET status=?,version=version+1 WHERE id=?").bind(status, shopId).run();
      await invalidateShopAddress(env.APP_ENV, "test2");
      return new Response(null, { status: 204 });
    }
    const namespace = exports.Shop as unknown as DurableObjectNamespace<Shop>;
    const shop = namespace.get(namespace.idFromName(shopId));
    if (url.pathname === workdayPath) {
      const action = await request.text();
      if (action !== "setup" && action !== "empty" && action !== "restore") return new Response(null, { status: 400 });
      await shop.setE2eWorkday(action);
      return new Response(null, { status: 204 });
    }
    if (url.pathname === orderMessagePath) {
      const number = Number(url.searchParams.get("number"));
      const now = Number(url.searchParams.get("now"));
      if (!Number.isSafeInteger(number) || number < 1 || !Number.isSafeInteger(now) || now < 1)
        return new Response(null, { status: 400 });
      if (url.searchParams.get("queued") === "1") {
        const message = await shop.e2eQueuedOrderMessage(number, now);
        return message ? Response.json(message) : new Response(null, { status: 404 });
      }
      return new Response(await shop.e2eOrderMessage(number, now));
    }
    const change = await request.text();
    if (change !== "change" && change !== "restore") return new Response(null, { status: 400 });
    await shop.setE2eTomatoOffer(change === "change");
    return new Response(null, { status: 204 });
  },
};
