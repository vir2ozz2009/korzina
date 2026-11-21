import { type PurchaseQuote, paymentSettingsInput, type QuoteResponse } from "../../../src/shared/contracts/checkout";
import { defaultShopTimeZone } from "../../../src/shared/datetime";
import { ApiError } from "../../../src/shared/errors";
import { addMinor, multiplyMinor } from "../../../src/shared/money";
import type { ShopEnv } from "../../shop/env";
import { readCart } from "../cart/service";
import { readAvailability } from "../fulfillment/availability";
import { pauseStatus } from "../fulfillment/pause";
import { isAvailable } from "../fulfillment/schedule";
import { checkFulfillment, parseSelection, requireFulfillment, resolveFulfillment } from "../fulfillment/service";

type Shop = ShopEnv["Bindings"];
const quoteLifetime = 15 * 60_000;
const paymentDefaults = { minimumMinor: 0, methods: [] };

function contextFor(env: Shop, subject: string) {
  const context = env.storage.sql
    .exec<{
      receiving: string | null;
      phone: string | null;
      buyer_name: string | null;
      fulfillment: string | null;
      payments: string | null;
    }>(
      `SELECT c.receiving,c.phone,c.buyer_name,(SELECT value FROM settings WHERE key='fulfillment') AS fulfillment,
     (SELECT value FROM settings WHERE key='purchase_payment') AS payments
     FROM (SELECT 1) LEFT JOIN carts c ON c.customer=?`,
      subject,
    )
    .one();
  const paymentSettings = paymentSettingsInput.parse(context.payments ? JSON.parse(context.payments) : paymentDefaults);
  if (!paymentSettings.instruction && !paymentSettings.qrSrc)
    paymentSettings.methods = paymentSettings.methods.filter((method) => method !== "transfer");
  return {
    ...context,
    paymentSettings,
    selection: parseSelection(context.receiving),
    settings: resolveFulfillment(context.fulfillment, env.features.maps),
  };
}

export function purchaseSummary(env: Shop, subject: string) {
  const { settings, selection, paymentSettings } = contextFor(env, subject);
  const { acceptingOrders, closedMessage, unavailable } = pauseStatus(
    settings,
    env.timeZone ?? defaultShopTimeZone,
    Date.now(),
  );
  const cart = readCart(env.storage, subject, { id: env.shop.id, mediaOrigin: env.media.MEDIA_PUBLIC_URL });
  const availability = selection.receiving ? checkFulfillment(settings, selection.receiving) : null;
  const deliveryMinor =
    availability?.available && availability.mode === "delivery" && availability.payee === "shop"
      ? (availability.feeMinor ?? 0)
      : 0;
  return {
    currency: cart.currency,
    itemsMinor: cart.totalMinor,
    hasItems: cart.lines.some((line) => line.available && line.quantity > 0),
    deliveryMinor,
    totalMinor: addMinor(cart.totalMinor, deliveryMinor),
    minimumMinor: paymentSettings.minimumMinor,
    shortMinor: Math.max(0, paymentSettings.minimumMinor - cart.totalMinor),
    acceptingOrders: acceptingOrders && env.shop.status === "active",
    closedMessage,
    unavailable,
    availability,
  };
}

export function purchaseDraft(env: Shop, subject: string, kind: "guest" | "telegram", now: number, checkTime: boolean) {
  const storage = env.storage;
  const context = contextFor(env, subject);
  const {
    settings,
    paymentSettings,
    selection: { receiving, time },
  } = context;
  const { closedMessage, unavailable } = pauseStatus(settings, env.timeZone ?? defaultShopTimeZone, now);
  if (env.shop.status !== "active") throw new ApiError("SHOP_CLOSED", "Магазин временно не принимает заказы");
  if (closedMessage) throw new ApiError("SHOP_CLOSED", closedMessage);
  const pause = receiving && unavailable[receiving.mode];
  if (pause) throw new ApiError("SHOP_CLOSED", pause);
  const cart = readCart(storage, subject, { id: env.shop.id, mediaOrigin: env.media.MEDIA_PUBLIC_URL });
  if (cart.review) throw new ApiError("QUOTE_CHANGED", "Подтвердите изменения в корзине", { cart });
  if (!receiving) throw new ApiError("VALIDATION", "Укажите способ получения");
  const fulfillment = requireFulfillment(settings, receiving, true);
  if (!fulfillment.available) throw new ApiError("VALIDATION", "Уточните получение");
  if (checkTime) {
    const availability = readAvailability(storage, receiving.mode, now);
    if (!isAvailable(availability.mode, availability.days, time))
      throw new ApiError("SLOT_TAKEN", "Выберите доступное время получения");
  }
  if (!context.phone && kind !== "telegram") throw new ApiError("VALIDATION", "Войдите или укажите номер телефона");
  if (!paymentSettings.methods.length) throw new ApiError("PAYMENT_METHOD_UNAVAILABLE", "Оплата пока недоступна");
  const lines = cart.lines
    .filter((line) => line.available && line.quantity > 0)
    .map(({ variantId, productId, name, unit, quantity, priceMinor, image }) => ({
      variantId,
      productId,
      name,
      unit,
      quantity,
      priceMinor,
      image,
      totalMinor: multiplyMinor(quantity, priceMinor),
    }));
  if (!lines.length || !cart.currency) throw new ApiError("VALIDATION", "Корзина пуста");
  const itemsMinor = addMinor(...lines.map((line) => line.totalMinor));
  if (itemsMinor < paymentSettings.minimumMinor)
    throw new ApiError("MIN_ORDER_SUM", "Добавьте товары до минимальной суммы", {
      itemsMinor,
      minimumMinor: paymentSettings.minimumMinor,
    });
  const deliveryMinor =
    fulfillment.mode === "delivery" && fulfillment.payee === "shop" ? (fulfillment.feeMinor ?? 0) : 0;
  const snapshot: PurchaseQuote = {
    revision: cart.revision,
    currency: cart.currency,
    lines,
    ...(cart.adjustments.length ? { adjustments: cart.adjustments } : {}),
    itemsMinor,
    deliveryMinor,
    totalMinor: addMinor(itemsMinor, deliveryMinor),
    receiving,
    fulfillment,
    time,
    phone: context.phone,
    telegramLinked: kind === "telegram",
    paymentSettings,
  };
  return { snapshot, cart, storedReceiving: context.receiving, customerName: context.buyer_name };
}

export function createQuote(env: Shop, subject: string, kind: "guest" | "telegram", now = Date.now()): QuoteResponse {
  const { snapshot } = purchaseDraft(env, subject, kind, now, true);
  const quoteRevision = crypto.randomUUID();
  const expiresAt = now + quoteLifetime;
  env.storage.sql.exec(
    "INSERT INTO checkout_quotes(id,customer,snapshot,expires_at) VALUES(?,?,?,?)",
    quoteRevision,
    subject,
    JSON.stringify(snapshot),
    expiresAt,
  );
  return { ...snapshot, quoteRevision, expiresAt };
}

export function loadQuote(storage: DurableObjectStorage, subject: string, quoteRevision: string, now: number) {
  const row = storage.sql
    .exec<{ snapshot: string }>(
      "SELECT snapshot FROM checkout_quotes WHERE id=? AND customer=? AND expires_at>?",
      quoteRevision,
      subject,
      now,
    )
    .toArray()[0];
  if (!row) throw new ApiError("QUOTE_CHANGED", "Срок расчёта истёк. Проверьте оплату ещё раз.");
  return JSON.parse(row.snapshot) as PurchaseQuote;
}
