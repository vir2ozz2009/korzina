import type { z } from "zod";
import type {
  PromoOffer,
  PromoStatus,
  PromoTerms,
  promoCommand,
  promoListInput,
} from "../../../src/shared/contracts/promo";
import { calendarDate, defaultShopTimeZone, shopDayStart } from "../../../src/shared/datetime";
import { ApiError } from "../../../src/shared/errors";

import { netSavings } from "./result-sql";

type StoredOffer = {
  id: string;
  revision: number;
  state: "draft" | "published" | "disabled";
  starts_at: number | null;
  ends_at: number | null;
  terms: string;
};
export type OfferRow = StoredOffer & { used: number; personal_used: number; orders: number; savings: number };
const summary = `(SELECT COUNT(*) FROM promo_uses u WHERE u.offer_id=p.id AND u.released_at IS NULL) used,
  (SELECT COUNT(*) FROM promo_uses u JOIN orders o ON o.number=u.order_number WHERE u.offer_id=p.id AND o.status='completed' AND u.amount_minor>0) orders,
  COALESCE((SELECT SUM(${netSavings}) FROM promo_uses u JOIN orders o ON o.number=u.order_number WHERE u.offer_id=p.id AND o.status='completed' AND u.amount_minor>0),0) savings`;

function statusOf(row: StoredOffer, now: number): PromoStatus {
  if (row.state !== "published") return row.state;
  if (row.ends_at !== null && row.ends_at <= now) return "ended";
  if (row.starts_at !== null && row.starts_at > now) return "scheduled";
  return "active";
}

export function offerOf(row: OfferRow, now: number): PromoOffer {
  return {
    id: row.id,
    revision: row.revision,
    terms: JSON.parse(row.terms),
    status: statusOf(row, now),
    used: row.used,
    orders: row.orders,
    savingsMinor: row.savings,
  };
}

export function datesFor(terms: Pick<PromoTerms, "fromDate" | "throughDate">, zone = defaultShopTimeZone) {
  if (terms.fromDate && terms.throughDate && terms.fromDate > terms.throughDate)
    throw new ApiError("VALIDATION", "Дата окончания раньше начала");
  return {
    start: terms.fromDate ? shopDayStart(terms.fromDate, zone) : null,
    end: terms.throughDate ? shopDayStart(calendarDate(terms.throughDate, 1), zone) : null,
  };
}

function offerRow(storage: DurableObjectStorage, id: string) {
  const row = storage.sql.exec<OfferRow>(`SELECT p.*, ${summary} FROM promo_offers p WHERE id=?`, id).toArray()[0];
  if (!row) throw new ApiError("NOT_FOUND", "Акция не найдена");
  return row;
}
export function readOffer(storage: DurableObjectStorage, id: string, now = Date.now()) {
  return offerOf(offerRow(storage, id), now);
}
export function listOffers(storage: DurableObjectStorage, input: z.infer<typeof promoListInput>, now = Date.now()) {
  const status = `CASE WHEN state='disabled' THEN 'disabled' WHEN state='draft' THEN 'draft'
    WHEN ends_at<=? THEN 'ended' WHEN starts_at>? THEN 'scheduled' ELSE 'active' END`;
  const rows = storage.sql
    .exec<OfferRow>(
      `WITH filtered AS (SELECT *, ${status} AS status FROM promo_offers)
     SELECT p.*, ${summary} FROM filtered p
     WHERE (? IS NULL OR status=?) AND (? IS NULL OR kind=?)
     ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,
     CASE WHEN status='scheduled' THEN starts_at END, updated_at DESC,id LIMIT 31 OFFSET ?`,
      now,
      now,
      input.status ?? null,
      input.status ?? null,
      input.kind ?? null,
      input.kind ?? null,
      input.offset,
    )
    .toArray();
  const currency = storage.sql
    .exec<{ currency: string }>("SELECT currency FROM catalog_state WHERE id=1")
    .one().currency;
  return {
    offers: rows.slice(0, 30).map((row) => offerOf(row, now)),
    currency,
    nextOffset: rows.length > 30 ? input.offset + 30 : null,
  };
}

export function validateTerms(storage: DurableObjectStorage, terms: PromoTerms, publishing: boolean) {
  if (publishing && (!terms.name || !terms.discount.value || (terms.kind === "code" && !terms.code)))
    throw new ApiError("VALIDATION", "Укажите название, размер скидки и код, если он нужен");
  if (terms.scope.type === "all") return;
  const scope = terms.scope;
  if (publishing && !scope.ids.length) throw new ApiError("VALIDATION", "Выберите подходящие товары");
  const live =
    scope.type === "variants" && publishing
      ? "AND visible AND product_available AND NOT product_paused AND sale_pause IS NULL"
      : "";
  const { found } = storage.sql
    .exec<{ found: number }>(
      `SELECT COUNT(*) AS found FROM ${scope.type} WHERE id IN (SELECT value FROM json_each(?)) ${live}`,
      JSON.stringify(scope.ids),
    )
    .one();
  if (found !== new Set(scope.ids).size) throw new ApiError("VALIDATION", "Часть выбранных товаров недоступна");
}

export function writeOffer(
  storage: DurableObjectStorage,
  id: string | undefined,
  input: z.infer<typeof promoCommand>,
  actor: string,
  zone: string | undefined,
  now = Date.now(),
) {
  const row = id ? offerRow(storage, id) : undefined;
  const previous = row && offerOf(row, now);
  if ((row?.revision ?? 0) !== input.revision)
    throw new ApiError("VERSION_CONFLICT", "Условия уже изменились", previous);
  const action = input.action;
  if (
    (action === "repeat" && previous?.status !== "ended") ||
    (action === "enable" && previous?.status !== "disabled") ||
    (action === "disable" && previous?.status !== "active" && previous?.status !== "scheduled") ||
    (action === "draft" && previous && previous.status !== "draft") ||
    (action === "publish" && previous?.status === "ended")
  )
    throw new ApiError("VALIDATION", "Действие недоступно в текущем статусе");
  const editing = action === "draft" || action === "publish";
  const terms = editing ? input.terms : previous?.terms;
  if (!terms) throw new ApiError("VALIDATION", "Укажите условия");
  if (editing) terms.publicInCart = terms.publicInCart ?? previous?.terms.publicInCart ?? false;
  if (terms.kind === "automatic") delete terms.code;
  if (action === "repeat") {
    delete terms.fromDate;
    delete terms.throughDate;
  }
  const { start, end } = datesFor(terms, zone);
  const publishing = action === "publish" || action === "enable";
  if (editing || action === "enable") validateTerms(storage, terms, publishing);
  if (publishing) {
    if (end !== null && end <= now) throw new ApiError("VALIDATION", "Срок действия закончился. Измените даты.");
    if (terms.totalLimit && (row?.used ?? 0) >= terms.totalLimit)
      throw new ApiError("VALIDATION", "Общий лимит исчерпан");
    if (
      terms.code &&
      storage.sql
        .exec(
          `SELECT id FROM promo_offers WHERE state='published' AND kind='code' AND code=? AND id<>?
       AND COALESCE(ends_at, 9007199254740991)>MAX(COALESCE(?,0),?)
       AND COALESCE(starts_at,0)<COALESCE(?,9007199254740991) LIMIT 1`,
          terms.code,
          id ?? "",
          start,
          now,
          end,
        )
        .toArray().length
    )
      throw new ApiError("VALIDATION", "Этот код уже занят на выбранный срок");
  }
  const offerId = action === "repeat" ? crypto.randomUUID() : (id ?? crypto.randomUUID());
  const revision = action === "repeat" ? 1 : (row?.revision ?? 0) + 1;
  const state =
    action === "disable" || (action === "publish" && previous?.status === "disabled")
      ? "disabled"
      : publishing
        ? "published"
        : "draft";
  storage.sql.exec(
    `INSERT INTO promo_offers(id,revision,state,kind,code,starts_at,ends_at,terms,actor,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,state=excluded.state,kind=excluded.kind,code=excluded.code,
     starts_at=excluded.starts_at,ends_at=excluded.ends_at,terms=excluded.terms,actor=excluded.actor,updated_at=excluded.updated_at`,
    offerId,
    revision,
    state,
    terms.kind,
    terms.code ?? null,
    start,
    end,
    JSON.stringify(terms),
    actor,
    now,
  );
  return readOffer(storage, offerId, now);
}
