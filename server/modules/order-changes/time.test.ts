import { beforeAll, expect, it } from "vitest";
import type { BuyerOrder } from "../../../src/shared/contracts/buyer-order";
import type { TimeChange, TimeChangeInput } from "../../../src/shared/contracts/order-changes";
import type { Schedule, TimeChoice } from "../../../src/shared/contracts/receiving-time";
import { calendarDate, shopDateTime } from "../../../src/shared/datetime";
import { getAuth, postAuth, sellerFixture } from "../../testing/auth";
import { signIn, snapshot } from "../../testing/orders";
import { setupPlatform } from "../../testing/platform";
import { catalogSql } from "../catalog/testing";

beforeAll(setupPlatform);
const timeZone = "Asia/Ho_Chi_Minh";
const day = () => calendarDate(shopDateTime(Date.now(), timeZone).date, 1);
const choice = (slotId: string) => ({ date: day(), slotId });
const first = () => choice("08:00-10:00");
const second = () => choice("10:00-12:00");

async function fixture(current: TimeChoice | null = first(), mode: "slots" | "after_order" = "slots") {
  const buyer = await signIn(snapshot.phone ?? "");
  const seller = await sellerFixture("korzina-demo-lavka");
  const periods = [
    { start: "08:00", end: "10:00", capacity: 1 },
    { start: "10:00", end: "12:00", capacity: 1 },
  ];
  const days = { mon: periods, tue: periods, wed: periods, thu: periods, fri: periods, sat: periods, sun: periods };
  const schedule: Schedule = { timeZone, pickup: { mode, days, preparationMinutes: 0, dayCutoff: "18:00" } };
  await catalogSql(
    "INSERT OR REPLACE INTO settings(key,value) VALUES('receiving_schedule',?)",
    JSON.stringify(schedule),
  );
  await catalogSql("DELETE FROM receiving_seats WHERE method='pickup' AND date=?", day());
  if (current) await seats(current);
  const [{ number }] = await catalogSql(
    "INSERT INTO orders(customer,created_at,status,payment_status,snapshot) VALUES(?,?,'accepted','unpaid',?) RETURNING number",
    buyer.subject,
    Date.now(),
    JSON.stringify({ ...snapshot, time: current, seatReserved: !!current }),
  );
  const buyerPath = `/api/orders/${number}`;
  const sellerPath = `/api/seller/orders/${number}`;
  const headers = { Cookie: buyer.Cookie };
  return {
    number,
    buyer: (input: TimeChangeInput, key = crypto.randomUUID()) =>
      postAuth(`${buyerPath}/time?shop=lavka`, input, { ...headers, "Idempotency-Key": key }),
    seller: (input: TimeChangeInput) => postAuth(`${sellerPath}/time?store=lavka`, input, seller.headers),
    availability: () => getAuth(`${sellerPath}/time?store=lavka`, seller.headers),
    detail: async () => (await getAuth(`${buyerPath}?shop=lavka`, headers)).json<BuyerOrder>(),
  };
}

function seats(time: TimeChoice, booked = 1) {
  return catalogSql(
    "INSERT OR REPLACE INTO receiving_seats(method,date,slot,booked,expires_at) VALUES('pickup',?,?,?,?)",
    time.date,
    time.slotId ?? "",
    booked,
    Date.now() + 86_400_000,
  );
}

it("§9.7, §11.5, §12.4 · встречный выбор закрывает предыдущий, старое время действует до принятия", async () => {
  const order = await fixture();
  const offer = await order.seller({ action: "propose", expectedVersion: 0, time: second() });
  expect(offer.status).toBe(200);
  const { change } = await offer.json<{ change: TimeChange }>();
  const duplicate = await order.seller({ action: "propose", expectedVersion: 1, time: second() });
  expect(await duplicate.json()).toMatchObject({ error: { code: "ANOTHER_CHANGE_PENDING" } });
  const counter = await order.buyer({ action: "counter", expectedVersion: 1, changeId: change.id, time: second() });
  expect(counter.status).toBe(200);
  const request = (await order.detail()).timeChange;
  expect(request).toMatchObject({ by: "buyer", status: "pending" });
  expect(request?.id).not.toBe(change.id);
  expect((await order.detail()).time).toEqual(first());
  if (!request) throw new Error("Нет просьбы");
  expect((await order.seller({ action: "keep", expectedVersion: 2, changeId: request.id })).status).toBe(200);
  expect(await order.detail()).toMatchObject({ time: first(), timeChange: { status: "kept" } });
  const events = await catalogSql(
    "SELECT details FROM buyer_order_events WHERE order_number=? AND event='time.pending' ORDER BY id DESC LIMIT 1",
    order.number,
  );
  expect(JSON.parse(String(events[0].details))).toMatchObject({ previous: { id: change.id, status: "superseded" } });
});

it("§9.9 · потеря слота оставляет старое время и резерв, повтор успешного ответа резервирует один раз", async () => {
  const order = await fixture();
  expect(await (await order.availability()).json()).toMatchObject({ timeZone });
  expect((await order.seller({ action: "propose", expectedVersion: 0, time: second() })).status).toBe(200);
  const { timeChange } = await order.detail();
  if (!timeChange) throw new Error("Нет предложения");
  const accept = { action: "accept", expectedVersion: 1, changeId: timeChange.id } as const;
  await seats(second());
  expect(await (await order.buyer(accept)).json()).toMatchObject({ error: { code: "SLOT_TAKEN" } });
  expect((await order.detail()).time).toEqual(first());
  expect(
    await catalogSql(
      "SELECT booked FROM receiving_seats WHERE method='pickup' AND date=? AND slot=?",
      day(),
      first().slotId ?? "",
    ),
  ).toEqual([{ booked: 1 }]);
  await seats(second(), 0);
  const key = crypto.randomUUID();
  const applied = await order.buyer(accept, key);
  expect(applied.status).toBe(200);
  expect(await (await order.buyer(accept, key)).json()).toEqual(await applied.json());
  expect(await order.detail()).toMatchObject({ time: second(), totalMinor: snapshot.totalMinor });
  expect(
    await catalogSql("SELECT booked FROM receiving_seats WHERE method='pickup' AND date=? ORDER BY slot", day()),
  ).toEqual([{ booked: 0 }, { booked: 1 }]);
});

it("§11.6 · продавец сразу ставит свободное время заказу без окна, цена сохраняется", async () => {
  const order = await fixture(null, "after_order");
  expect((await order.seller({ action: "propose", expectedVersion: 0, time: second() })).status).toBe(200);
  expect(await order.detail()).toMatchObject({
    time: second(),
    timeChange: { status: "accepted" },
    totalMinor: snapshot.totalMinor,
  });
});
