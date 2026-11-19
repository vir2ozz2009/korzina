import { beforeAll, expect, it } from "vitest";
import type { OrderSnapshot } from "../../../src/shared/contracts/checkout";
import { assertSqlBudget, type SqlMetrics } from "../../metrics";
import { cookieFrom, getAuth, postAuth } from "../../testing/auth";
import { setupPlatform } from "../../testing/platform";
import { catalogSql, shopRequest } from "../catalog/testing";

beforeAll(setupPlatform);

const snapshot: OrderSnapshot = {
  revision: 0,
  currency: "VND",
  lines: [],
  itemsMinor: 0,
  deliveryMinor: 0,
  totalMinor: 0,
  receiving: { mode: "pickup" },
  fulfillment: { mode: "pickup", available: true, pickup: { address: "45 Lê Lợi", hours: "09:00–20:00" } },
  time: null,
  phone: "+84912345678",
  telegramLinked: false,
  payment: "cash",
  paymentStatus: "unpaid",
};

async function buyer() {
  const response = await postAuth("/api/auth/contact?shop=lavka", { phone: snapshot.phone, confirmed: true });
  expect(response.status).toBe(200);
  const Cookie = cookieFrom(response);
  const { subject } = await (await getAuth("/api/auth/session?shop=lavka", { Cookie })).json<{ subject: string }>();
  return { Cookie, subject };
}

function sqlMetrics(response: Response): SqlMetrics {
  return JSON.parse(response.headers.get("x-korzina-sql") ?? "null");
}

it("при совпадении ревизии виджет выполняет один SQL и читает только сессию и ревизию", async () => {
  const { Cookie, subject } = await buyer();
  const active = (etag?: string) => shopRequest("orders/active", etag ? { Cookie, "If-None-Match": etag } : { Cookie });
  const insert = async () => {
    const [row] = await catalogSql(
      "INSERT INTO orders(customer,created_at,status,payment_status,snapshot) VALUES(?,?,'placed','unpaid',?) RETURNING number",
      subject,
      Date.now(),
      JSON.stringify(snapshot),
    );
    return row.number;
  };

  // A legacy order can exist without a revision row.
  const legacy = await insert();
  await catalogSql("DELETE FROM buyer_order_revisions WHERE customer=?", subject);
  const initial = await active();
  expect(await initial.json()).toMatchObject({ data: { orders: [{ number: legacy }] } });

  const number = await insert();
  const changed = await active(initial.headers.get("ETag") ?? "");
  expect(changed.status).toBe(200);
  expect(await changed.json()).toMatchObject({ data: { orders: [{ number }, { number: legacy }] } });
  const cachedTag = changed.headers.get("ETag") ?? "";
  expect(cachedTag).not.toBe("");

  const unchanged = await active(cachedTag);
  expect(unchanged.status).toBe(304);
  const metrics = sqlMetrics(unchanged);
  assertSqlBudget(metrics, { sql: 1, rowsRead: 2, rowsWritten: 0 });
  expect(metrics).toMatchObject({ sql: 1, rowsRead: 2 });

  const detail = await shopRequest(`orders/${number}`, { Cookie });
  expect(detail.status).toBe(200);
  expect(await detail.json()).toMatchObject({ number, stage: "placed" });
  assertSqlBudget(sqlMetrics(detail), { sql: 3, rowsWritten: 0 });
});

it("набор избранного для плиток отдаётся за один SQL в порядке добавления", async () => {
  const { Cookie, subject } = await buyer();
  await catalogSql(
    "INSERT INTO buyer_favorites(customer,product_id,added_at) VALUES(?,'product-01',1),(?,'product-02',2)",
    subject,
    subject,
  );
  const response = await shopRequest("favorites", { Cookie });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ids: ["product-02", "product-01"] });
  assertSqlBudget(sqlMetrics(response), { sql: 1, rowsWritten: 0 });
});
