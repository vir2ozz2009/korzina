import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, expect, it, vi } from "vitest";
import { placeFixtureOrder, proof } from "../../testing/orders";
import { setupPlatform } from "../../testing/platform";
import { catalogSql, catalogStub } from "../catalog/testing";
import { sendWorkdayNotifications } from "./workday-notifications";

beforeAll(setupPlatform);

it("§11.5: пересечение порога повторяется только после пополнения и только у видимого товара", async () => {
  const results = [];
  for (const stock of [8, 5, 4, 8, 0]) {
    await catalogSql("UPDATE variants SET stock=? WHERE id='sku-01'", stock);
  }
  results.push(...(await catalogSql("SELECT remaining FROM workday_notice WHERE kind='stock' ORDER BY rowid")));
  await catalogSql("UPDATE products SET visible=0 WHERE id='product-01'");
  for (const stock of [8, 5]) {
    await catalogSql("UPDATE variants SET stock=? WHERE id='sku-01'", stock);
  }
  expect(results).toEqual([{ remaining: 5 }, { remaining: 0 }]);
  expect(await catalogSql("SELECT remaining FROM workday_notice WHERE kind='stock' ORDER BY rowid")).toEqual(results);
});

it("O4, §11.7: 429 повторяется через Korzina, постоянный отказ и неизвестный исход не повторяются", async () => {
  const customer = "telegram:990000033";
  const number = await placeFixtureOrder(customer, await proof(customer, "attached"));
  await catalogSql(
    "UPDATE orders SET snapshot=json_set(snapshot,'$.telegramLinked',json('true')) WHERE number=?",
    number,
  );
  const spy = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(async () => Response.json({ ok: false, parameters: { retry_after: 120 } }, { status: 429 }))
    .mockRejectedValueOnce(new TypeError("network"))
    .mockImplementationOnce(async () => Response.json({ ok: false }, { status: 403 }))
    .mockImplementationOnce(async () => Response.json({ ok: true, result: { message_id: 1 } }));
  vi.stubGlobal("fetch", spy);
  try {
    await runInDurableObject(catalogStub(), async (_instance, { storage }) => {
      const now = Date.now();
      for (const kind of ["accepted", "ready", "completed"])
        storage.sql.exec(
          `INSERT INTO workday_notice(id,kind,order_number,recipient,expires_at)
          VALUES(?,?,?,'990000033',?)`,
          kind,
          kind,
          number,
          now + 86_400_000,
        );
      const secrets = { ...env, PLATFORM_BOT_TOKEN: "fixture-token" };
      const shop = "korzina-demo-lavka";
      await sendWorkdayNotifications(storage, secrets, shop, now);
      expect(spy).toHaveBeenCalledTimes(3);
      expect(String(spy.mock.calls[0][0])).toContain("/botfixture-token/sendMessage");
      expect(storage.sql.exec("SELECT event,outcome FROM workday_notice_delivery ORDER BY rowid").toArray()).toEqual([
        { event: "accepted", outcome: null },
        { event: "ready", outcome: "unknown" },
        { event: "completed", outcome: "failed" },
      ]);
      await sendWorkdayNotifications(storage, secrets, shop, now + 119_999);
      expect(spy).toHaveBeenCalledTimes(3);
      await sendWorkdayNotifications(storage, secrets, shop, now + 120_000);
      expect(spy).toHaveBeenCalledTimes(4);
      expect(storage.sql.exec("SELECT outcome FROM workday_notice_delivery WHERE event='accepted'").one().outcome).toBe(
        "sent",
      );
      await sendWorkdayNotifications(storage, secrets, shop, now + 86_401_000);
      expect(storage.sql.exec("SELECT COUNT(*) AS count FROM workday_notice").one().count).toBe(0);
      expect(storage.sql.exec("SELECT COUNT(*) AS count FROM workday_notice_delivery").one().count).toBe(0);
    });
  } finally {
    vi.unstubAllGlobals();
  }
});
