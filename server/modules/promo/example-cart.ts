import type { z } from "zod";
import { cartTotals } from "../../../src/shared/cart-totals";
import type { promoExampleInput } from "../../../src/shared/contracts/promo";
import { defaultShopTimeZone } from "../../../src/shared/datetime";
import { ApiError } from "../../../src/shared/errors";
import { addMinor, formatMinor } from "../../../src/shared/money";
import type { ShopEnv } from "../../shop/env";
import { toLine } from "../cart/quote";
import { publicFulfillment, readFulfillment } from "../fulfillment/service";
import { type Candidate, calculatePromo, promoLabel } from "./calculate";
import { effectivePrice } from "./cart";
import { bundleComponents } from "./group-catalog";
import { datesFor, validateTerms } from "./offers";
import { assessPublicCandidates, describePublicPromos } from "./public-cart";

export function exampleCart(env: ShopEnv["Bindings"], input: z.infer<typeof promoExampleInput>, now = Date.now()) {
  const { terms, lines, completed, confirmed, enteredCode } = input;
  validateTerms(env.storage, terms, true);
  const { start, end } = datesFor(terms, env.timeZone);
  const { currency } = env.storage.sql
    .exec<{ currency: string }>("SELECT currency FROM catalog_state WHERE id=1")
    .one();
  const effective = effectivePrice("v.", true, now);
  const rows = env.storage.sql
    .exec<Omit<Parameters<typeof toLine>[0], "photo"> & { photo: string | null }>(
      `SELECT j.key, v.id AS variantId,p.id AS productId,p.category_id AS categoryId,p.name,v.name AS unit,
      ${effective.price} AS priceMinor,${effective.old} AS oldPriceMinor,v.stock,
      MIN(CAST(json_extract(j.value,'$.quantity') AS INTEGER),COALESCE(NULLIF(v.stock,0),999)) AS quantity,
      (v.visible AND v.product_available AND NOT v.product_paused AND v.sale_pause IS NULL AND
       (v.stock IS NULL OR v.stock>0)) AS available,
      CASE WHEN m.id IS NOT NULL THEN json_object('id',m.id,'edgeColor',m.edge_color,'cropPosition',json(m.crop_position)) END AS photo
      FROM json_each(?) j JOIN variants v ON v.id=json_extract(j.value,'$.variantId')
      JOIN products p ON p.id=v.product_id
      LEFT JOIN media m ON m.id=COALESCE(v.photo_id, (
        SELECT pp.media_id FROM product_photos pp WHERE pp.product_id=p.id ORDER BY pp.position LIMIT 1
      )) AND m.ready=1 AND m.status='attached' GROUP BY v.id ORDER BY j.key`,
      JSON.stringify(lines),
    )
    .toArray();
  const source = { id: env.shop.id, mediaOrigin: env.media.MEDIA_PUBLIC_URL };
  const cart = {
    revision: 0,
    currency,
    ...cartTotals(rows.map((row) => toLine({ ...row, photo: row.photo ? JSON.parse(row.photo) : null }, source))),
  };
  const status = end !== null && end <= now ? "ended" : start !== null && start > now ? "scheduled" : "active";
  const candidate: Candidate = { id: "example", revision: 0, terms, used: 0, personalUsed: 0, status };
  const buyer = { confirmed, completed, exactUsed: false };
  const publicOffers = terms.publicInCart ? assessPublicCandidates([candidate], cart, buyer) : [];
  if (
    input.publicOfferId &&
    !publicOffers.some(
      ({ offer, result }) => offer.id === input.publicOfferId && offer.terms.code === enteredCode && !result.reason,
    )
  ) {
    throw new ApiError("VALIDATION", "Акция больше недоступна. Проверьте условия.");
  }
  const priced = calculatePromo(
    cart,
    [candidate],
    buyer,
    (value) => promoLabel(value, (amount) => formatMinor(amount, currency)),
    enteredCode ?? undefined,
    bundleComponents(env.storage, [candidate], now),
  );
  const fulfillment = publicFulfillment(
    readFulfillment(env.storage, env.features.maps),
    env.timeZone ?? defaultShopTimeZone,
    now,
  );
  const method =
    input.receiving && fulfillment[input.receiving] && !fulfillment.unavailable[input.receiving]
      ? input.receiving
      : fulfillment.pickup && !fulfillment.unavailable.pickup
        ? "pickup"
        : fulfillment.delivery && !fulfillment.unavailable.delivery
          ? "delivery"
          : null;
  const deliveryMinor = method === "pickup" ? 0 : null;
  return {
    ...priced,
    publicOffers: describePublicPromos(env.storage, publicOffers),
    timeZone: env.timeZone ?? defaultShopTimeZone,
    fulfillment,
    method,
    deliveryMinor,
    payableMinor: addMinor(priced.totalMinor, deliveryMinor ?? 0),
  };
}
