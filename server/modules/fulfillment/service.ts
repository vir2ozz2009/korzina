import {
  type DeliveryAddress,
  type Fulfillment,
  type FulfillmentSettings,
  fulfillmentSettingsInput,
} from "../../../src/shared/contracts/fulfillment";
import { ApiError } from "../../../src/shared/errors";
import { deliveryZone } from "./zones";

export function readFulfillment(storage: DurableObjectStorage): FulfillmentSettings {
  const [row] = storage.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key='fulfillment'").toArray();
  return parseFulfillment(row?.value);
}

export function parseFulfillment(value: string | undefined): FulfillmentSettings {
  return value ? fulfillmentSettingsInput.parse(JSON.parse(value)) : {};
}

export function checkFulfillment(settings: FulfillmentSettings, selection: Fulfillment) {
  if (selection.mode === "pickup")
    return settings.pickup
      ? { mode: "pickup" as const, available: true as const, ...settings.pickup }
      : { mode: "pickup" as const, available: false as const };
  const zone = deliveryZone(settings.delivery?.zones ?? [], selection.point);
  return zone
    ? {
        mode: "delivery" as const,
        available: true as const,
        address: selection.address,
        point: selection.point,
        zoneId: zone.id,
        tariff: zone.tariff,
      }
    : { mode: "delivery" as const, available: false as const, pickup: settings.pickup ?? null };
}

export function savedAddresses(storage: DurableObjectStorage, sessionId: string): DeliveryAddress[] {
  const row = storage.sql
    .exec<{ delivery_addresses: string }>("SELECT delivery_addresses FROM sessions WHERE token_hash=?", sessionId)
    .one();
  return JSON.parse(row.delivery_addresses) as DeliveryAddress[];
}

export function rememberAddress(storage: DurableObjectStorage, sessionId: string, address: DeliveryAddress) {
  return storage.transactionSync(() => {
    const result = checkFulfillment(readFulfillment(storage), { mode: "delivery", ...address });
    if (!result.available) throw new ApiError("VALIDATION", "Сюда не доставляем", result);
    const previous = savedAddresses(storage, sessionId);
    const key = (value: DeliveryAddress) => value.address.toLocaleLowerCase("ru").replace(/\s+/gu, " ");
    const addresses = [address, ...previous.filter((value) => key(value) !== key(address))].slice(0, 3);
    storage.sql.exec(
      "UPDATE sessions SET delivery_addresses=? WHERE token_hash=?",
      JSON.stringify(addresses),
      sessionId,
    );
    return { addresses, delivery: result };
  });
}
