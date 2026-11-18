import {
  type FulfillmentSettings,
  fulfillmentSettingsInput,
  type ReceiveCommand,
  type Receiving,
} from "../../../src/shared/contracts/receiving";
import { ApiError } from "../../../src/shared/errors";

import { deliveryZone } from "./zones";

export function readFulfillment(storage: DurableObjectStorage): FulfillmentSettings {
  const [row] = storage.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key='fulfillment'").toArray();
  return parseFulfillment(row?.value);
}

export function parseFulfillment(value: string | undefined): FulfillmentSettings {
  return value ? fulfillmentSettingsInput.parse(JSON.parse(value)) : {};
}

export function checkFulfillment(settings: FulfillmentSettings, selection: Receiving) {
  if (selection.mode === "pickup")
    return settings.pickup
      ? { mode: "pickup" as const, available: true as const, pickup: settings.pickup }
      : { mode: "pickup" as const, available: false as const };
  const zone = deliveryZone(settings.delivery?.zones ?? [], selection.point);
  return zone
    ? {
        mode: "delivery" as const,
        available: true as const,
        inZone: true as const,
        zoneId: zone.id,
        tariff: zone.tariff.kind,
        feeMinor: zone.tariff.kind === "fixed" ? zone.tariff.feeMinor : zone.tariff.kind === "free" ? 0 : null,
      }
    : { mode: "delivery" as const, available: false as const, inZone: false as const, pickup: settings.pickup ?? null };
}

export function requireFulfillment(settings: FulfillmentSettings, receiving: Receiving, complete: boolean) {
  const result = checkFulfillment(settings, receiving);
  if (!result.available)
    throw receiving.mode === "delivery"
      ? new ApiError("OUT_OF_ZONE", "Сюда не доставляем", result)
      : new ApiError("PICKUP_UNAVAILABLE", "Самовывоз недоступен", result);
  if (complete && receiving.mode === "delivery" && !receiving.apartment)
    throw new ApiError("VALIDATION", "Укажите квартиру.", { field: "apartment" });
  return result;
}

export function readReceiving(storage: DurableObjectStorage, customer: string) {
  const [row] = storage.sql
    .exec<{ revision: number; receiving: string | null }>(
      "SELECT revision,receiving FROM carts WHERE customer=?",
      customer,
    )
    .toArray();
  return { revision: row?.revision ?? 0, receiving: row?.receiving ? (JSON.parse(row.receiving) as Receiving) : null };
}

export function saveReceiving(storage: DurableObjectStorage, customer: string, input: ReceiveCommand) {
  return storage.transactionSync(() => {
    const current = readReceiving(storage, customer);
    if (input.expectedRevision !== current.revision)
      throw new ApiError("VERSION_CONFLICT", "Корзина изменилась. Попробуйте ещё раз.", current);
    const availability = requireFulfillment(readFulfillment(storage), input.receiving, !!input.complete);
    const receiving = JSON.stringify(input.receiving);
    if (receiving === JSON.stringify(current.receiving)) return { ...current, availability };
    const revision = current.revision + 1;
    storage.sql.exec(
      `INSERT INTO carts (customer,revision,receiving,updated_at) VALUES (?,?,?,?)
       ON CONFLICT(customer) DO UPDATE SET revision=excluded.revision,receiving=excluded.receiving,updated_at=excluded.updated_at`,
      customer,
      revision,
      receiving,
      Date.now(),
    );
    return { revision, receiving: input.receiving, availability };
  });
}
