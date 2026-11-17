import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { beforeAll, expect, it } from "vitest";
import { resolveFeatures } from "../../../src/shared/flags";
import { newToken, tokenHash } from "../../auth/tokens";
import { setupPlatform } from "../../testing/platform";
import { createCustomer } from "../auth/service";
import { mediaRoutes } from "./routes";

beforeAll(setupPlatform);
it("приватная ссылка требует актуальных прав сотрудника; temp доступен только владельцу", async () => {
  const shopId = `f9-access-${crypto.randomUUID()}`;
  const account = crypto.randomUUID();
  const token = newToken();
  await env.PLATFORM.batch([
    env.PLATFORM.prepare("INSERT INTO shops (id,slug,name,created_at) VALUES (?,?,?,0)").bind(shopId, shopId, "Test"),
    env.PLATFORM.prepare("INSERT INTO accounts (id) VALUES (?)").bind(account),
    env.PLATFORM.prepare(
      "INSERT INTO memberships (shop_id,account_id,role,permissions) VALUES (?,?,'employee','[\"payments\"]')",
    ).bind(shopId, account),
    env.PLATFORM.prepare("INSERT INTO seller_sessions (token_hash,account_id,expires_at) VALUES (?,?,?)").bind(
      await tokenHash(token),
      account,
      Date.now() + 100_000,
    ),
  ]);
  await runInDurableObject(exports.Shop.get(exports.Shop.idFromName(shopId)), async (_instance, ctx) => {
    const db = drizzle(ctx.storage);
    const bindings = {
      shop: { id: shopId, slug: shopId, name: "Test", status: "active", plan: "base", createdAt: 0 },
      features: resolveFeatures([]),
      db,
      storage: ctx.storage,
      platform: env.PLATFORM,
      media: env,
      secrets: { MEDIA_SIGNING_KEY: "synthetic-test-only" },
    };
    const buyer = await createCustomer(db);
    const other = await createCustomer(db);
    const call = (path: string, actor: string, input?: object | string) => {
      const url = new URL(path, "https://demo.korzina.app");
      url.pathname = url.pathname.replace(/^\/api\/media/, "");
      return mediaRoutes.fetch(
        new Request(url, {
          method: input ? "POST" : "GET",
          headers: {
            Authorization: `Bearer ${actor}`,
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: typeof input === "string" ? input : input ? JSON.stringify(input) : undefined,
        }),
        bindings,
      );
    };
    const upload = await call("/upload?purpose=receipt", buyer.token, "%PDF-synthetic");
    expect(upload.status).toBe(201);
    const { id } = await upload.json<{ id: string }>();
    expect((await call(`/${id}/link?as=seller`, token)).status).toBe(403);
    expect((await call(`/${id}/state`, buyer.token, { action: "attach" })).status).toBe(200);
    const link = await call(`/${id}/link?as=seller`, token);
    expect(link.status).toBe(200);
    const { url } = await link.json<{ url: string }>();
    expect((await call(url, token)).status).toBe(200);
    const foreign = new URL(url);
    foreign.searchParams.delete("as");
    expect((await call(foreign.toString(), other.token)).status).toBe(403);
    await env.PLATFORM.prepare("UPDATE memberships SET permissions='[]' WHERE shop_id=? AND account_id=?")
      .bind(shopId, account)
      .run();
    expect((await call(url, token)).status).toBe(403);
    expect((await call(`/${id}/link?as=seller`, token)).status).toBe(403);
    await env.PLATFORM.prepare("UPDATE memberships SET revoked_at=? WHERE shop_id=? AND account_id=?")
      .bind(Date.now(), shopId, account)
      .run();
    expect((await call(`/${id}/link?as=seller`, token)).status).toBe(403);
    const buyerLink = await call(`/${id}/link`, buyer.token);
    const privateUrl = (await buyerLink.json<{ url: string }>()).url;
    const invalid = new URL(privateUrl);
    invalid.searchParams.set("expires", "1");
    expect((await call(invalid.toString(), buyer.token)).status).toBe(403);
  });
});
