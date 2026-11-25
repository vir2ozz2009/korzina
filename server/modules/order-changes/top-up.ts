import { paymentSettingsInput } from "../../../src/shared/contracts/checkout";
import { ApiError } from "../../../src/shared/errors";
import type { CommandIdentity } from "../../middleware/idempotency";
import { executeCommand } from "../../shop/commands";
import type { ShopEnv } from "../../shop/env";
import { buyerOrder, buyerOrderRow } from "../checkout/buyer-orders";
import { orderBalance, orderFinance } from "../checkout/order-workflow";
import { checkoutPayments, paymentOptions } from "../checkout/payment-settings";
import { type ChangeState, readChangeState } from "./state";
import { writeOrderChange } from "./write";

type Shop = ShopEnv["Bindings"];
function choices(env: Shop, state: ChangeState) {
  const { row, snapshot, work } = state;
  const balance = orderBalance(orderFinance(work, snapshot, row.payment_status), snapshot.totalMinor, row.status);
  if (!balance.debtMinor || row.status === "cancelled") throw new ApiError("ORDER_CLOSED", "Доплата недоступна");
  const raw = env.storage.sql
    .exec<{ value: string }>("SELECT value FROM settings WHERE key='purchase_payment'")
    .toArray()[0];
  const settings = checkoutPayments(
    paymentSettingsInput.parse(raw ? JSON.parse(raw.value) : { minimumMinor: 0, methods: [] }),
  );
  return {
    options: paymentOptions(settings).filter(({ enabled }) => enabled),
    amountMinor: balance.debtMinor,
    selected: work.topUpPayment?.id ?? snapshot.paymentOption?.id ?? (snapshot.payment === "cash" ? "cash" : undefined),
  };
}

export function topUpChoices(env: Shop, customer: string, number: number) {
  return choices(env, readChangeState(buyerOrderRow(env.storage, customer, number)));
}

export function chooseTopUp(
  env: Shop,
  customer: string,
  number: number,
  input: { expectedVersion: number; methodId: string },
  identity: CommandIdentity,
) {
  const { storage } = env;
  return executeCommand(storage, env.db, `topup:${customer}:${number}`, identity, () => {
    const state = readChangeState(buyerOrderRow(storage, customer, number));
    if (input.expectedVersion !== state.row.version)
      throw new ApiError("VERSION_CONFLICT", "Заказ изменился. Обновите карточку.");
    if (state.work.topUp?.status === "pending_review")
      throw new ApiError("INVALID_TRANSITION", "Подтверждение уже отправлено");
    const option = choices(env, state).options.find(({ id }) => id === input.methodId);
    if (!option) throw new ApiError("PAYMENT_METHOD_UNAVAILABLE", "Этот способ оплаты недоступен");
    state.work.topUpPayment = option;
    writeOrderChange(storage, state, customer, "order.topUpMethod", { methodId: option.id }, Date.now());
    env.changes.order(number);
    return { status: 200, body: buyerOrder(state.row) };
  }).body;
}
