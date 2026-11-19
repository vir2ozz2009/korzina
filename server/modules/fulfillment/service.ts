import { addressKey, type SavedAddress } from "../../../src/shared/contracts/profile";
import {
  type DeliveryAddress,
  type DeliveryTariff,
  type DetailField,
  type FulfillmentSettings,
  fulfillmentSettingsInput,
  type ReceiveCommand,
  type Receiving,
  type ReceivingAvailability,
  receivingInput,
} from "../../../src/shared/contracts/receiving";
import type { TimeChoice } from "../../../src/shared/contracts/receiving-time";
import { ApiError } from "../../../src/shared/errors";
import { deliveryZone } from "./zones";

export function readFulfillment(storage: DurableObjectStorage, maps = true): FulfillmentSettings {
  const [row] = storage.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key='fulfillment'").toArray();
  return resolveFulfillment(row?.value, maps);
}

export function resolveFulfillment(value: string | null | undefined, maps: boolean) {
  const settings = fulfillmentSettingsInput.parse(value ? JSON.parse(value) : {});
  if (!maps && settings.delivery?.mode === "map") return { ...settings, delivery: undefined };
  return settings;
}

export function publicFulfillment(settings: FulfillmentSettings) {
  const delivery = settings.delivery;
  return {
    delivery: delivery
      ? {
          mode: delivery.mode,
          payee: delivery.payee,
          ...(delivery.mode === "districts" && {
            districts: delivery.districts.map(({ id, name }) => ({ id, name })),
          }),
        }
      : null,
    pickup: settings.pickup ?? null,
    requiredDetails: settings.requiredDetails,
    acceptingOrders: settings.acceptingOrders,
  };
}

type UnavailableDelivery = Extract<ReceivingAvailability, { mode: "delivery"; available: false }>;

export function checkFulfillment(settings: FulfillmentSettings, selection: Receiving): ReceivingAvailability {
  if (selection.mode === "pickup")
    return settings.pickup
      ? { mode: "pickup", available: true, pickup: settings.pickup }
      : { mode: "pickup", available: false };

  const delivery = settings.delivery;
  const unavailable = (reason: UnavailableDelivery["reason"]): UnavailableDelivery => ({
    mode: "delivery",
    available: false,
    inZone: reason === "outside" ? false : null,
    reason,
    pickup: settings.pickup ?? null,
  });
  if (!delivery) return unavailable("disabled");
  const { payee } = delivery;
  function available(tariff: DeliveryTariff, zoneId?: string, unverified?: true): ReceivingAvailability {
    return {
      mode: "delivery",
      available: true,
      inZone: unverified ? null : true,
      zoneId,
      payee,
      tariff: tariff.kind,
      feeMinor: tariff.kind === "fixed" ? tariff.feeMinor : tariff.kind === "free" ? 0 : null,
      unverified,
    };
  }

  if (delivery.mode === "text") return available(delivery.tariff);
  if (delivery.mode === "districts") {
    const district = delivery.districts.find(({ id }) => id === selection.districtId);
    return district ? available(district.tariff, district.id) : unavailable("district_required");
  }
  if (!selection.point)
    return selection.acceptedWithoutPoint
      ? available({ kind: "after_order" }, undefined, true)
      : unavailable("address_required");
  const zone = deliveryZone(delivery.zones, selection.point);
  return zone ? available(zone.tariff, zone.id) : unavailable("outside");
}

const missingDetail: Record<DetailField, string> = {
  apartment: "Укажите квартиру.",
  entrance: "Укажите подъезд.",
  floor: "Укажите этаж.",
  intercom: "Укажите домофон.",
};

export function requireFulfillment(settings: FulfillmentSettings, receiving: Receiving, complete: boolean) {
  const result = checkFulfillment(settings, receiving);
  if (!result.available) {
    if (result.mode === "pickup") throw new ApiError("PICKUP_UNAVAILABLE", "Самовывоз недоступен", result);
    if (result.reason === "outside") throw new ApiError("OUT_OF_ZONE", "Сюда не доставляем", result);
    if (result.reason === "disabled") throw new ApiError("OUT_OF_ZONE", "Доставка недоступна", result);
    if (complete) {
      const district = result.reason === "district_required";
      throw new ApiError("VALIDATION", district ? "Выберите район." : "Уточните адрес доставки.", {
        field: district ? "districtId" : "address",
      });
    }
  }
  if (complete && receiving.mode === "delivery") {
    const field = settings.requiredDetails.find((key) => !receiving[key]);
    if (field) throw new ApiError("VALIDATION", missingDetail[field], { field });
  }
  return result;
}

type Selection = {
  receiving: Receiving | null;
  savedAddresses: SavedAddress[];
  time: TimeChoice | null;
  receivingUpdatedAt: number;
  lastUsedAddress?: DeliveryAddress;
};
export const emptySelection = (): Selection => ({
  receiving: null,
  savedAddresses: [],
  time: null,
  receivingUpdatedAt: 0,
});

export function parseSelection(value: string | null | undefined): Selection {
  if (!value) return emptySelection();
  const parsed = JSON.parse(value);
  // An older draft stored just the selection inside the same cart column.
  if ("mode" in parsed) return { ...emptySelection(), receiving: receivingInput.parse(parsed) };
  const current = { ...emptySelection(), ...(parsed as Selection) };
  return {
    ...current,
    savedAddresses: current.savedAddresses.map((address) => ({
      ...address,
      id: address.id ?? `legacy:${addressKey(address)}`,
      title: address.title ?? "",
    })),
  };
}

export function readReceiving(storage: DurableObjectStorage, customer: string) {
  const [row] = storage.sql
    .exec<{ revision: number; receiving: string | null }>(
      "SELECT revision,receiving FROM carts WHERE customer=?",
      customer,
    )
    .toArray();
  return { revision: row?.revision ?? 0, ...parseSelection(row?.receiving) };
}

export function writeReceiving(
  storage: DurableObjectStorage,
  customer: string,
  revision: number,
  selection: Selection,
) {
  storage.sql.exec(
    `INSERT INTO carts (customer,revision,receiving,updated_at) VALUES (?,?,?,?)
     ON CONFLICT(customer) DO UPDATE SET revision=excluded.revision,receiving=excluded.receiving,updated_at=excluded.updated_at`,
    customer,
    revision,
    JSON.stringify(selection),
    Date.now(),
  );
}

export function draftForMode(selection: Receiving, settings: FulfillmentSettings): Receiving {
  if (selection.mode === "pickup") return selection;
  const { point, districtId, acceptedWithoutPoint, ...address } = selection;
  if (settings.delivery?.mode === "map")
    return { ...address, point, acceptedWithoutPoint: point ? undefined : acceptedWithoutPoint };
  return { ...address, districtId: settings.delivery?.mode === "districts" ? districtId : undefined };
}

export function rememberOrderedAddress(saved: SavedAddress[], receiving: DeliveryAddress) {
  const { comment: _comment, ...address } = receiving;
  if (saved.length >= 10 || saved.some((item) => addressKey(item) === addressKey(address))) return saved;
  return [{ ...address, id: crypto.randomUUID(), title: "" }, ...saved];
}

export function saveReceiving(storage: DurableObjectStorage, customer: string, input: ReceiveCommand, maps = true) {
  return storage.transactionSync(() => {
    const current = readReceiving(storage, customer);
    if (input.expectedRevision !== current.revision)
      throw new ApiError("VERSION_CONFLICT", "Корзина изменилась. Попробуйте ещё раз.", current);
    const settings = readFulfillment(storage, maps);
    const receiving = draftForMode(input.receiving, settings);
    const availability = requireFulfillment(settings, receiving, !!input.complete);
    if (JSON.stringify(receiving) === JSON.stringify(current.receiving)) return { ...current, availability };
    const revision = current.revision + 1;
    const time = current.receiving?.mode === receiving.mode ? current.time : null;
    const selection = {
      receiving,
      savedAddresses: current.savedAddresses,
      time,
      receivingUpdatedAt: Date.now(),
      lastUsedAddress: current.lastUsedAddress,
    };
    writeReceiving(storage, customer, revision, selection);
    return { revision, ...selection, availability };
  });
}
