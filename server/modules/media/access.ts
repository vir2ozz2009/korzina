import type { Permission } from "../../../src/shared/contracts/auth";
import type { MediaPurpose } from "../../../src/shared/contracts/media";
import { publicPurposes } from "../../../src/shared/contracts/media";
import { ApiError } from "../../../src/shared/errors";
import { readSeller, type Seller } from "../../auth/roles";
import type { ShopEnv } from "../../shop/env";
import { readCustomer } from "../auth/service";
import type { MediaRecord } from "./schema";

export type MediaActor = { id: string; seller?: Seller };
export async function mediaActor(env: ShopEnv["Bindings"], request: Request): Promise<MediaActor> {
  if (new URL(request.url).searchParams.get("as") === "seller") {
    const seller = await readSeller(request, env.platform, env.shop.id);
    return { id: `seller:${seller.accountId}`, seller };
  }
  const customer = await readCustomer(env.db, request, env.shop.id);
  if (!customer) throw new ApiError("UNAUTHORIZED", "Сначала войдите в магазин");
  return { id: customer.subject };
}
function canManage(actor: MediaActor, purpose: MediaPurpose) {
  if (purpose === "logo" || purpose === "cover") return actor.seller?.role === "owner";
  const permission: Permission =
    purpose === "chat"
      ? "chat"
      : purpose === "refund"
        ? "refunds"
        : purpose === "receipt"
          ? "payments"
          : purpose === "payment_qr"
            ? "payment_methods"
            : purpose === "review"
              ? "orders"
              : "products";
  return !!actor.seller && (actor.seller.role === "owner" || actor.seller.permissions.includes(permission));
}
export function assertUpload(actor: MediaActor, purpose: MediaPurpose, mime: string) {
  if (actor.seller && !canManage(actor, purpose)) throw new ApiError("FORBIDDEN", "Недостаточно прав для загрузки");
  if (publicPurposes.includes(purpose) && (!canManage(actor, purpose) || mime === "application/pdf"))
    throw new ApiError("FORBIDDEN", "Только сотрудник с правом может загрузить фото магазина");
}
export function assertRead(actor: MediaActor, record: MediaRecord) {
  if (actor.seller && !canManage(actor, record.purpose))
    throw new ApiError("FORBIDDEN", "Недостаточно прав для просмотра");
  if (record.status === "deleted" || !record.ready || (record.expiresAt !== null && record.expiresAt <= Date.now()))
    throw new ApiError("NOT_FOUND", "Файл не найден");
  if (actor.id !== record.owner && (record.status !== "attached" || !canManage(actor, record.purpose)))
    throw new ApiError("FORBIDDEN", "Нет доступа к файлу");
}
