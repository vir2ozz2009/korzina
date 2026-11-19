import { addressKey, savedAddressLimit } from "../../../src/shared/address-key";
import type { AddressCommand, SavedAddress } from "../../../src/shared/contracts/profile";
import { ApiError } from "../../../src/shared/errors";
import { contactRegion, savePhone } from "../auth/contact";
import {
  draftForMode,
  readFulfillment,
  readReceiving,
  requireFulfillment,
  writeReceiving,
} from "../fulfillment/service";

type Actor = { subject: string; kind: "guest" | "telegram" };

const changed = () => new ApiError("VERSION_CONFLICT", "Данные изменились. Обновите профиль.");

function profileData(storage: DurableObjectStorage, actor: Actor) {
  const row = storage.sql
    .exec<{ buyer_name: string | null; phone: string | null; revision: number }>(
      "SELECT buyer_name,phone,revision FROM carts WHERE customer=?",
      actor.subject,
    )
    .toArray()[0];
  return {
    name: row?.buyer_name ?? "",
    phone: row?.phone ?? "",
    revision: row?.revision ?? 0,
    telegramLinked: actor.kind === "telegram",
  };
}

export function editableProfile(storage: DurableObjectStorage, actor: Actor) {
  const profile = profileData(storage, actor);
  if (!profile.telegramLinked && !profile.phone) throw new ApiError("UNAUTHORIZED", "Войдите в магазин");
  return profile;
}

export function editProfile(
  storage: DurableObjectStorage,
  actor: Actor,
  input: { revision: number; name: string; phone: string },
) {
  const profile = editableProfile(storage, actor);
  if (profile.revision !== input.revision) throw changed();
  if (!input.phone && actor.kind === "guest") throw new ApiError("VALIDATION", "Укажите номер телефона");
  if (input.phone) savePhone(storage, actor.subject, actor.kind, input.phone);
  storage.sql.exec(
    `INSERT INTO carts(customer,buyer_name,updated_at) VALUES(?,?,?)
     ON CONFLICT(customer) DO UPDATE SET buyer_name=excluded.buyer_name, phone=CASE WHEN ? THEN NULL ELSE phone END,
       revision=revision+1, updated_at=excluded.updated_at`,
    actor.subject,
    input.name,
    Date.now(),
    !input.phone ? 1 : 0,
  );
  return { ...profileData(storage, actor), region: contactRegion(storage) };
}

export function profileAddresses(storage: DurableObjectStorage, actor: Actor) {
  editableProfile(storage, actor);
  const { revision, savedAddresses } = readReceiving(storage, actor.subject);
  return { revision, addresses: savedAddresses };
}

export function updateProfileAddress(
  storage: DurableObjectStorage,
  actor: Actor,
  input: AddressCommand,
  maps: boolean,
) {
  editableProfile(storage, actor);
  const { revision, ...current } = readReceiving(storage, actor.subject);
  if (input.revision !== revision) throw new ApiError("VERSION_CONFLICT", "Список адресов изменился");
  const original = input.id ? current.savedAddresses.find((item) => item.id === input.id) : undefined;
  if (input.id && !original) throw new ApiError("ADDRESS_NOT_FOUND", "Адрес недоступен");
  let savedAddresses = current.savedAddresses.filter((item) => item.id !== input.id);
  if (input.action === "save") {
    if (!original && savedAddresses.length >= savedAddressLimit)
      throw new ApiError("ADDRESS_LIMIT", "Достигнут лимит адресов");
    const settings = readFulfillment(storage, maps);
    const address = draftForMode(input.receiving, settings);
    if (address.mode !== "delivery") throw new ApiError("VALIDATION", "Укажите адрес доставки");
    requireFulfillment(settings, address, true);
    const { comment: _comment, ...details } = address;
    const existing = savedAddresses.find((item) => addressKey(item) === addressKey(details));
    if (existing) throw new ApiError("VALIDATION", "Этот адрес уже сохранён");
    const update: SavedAddress = { ...details, id: original?.id ?? crypto.randomUUID(), title: input.title };
    savedAddresses = original
      ? current.savedAddresses.map((item) => (item.id === original.id ? update : item))
      : [update, ...savedAddresses];
  }
  const lastUsedAddress =
    input.action === "remove" &&
    original &&
    current.lastUsedAddress &&
    addressKey(original) === addressKey(current.lastUsedAddress)
      ? undefined
      : current.lastUsedAddress;
  writeReceiving(storage, actor.subject, revision + 1, { ...current, savedAddresses, lastUsedAddress });
  return { revision: revision + 1, addresses: savedAddresses, lastUsedAddress };
}

export function hasTelegramProfile(storage: DurableObjectStorage, subject: string) {
  return (
    storage.sql
      .exec(
        `SELECT 1 FROM carts WHERE customer=?
         UNION ALL SELECT 1 FROM sessions WHERE subject=?
         UNION ALL SELECT 1 FROM orders WHERE customer=? LIMIT 1`,
        subject,
        subject,
        subject,
      )
      .toArray().length > 0
  );
}

export function initTelegramProfile(storage: DurableObjectStorage, subject: string, name: string | undefined) {
  if (!name) return;
  storage.sql.exec(
    `INSERT INTO carts(customer,buyer_name,updated_at) VALUES(?,?,?)
     ON CONFLICT(customer) DO UPDATE SET buyer_name=excluded.buyer_name WHERE buyer_name IS NULL`,
    subject,
    name,
    Date.now(),
  );
}
