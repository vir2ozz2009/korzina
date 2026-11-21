import { paymentSettingsInput } from "../../../src/shared/contracts/checkout";
import type { LaunchReadiness, ReadinessItem } from "../../../src/shared/contracts/launch";
import { ApiError } from "../../../src/shared/errors";
import { digest } from "../../auth/tokens";
import { paymentOptions } from "../checkout/payment-settings";
import { resolveFulfillment } from "../fulfillment/service";

type PlatformDraft = {
  name: string;
  slug: string;
  currency: string | null;
  version: number;
  status: LaunchReadiness["status"];
};

export async function launchSnapshot(storage: DurableObjectStorage, database: D1Database, shop: string) {
  const current = await database
    .withSession("first-primary")
    .prepare(`SELECT name,slug,currency,version,status FROM shops
    WHERE id=? AND status IN ('draft','active','paused')`)
    .bind(shop)
    .first<PlatformDraft>();
  if (!current) throw new ApiError("SHOP_NOT_FOUND", "Магазин не найден");
  const data = storage.sql
    .exec<{
      name: string | null;
      fulfillment: string | null;
      payment: string | null;
      product: number;
      catalogVersion: number;
    }>(`SELECT (SELECT value FROM settings WHERE key='display_name') AS name,
    (SELECT value FROM settings WHERE key='fulfillment') AS fulfillment,
    (SELECT value FROM settings WHERE key='purchase_payment') AS payment,
    EXISTS(SELECT 1 FROM products WHERE published=1 AND visible=1 AND has_catalog_offer=1 AND catalog_sold_out=0) AS product,
    (SELECT version FROM catalog_state WHERE id=1) AS catalogVersion`)
    .one();
  const fulfillment = resolveFulfillment(data.fulfillment, true);
  const payment = paymentSettingsInput.parse(
    data.payment ? JSON.parse(data.payment) : { minimumMinor: 0, methods: [] },
  );
  const items: ReadinessItem[] = [
    { key: "name", ready: !!(data.name ?? current.name).trim() },
    { key: "product", ready: !!data.product },
    { key: "receiving", ready: !!(fulfillment.pickup || fulfillment.delivery) },
    { key: "payment", ready: paymentOptions(payment).some((option) => option.enabled) },
  ];
  const readiness: LaunchReadiness = {
    status: current.status,
    revision: await digest(JSON.stringify([current.version, data, items])),
    items,
  };
  return { current, readiness };
}
