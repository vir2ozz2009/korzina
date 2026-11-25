import type { OrderSnapshot } from "../../../src/shared/contracts/checkout";
import type { PromoTerms } from "../../../src/shared/contracts/promo";
import { calendarDate, defaultShopTimeZone, shopDateTime, shopDayStart } from "../../../src/shared/datetime";

export const promoTrainingShop = "korzina-demo-promo-qa-121";
export const promoTrainingOffer = "report-boundaries";
const actor = "promo-qa-121";
const terms: PromoTerms = {
  name: "Учебная акция · Границы периода",
  kind: "automatic",
  discount: { type: "percent", value: 1000 },
  scope: { type: "all" },
  confirmed: false,
};

export function seedPromoTraining(storage: DurableObjectStorage, now = Date.now()) {
  const sql = storage.sql;
  const zone = defaultShopTimeZone;
  const today = shopDateTime(now, zone).date;
  storage.transactionSync(() => {
    if (sql.exec("SELECT 1 FROM promo_offers WHERE id=?", promoTrainingOffer).toArray().length) return;
    // Disabled on purpose. The historical purchases are visible, but no live cart can consume this offer.
    sql.exec(
      "INSERT INTO promo_offers(id,revision,state,kind,terms,actor,updated_at) VALUES(?,1,'disabled','automatic',?,?,?)",
      promoTrainingOffer,
      JSON.stringify(terms),
      actor,
      now,
    );
    for (const [index, days] of [-30, -29, -7, -6, 0].entries()) {
      const localMidnight = shopDayStart(calendarDate(today, days), zone);
      const completedAt = Math.min(now, localMidnight + 60 * 60_000);
      const discount = (index + 1) * 1_000;
      const beforeDiscount = discount * 10;
      const itemsMinor = beforeDiscount - discount;
      const deliveryMinor = index % 2 ? 25_000 : 0;
      const snapshot: OrderSnapshot = {
        revision: 0,
        currency: "VND",
        lines: [
          {
            variantId: "sku-01",
            productId: "product-01",
            name: "Учебный товар",
            unit: "500 г",
            quantity: 1,
            priceMinor: beforeDiscount,
            totalMinor: itemsMinor,
            promoSavingsMinor: discount,
          },
        ],
        adjustments: [{ kind: "promotion", sourceId: promoTrainingOffer, label: terms.name, amount: -discount }],
        itemsMinor,
        itemsBeforeDiscountMinor: beforeDiscount,
        deliveryMinor,
        totalMinor: itemsMinor + deliveryMinor,
        receiving: deliveryMinor ? { mode: "delivery", address: "Учебный адрес" } : { mode: "pickup" },
        fulfillment: deliveryMinor
          ? { mode: "delivery", available: true, inZone: true, payee: "shop", tariff: "fixed", feeMinor: deliveryMinor }
          : { mode: "pickup", available: true, pickup: { address: "Учебный самовывоз", hours: "09:00–20:00" } },
        time: null,
        phone: null,
        telegramLinked: false,
        customerName: "Учебный покупатель",
        payment: "cash",
        paymentStatus: "unpaid",
      };
      const { number } = sql
        .exec<{ number: number }>(
          "INSERT INTO orders(customer,created_at,status,payment_status,snapshot) VALUES(?,?,'completed','confirmed',?) RETURNING number",
          `guest:${actor}-${index + 1}`,
          completedAt - 60_000,
          JSON.stringify(snapshot),
        )
        .one();
      sql.exec(
        "INSERT INTO buyer_order_events(order_number,actor,event,created_at) VALUES(?,?,'order.complete',?)",
        number,
        actor,
        completedAt,
      );
      sql.exec(
        "INSERT INTO promo_uses(order_number,offer_id,amount_minor) VALUES(?,?,?)",
        number,
        promoTrainingOffer,
        discount,
      );
    }
  });
}
