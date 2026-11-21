import { paymentSettingsInput } from "../../../src/shared/contracts/checkout";
import type { PaymentOption, SaveSellerPayments } from "../../../src/shared/contracts/seller-payments";
import { ApiError } from "../../../src/shared/errors";
import type { Seller } from "../../auth/roles";
import type { ShopEnv } from "../../shop/env";
import { presentMedia } from "../media/presentation";
import { findMedia } from "../media/service";
import { paymentOptions } from "./payment-settings";

type Env = ShopEnv["Bindings"];
type Revision = { revision: number; author?: string; updatedAt?: number };

export const canEditPayments = (seller: Seller) => seller.role === "owner" || seller.permissions.includes("payments");

function read(env: Env) {
  const rows = env.storage.sql
    .exec<{ key: string; value: string }>(
      "SELECT key,value FROM settings WHERE key IN ('purchase_payment','seller_payments_revision')",
    )
    .toArray();
  const data = rows.find(({ key }) => key === "purchase_payment");
  const revision = rows.find(({ key }) => key === "seller_payments_revision");
  return {
    settings: paymentSettingsInput.parse(data ? JSON.parse(data.value) : { minimumMinor: 0, methods: [] }),
    metadata: revision ? (JSON.parse(revision.value) as Revision) : { revision: 0 },
  };
}

function linkImage(env: Env, seller: Seller, id: string) {
  const record = findMedia(env, id);
  if (
    record.purpose !== "payment_qr" ||
    !record.ready ||
    record.status === "deleted" ||
    (record.status === "temp" &&
      (record.owner !== `seller:${seller.accountId}` || (record.expiresAt ?? 0) <= Date.now()))
  )
    throw new ApiError("VALIDATION", "Картинка для оплаты недоступна");
  env.storage.sql.exec("UPDATE media SET status='attached',expires_at=NULL WHERE id=? AND status='temp'", id);
  return presentMedia(record, env.shop.id, env.media.MEDIA_PUBLIC_URL).image?.src;
}

export function readSellerPayments(env: Env, seller: Seller) {
  const { settings, metadata } = read(env);
  const options = paymentOptions(settings);
  const canWrite = canEditPayments(seller);
  return {
    ...metadata,
    canWrite,
    options: canWrite
      ? options
      : options.filter(({ enabled }) => enabled).map(({ id, name, template }) => ({ id, name, template })),
  };
}

export function updateSellerPayments(env: Env, seller: Seller, { expectedRevision, options }: SaveSellerPayments) {
  const { settings, metadata } = read(env);
  if (expectedRevision !== metadata.revision) throw new ApiError("VERSION_CONFLICT", "Настройки изменились", metadata);
  const current = paymentOptions(settings);
  const next: PaymentOption[] = options.map((option) => {
    const previous = current.find(({ id }) => id === option.id);
    const imageSrc = option.imageId
      ? linkImage(env, seller, option.imageId)
      : option.imageId === null
        ? undefined
        : previous?.imageSrc;
    if (option.enabled && option.template !== "cash" && !option.instruction && !option.details && !imageSrc)
      throw new ApiError("VALIDATION", "Укажите инструкцию, реквизиты или картинку для оплаты", {
        methodId: option.id,
      });
    return { ...option, imageId: option.imageId === undefined ? previous?.imageId : option.imageId, imageSrc };
  });
  env.storage.sql.exec(
    "INSERT INTO settings(key,value) VALUES('purchase_payment',?),('seller_payments_revision',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    JSON.stringify({ ...settings, options: next }),
    JSON.stringify({ revision: metadata.revision + 1, author: seller.accountId, updatedAt: Date.now() }),
  );
  return readSellerPayments(env, seller);
}
