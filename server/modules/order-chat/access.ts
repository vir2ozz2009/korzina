import type { OrderStage } from "../../../src/shared/contracts/buyer-order";
import type { ChangeSide } from "../../../src/shared/contracts/order-changes";
import { ApiError } from "../../../src/shared/errors";
import type { Seller } from "../../auth/roles";
import type { ShopEnv } from "../../shop/env";
import { readCustomer } from "../auth/service";

export type ChatActor = { side: ChangeSide; id: string };
export type ChatOrder = { number: number; customer: string; status: OrderStage; writable: number; telegram: number };
const writeWindow = 7 * 86_400_000;
type Shop = ShopEnv["Bindings"];

export async function chatBuyer(env: Shop, request: Request): Promise<ChatActor> {
  const session = await readCustomer(env.db, request, env.shop.id);
  if (session?.kind !== "telegram") throw new ApiError("AUTH_REQUIRED", "Войдите, чтобы открыть переписку");
  return { side: "buyer", id: session.subject };
}

export function chatSeller(seller: Seller): ChatActor {
  if (seller.role !== "owner" && !seller.permissions.includes("chat"))
    throw new ApiError("FORBIDDEN", "Нет доступа к переписке");
  return { side: "seller", id: seller.accountId };
}

export function chatOrder(
  storage: DurableObjectStorage,
  number: number,
  actor: ChatActor,
  now = Date.now(),
): ChatOrder {
  const row = storage.sql
    .exec<ChatOrder>(
      `SELECT number,customer,status,json_extract(snapshot,'$.telegramLinked') AS telegram,
      CASE WHEN status NOT IN ('completed','cancelled') THEN 1 ELSE
        COALESCE((SELECT created_at FROM buyer_order_events e WHERE e.order_number=orders.number
          AND (e.event IN ('order.complete','order.markPickedUp','order.cancel','order.cancelled')
            OR (e.event IN ('composition.expired','composition.answered') AND json_extract(e.details,'$.stage')='cancelled'))
          ORDER BY id DESC LIMIT 1),created_at)>? END AS writable
     FROM orders WHERE number=? AND (?='seller' OR customer=?)`,
      now - writeWindow,
      number,
      actor.side,
      actor.id,
    )
    .toArray()[0];
  if (!row) throw new ApiError("FORBIDDEN", "Нет доступа к переписке");
  return row;
}
