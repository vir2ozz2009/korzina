import type { CommandIdentity } from "../../middleware/idempotency";
import { automaticPromoWhere, effectivePrice } from "../promo/cart";
import { type CartSource, reconcileQuote, type SavedQuote, toLine } from "./quote";

type CartState = {
  revision: number;
  currency: string;
  lines: string;
  quote: string | null;
  fingerprint: string | null;
  response: string | null;
  has_automatic: number;
  promo_code: string | null;
  promo_alternative: string | null;
};

export function readCartState(
  storage: DurableObjectStorage,
  customer: string,
  source: CartSource,
  variantIds: string[] = [],
  identity?: CommandIdentity,
) {
  const now = source.now ?? Date.now();
  const effective = effectivePrice("v.", !!source.promotions, now);
  const priceWindow = source.promotions
    ? `'nextPriceAt',CASE WHEN v.promo_starts_at>${now} THEN v.promo_starts_at
          WHEN v.promo_ends_at>${now} THEN v.promo_ends_at END,`
    : "";
  const variantId = variantIds[0] ?? "";
  const batch = variantIds.length > 1;
  const row = storage.sql
    .exec<CartState>(
      `SELECT COALESCE(c.revision,0) AS revision,s.currency,c.quote,i.fingerprint,i.response,c.promo_code,c.promo_alternative,
      ${source.promotions ? `EXISTS(SELECT 1 FROM promo_offers p WHERE ${automaticPromoWhere(Math.trunc(now))})` : "0"} AS has_automatic,
      (SELECT json_group_array(json_object(
        'variantId',w.variant_id,'productId',p.id,'name',p.name,'unit',v.name,'quantity',w.quantity,
        'priceMinor',${effective.price},'oldPriceMinor',${effective.old},${source.promotions ? "'categoryId',p.category_id," : ""}${priceWindow}'stock',v.stock,
        'available',COALESCE(v.visible AND v.product_available AND NOT v.product_paused AND v.sale_pause IS NULL AND (v.stock IS NULL OR v.stock>0),0),
        'photo',CASE WHEN m.id IS NOT NULL THEN json_object('id',m.id,'edgeColor',m.edge_color,'cropPosition',json(m.crop_position)) END))
      FROM (SELECT json_extract(j.value,'$.variantId') AS variant_id,json_extract(j.value,'$.quantity') AS quantity
            FROM json_each(COALESCE(c.lines,'[]')) j
            UNION ALL ${batch ? "SELECT value,0 FROM json_each(?)" : "SELECT ?,0 WHERE ? != ''"}) w
      LEFT JOIN variants v ON v.id=w.variant_id LEFT JOIN products p ON p.id=v.product_id
      LEFT JOIN media m ON m.id=COALESCE(v.photo_id, (
        SELECT pp.media_id FROM product_photos pp WHERE pp.product_id=p.id ORDER BY pp.position LIMIT 1
      )) AND m.ready=1 AND m.status='attached') AS lines
      FROM catalog_state s LEFT JOIN carts c ON c.customer=?
      LEFT JOIN idempotency i ON i.scope=? AND i.key=? WHERE s.id=1`,
      ...(batch ? [JSON.stringify(variantIds)] : [variantId, variantId]),
      customer,
      `cart:${customer}`,
      identity?.key ?? "",
    )
    .one();
  const saved = row.quote ? (JSON.parse(row.quote) as SavedQuote) : null;
  const prior = new Map(saved?.lines.map((line) => [line.variantId, line]));
  const rows = (JSON.parse(row.lines) as Parameters<typeof toLine>[0][]).map((line) =>
    toLine(line, source, prior.get(line.variantId)),
  );
  const current = reconcileQuote(
    row.revision,
    row.currency,
    rows.filter((line) => line.quantity > 0),
    saved,
  );
  return {
    ...current,
    codes: { code: row.promo_code, alternative: row.promo_alternative },
    hasAutomatic: row.has_automatic === 1,
    initial: !saved && current.cart.lines.length > 0,
    offered: rows.filter((line) => line.quantity === 0),
    previous: row.response,
    fingerprint: row.fingerprint,
  };
}
