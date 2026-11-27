import { expect, it, vi } from "vitest";
import type { Cart } from "../../../src/shared/contracts/cart";
import { calendarDate, defaultShopTimeZone, shopDayStart } from "../../../src/shared/datetime";
import { getAuth, sellerFixture } from "../../testing/auth";
import { beforeFrozenClock } from "../../testing/clock";
import { catalogSql } from "../catalog/testing";
import { buy, customer } from "../checkout/testing";
import { readCart, seller, shop } from "./cart-followup-fixture";

beforeFrozenClock();
it.each(["automatic", "code"] as const)(
  "A6 §12C · %s: обе даты включены, за пределами периода льготы нет",
  async (kind) => {
    await catalogSql(
      "UPDATE settings SET value=? WHERE key='fulfillment'",
      JSON.stringify({
        delivery: { mode: "text", payee: "shop", tariff: { kind: "fixed", feeMinor: 12000 } },
      }),
    );
    const { headers } = await sellerFixture(shop);
    const list = await (await getAuth("/api/seller/promotions?store=lavka", headers)).json<{ timeZone?: string }>();
    const zone = list.timeZone ?? defaultShopTimeZone;
    const date = "2026-11-19";
    const start = shopDayStart(date, zone);
    const end = shopDayStart(calendarDate(date, 1), zone);
    expect(
      (
        await seller(headers, {
          action: "publish",
          revision: 0,
          terms: {
            name: "Доставка сегодня",
            delivery: true,
            kind,
            ...(kind === "code" && { code: "TODAY" }),
            minimumMinor: 1,
            confirmed: false,
            discount: { type: "fixed", value: 0 },
            scope: { type: "all" },
            fromDate: date,
            throughDate: date,
          },
        })
      ).status,
    ).toBe(200);
    const cookie = await customer("sku-01", { mode: "delivery", address: "Учебный адрес", apartment: "1" });
    if (kind === "code")
      expect(
        (
          await buy(
            "cart",
            { promoAction: "apply", code: "TODAY", expectedRevision: (await readCart(cookie)).revision },
            cookie,
          )
        ).status,
      ).toBe(200);
    for (const [at, applied] of [
      [start - 1, false],
      [start, true],
      [end - 1, true],
      [end, false],
    ] as const) {
      vi.setSystemTime(at);
      const cart: Cart = await readCart(cookie);
      expect(!!cart.delivery?.benefit).toBe(applied);
      if (applied) expect(cart.delivery?.feeMinor).toBe(0);
    }
    expect(await catalogSql("SELECT COUNT(*) AS n FROM promo_uses")).toEqual([{ n: 0 }]);
  },
);
