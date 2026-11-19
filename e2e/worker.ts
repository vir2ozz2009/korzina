import { exports } from "cloudflare:workers";
import worker, { Shop as Store } from "../server";
import catalog from "../server/demo-catalog.json";

export { app } from "../server";

const path = "/__e2e/test2/tomatoes";
const shopId = "korzina-demo-test2";

export class Shop extends Store {
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
    if (url.pathname !== path) return worker.fetch(request, env, ctx);
    if (
      url.hostname !== "127.0.0.1" ||
      request.method !== "POST" ||
      request.headers.has("Origin") ||
      env.APP_ENV !== "demo"
    )
      return new Response(null, { status: 404 });
    const change = await request.text();
    if (change !== "change" && change !== "restore") return new Response(null, { status: 400 });
    const namespace = exports.Shop as unknown as DurableObjectNamespace<Shop>;
    await namespace.get(namespace.idFromName(shopId)).setE2eTomatoOffer(change === "change");
    return new Response(null, { status: 204 });
  },
};
