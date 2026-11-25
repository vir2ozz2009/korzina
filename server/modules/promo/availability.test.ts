import { env, exports } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";
import { newToken, tokenHash } from "../../auth/tokens";
import { shopRecord, shopStatements } from "../../platform/create-shop";
import { featureStatement } from "../../platform/features";
import { demoSeedShopIds, seedStatements } from "../../platform/seed";
import { shopContexts } from "../../platform/shop-context";
import { cookieFrom, getAuth, postAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";

const existing = { id: demoSeedShopIds[1], slug: "test2" };
const terms = {
  name: "Учебный выпуск 12.1",
  kind: "code",
  code: "RELEASE12",
  scope: { type: "all" },
  confirmed: false,
};

beforeAll(setupPlatform);

async function session(id: string, teamRole: "manager" | "picker" | null = null) {
  const token = newToken();
  const account = crypto.randomUUID();
  const db = env.PLATFORM;
  await db.batch([
    db.prepare("INSERT INTO accounts(id,telegram_id) VALUES(?,?)").bind(account, account.replace(/\D/gu, "")),
    db
      .prepare("INSERT INTO memberships(shop_id,account_id,role,permissions,team_role) VALUES(?,?,?,'[]',?)")
      .bind(id, account, teamRole ? "employee" : "owner", teamRole),
    db
      .prepare("INSERT INTO seller_sessions(token_hash,account_id,shop_id,expires_at) VALUES(?,?,?,?)")
      .bind(await tokenHash(token), account, id, Date.now() + 60000),
  ]);
  return { Authorization: `Bearer ${token}` };
}

const offers = (slug: string) => `/api/seller/promotions?store=${slug}`;
async function buyer(slug: string, amount: number) {
  const url = (path: string) => `/api/${path}?shop=${slug}`;
  const guest = await postAuth(url("auth/guest"));
  expect(guest.status).toBe(201);
  const headers = { Cookie: cookieFrom(guest) };
  const added = await postAuth(url("cart"), { variantId: "sku-01", quantity: 1, expectedRevision: 0 }, headers);
  expect(added.status).toBe(200);
  const input = { promoAction: "apply", code: terms.code, expectedRevision: 1 };
  const response = await postAuth(url("cart"), input, headers);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    adjustments: [{ kind: "promotion", amount: -amount }],
    promo: { reason: "applied" },
  });
  return { headers, url };
}

it("NEW_FEATURE §3 и §8: старый и новый active наследуют, исключение переживает повтор сида, роли и магазины изолированы", async () => {
  const fresh = shopRecord("promo-ready", "Учебный магазин");
  const db = env.PLATFORM;
  await db.batch(
    shopStatements(fresh, "draft", "promo-ready.demo.korzina.app").map(({ sql, params }) =>
      db.prepare(sql).bind(...params),
    ),
  );
  await db.prepare("UPDATE shops SET status='active' WHERE id=?").bind(fresh.id).run();
  await exports.Shop.get(exports.Shop.idFromName(fresh.id)).seedDemoCatalog(fresh.id);
  const owner = await session(existing.id);
  const manager = await session(fresh.id, "manager");
  const picker = await session(fresh.id, "picker");
  const cabinet = (slug: string, headers: HeadersInit) => getAuth(`/api/seller/cabinet?store=${slug}`, headers);
  for (const [shop, headers, value] of [
    [existing, owner, 3000],
    [fresh, manager, 7000],
  ] as const) {
    expect(await (await cabinet(shop.slug, headers)).json()).toMatchObject({ current: { promotions: true } });
    expect((await getAuth(offers(shop.slug), headers)).status).toBe(200);
    expect(
      (
        await postAuth(
          offers(shop.slug),
          { action: "publish", revision: 0, terms: { ...terms, discount: { type: "fixed", value } } },
          headers,
        )
      ).status,
    ).toBe(200);
  }
  const oldCart = await buyer(existing.slug, 3000);
  const newCart = await buyer(fresh.slug, 7000);
  expect(await (await cabinet(fresh.slug, picker)).json()).toMatchObject({ current: { promotions: false } });
  expect((await getAuth(offers(fresh.slug), picker)).status).toBe(403);
  expect((await getAuth(offers(fresh.slug), owner)).status).toBe(403);
  const off = featureStatement(fresh.slug, "promotions", false);
  await db
    .prepare(off.sql)
    .bind(...off.params)
    .run();
  for (let release = 0; release < 2; release++) {
    await db.batch(seedStatements.map(({ sql, params }) => db.prepare(sql).bind(...params)));
    expect(await (await cabinet(fresh.slug, manager)).json()).toMatchObject({ current: { promotions: false } });
    const denied = await getAuth(offers(fresh.slug), manager);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: { code: "FEATURE_DISABLED" } });
  }
  expect(await (await getAuth(oldCart.url("cart"), oldCart.headers)).json()).toMatchObject({
    adjustments: [{ kind: "promotion", amount: -3000 }],
  });
  expect(
    await db
      .prepare("SELECT enabled FROM feature_overrides WHERE shop_id=? AND key='promotions'")
      .bind(fresh.id)
      .first(),
  ).toEqual({ enabled: 0 });
  shopContexts.invalidate(fresh.id);
  expect(await (await getAuth(newCart.url("shop"))).json()).toMatchObject({ features: { promotions: false } });
  expect(
    (await postAuth(newCart.url("cart"), { promoAction: "remove", expectedRevision: 2 }, newCart.headers)).status,
  ).toBe(403);
  expect(await (await getAuth(newCart.url("cart"), newCart.headers)).json()).toMatchObject({ adjustments: [] });
  await db.prepare("UPDATE feature_overrides SET enabled=1 WHERE shop_id=? AND key='promotions'").bind(fresh.id).run();
  expect(await (await getAuth(offers(fresh.slug), manager)).json()).toMatchObject({
    offers: [{ status: "active", terms: { code: terms.code } }],
  });
  shopContexts.invalidate(fresh.id);
  expect(await (await getAuth(newCart.url("cart"), newCart.headers)).json()).toMatchObject({
    adjustments: [{ kind: "promotion", amount: -7000 }],
  });
});
