import { exports } from "cloudflare:workers";
import worker, { Shop as Store } from "../server";
import { sellerCookie, sessionCookie } from "../server/auth/cookies";
import { newToken, tokenHash } from "../server/auth/tokens";
import catalog from "../server/demo-catalog.json";
import { telegramMessage } from "../server/modules/seller-orders/notifications";

export { app } from "../server";

const path = "/__e2e/test2/tomatoes";
const sellerPath = "/__e2e/test2/seller";
const orderMessagePath = "/__e2e/test2/order-message";
const shopId = "korzina-demo-test2";

export class Shop extends Store {
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
    if (url.pathname !== path && url.pathname !== sellerPath && url.pathname !== orderMessagePath)
      return worker.fetch(request, env, ctx);
    if (
      url.hostname !== "127.0.0.1" ||
      request.method !== "POST" ||
      request.headers.has("Origin") ||
      env.APP_ENV !== "demo"
    )
      return new Response(null, { status: 404 });
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
    const namespace = exports.Shop as unknown as DurableObjectNamespace<Shop>;
    const shop = namespace.get(namespace.idFromName(shopId));
    if (url.pathname === orderMessagePath) {
      const number = Number(url.searchParams.get("number"));
      const now = Number(url.searchParams.get("now"));
      if (!Number.isSafeInteger(number) || number < 1 || !Number.isSafeInteger(now) || now < 1)
        return new Response(null, { status: 400 });
      return new Response(await shop.e2eOrderMessage(number, now));
    }
    const change = await request.text();
    if (change !== "change" && change !== "restore") return new Response(null, { status: 400 });
    await shop.setE2eTomatoOffer(change === "change");
    return new Response(null, { status: 204 });
  },
};
