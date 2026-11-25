import { runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import { catalogRequest, catalogStub } from "../catalog/testing";
import { readOffer } from "./offers";
import { reportOffer } from "./report";
import { promoTrainingOffer, promoTrainingShop, seedPromoTraining } from "./training";

it("12.1 · учебный отчёт сохраняет границы местных дат, суммы и номера при повторной подготовке", async () => {
  const shop = catalogStub(promoTrainingShop);
  await (await catalogRequest("live?ids=sku-01", promoTrainingShop)).arrayBuffer();
  const now = Date.parse("2026-11-24T18:00:00Z"); // 25 ноября в магазине, но не в UTC.
  await runInDurableObject(shop, (_instance, { storage }) => {
    seedPromoTraining(storage, now);
    seedPromoTraining(storage, now + 24 * 60 * 60_000);
    const offer = readOffer(storage, promoTrainingOffer);
    expect(offer.status).toBe("disabled");
    const check = (range: { from?: string; through?: string }, ids: number[], saving: number, delivery: number) => {
      const result = reportOffer(storage, offer, { ...range, offset: 0 }, "Asia/Ho_Chi_Minh", now);
      expect(result).toMatchObject({
        orderCount: ids.length,
        guestOrders: ids.length,
        savingsMinor: saving,
        itemsMinor: saving * 9,
        deliveryMinor: delivery,
      });
      expect(result.orders.map(({ number }) => number)).toEqual(ids);
    };
    check({ from: "2026-11-19", through: "2026-11-25" }, [5, 4], 9_000, 25_000);
    check({ from: "2026-10-27", through: "2026-11-25" }, [5, 4, 3, 2], 14_000, 50_000);
    check({}, [5, 4, 3, 2, 1], 15_000, 50_000);
    check({ from: "2026-10-27", through: "2026-11-18" }, [3, 2], 5_000, 25_000);
  });
});
