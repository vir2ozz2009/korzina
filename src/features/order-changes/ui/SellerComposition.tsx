import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { useToast } from "../../../app/shell/ToastProvider";
import { type CompositionEdits, type OrderLine, orderLineKey } from "../../../shared/contracts/order-changes";
import type { SellerOrder } from "../../../shared/contracts/seller-order";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Checkbox } from "../../../ui/Checkbox";
import { IconButton } from "../../../ui/IconButton";
import { Input } from "../../../ui/Input";
import { ProductRow } from "../../../ui/ProductRow";
import { Sheet } from "../../../ui/Sheet";
import { StickyFooter } from "../../../ui/StickyFooter";
import { useCompositionQuote, useProposeComposition } from "../api";
import { ChangeAmount, ChangeTotals } from "./ChangeTotals";
import { ReplacementPicker } from "./ReplacementPicker";

export function SellerComposition({
  store,
  order,
  pending,
  pack,
  packAll,
  cancel,
  onDraft,
}: {
  store: string;
  order: SellerOrder;
  pending: boolean;
  pack: (id: string, checked: boolean) => void;
  packAll: () => void;
  cancel: () => void;
  onDraft: (draft: boolean) => void;
}) {
  const [edits, setEdits] = useState<CompositionEdits["edits"]>([]);
  const [line, setLine] = useState<OrderLine>();
  const [mode, setMode] = useState<"menu" | "unavailable" | "replace">("menu");
  const [quantity, setQuantity] = useState("0");
  const toast = useToast();
  const input = { expectedVersion: order.revision, edits };
  const quote = useCompositionQuote(store, order.number, input);
  const send = useProposeComposition(store, order.number);
  const editable = !order.handedOff && order.stage !== "cancelled" && order.stage !== "completed";
  const packing = order.stage === "accepted" && order.permissions.assembly;
  const close = () => setLine(undefined);

  function update(id: string, next?: CompositionEdits["edits"][number]) {
    send.reset();
    const values = edits.filter((edit) => !("lineId" in edit) || edit.lineId !== id);
    if (next) values.push(next);
    setEdits(values);
    onDraft(values.length > 0);
    close();
  }

  return (
    <Card>
      <h2 id="order-packing" tabIndex={-1} className="scroll-mt-24 text-title-3">
        Состав заказа
      </h2>
      <p className="text-meta text-muted-foreground">
        Собрано {order.packed.length} из {order.lines.length}
      </p>
      {order.lines.map((item) => {
        const id = orderLineKey(item);
        const edit = edits.find((value) => "lineId" in value && value.lineId === id);
        const planned = quote.data?.lines.find((value) => value.id === id);
        const locked = order.composition?.lines.some((value) => value.id === id && value.status === "pending");
        const open = () => {
          setLine(item);
          setMode("menu");
          setQuantity("0");
        };
        return (
          <div key={id} className="border-b border-border pb-2 last:border-0">
            <div className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <ProductRow
                  name={item.name}
                  unit={item.unit}
                  image={item.image ?? undefined}
                  quantity={item.quantity}
                  amountMinor={item.totalMinor}
                  currency={order.currency}
                  onOpen={editable && !locked && !send.isPending ? open : undefined}
                />
              </div>
              {editable && !locked && (
                <IconButton aria-label={`Изменить ${item.name}`} disabled={send.isPending} onClick={open}>
                  <MoreHorizontal aria-hidden size={20} />
                </IconButton>
              )}
            </div>
            {edit && (
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  {edit.kind === "replace"
                    ? `Замена${planned?.after ? `: ${planned.after.name}` : ""}`
                    : edit.quantity
                      ? `Есть ${edit.quantity} из ${item.quantity}`
                      : "Нет в наличии"}
                </span>
                {planned && <ChangeAmount delta={planned.deltaMinor} currency={order.currency} />}
                <Button variant="ghost" disabled={send.isPending} onClick={() => update(id)}>
                  Отменить отметку
                </Button>
              </div>
            )}
            {(packing || order.packed.includes(id)) && (
              <Checkbox
                label={`Собрано · ${item.name}`}
                checked={order.packed.includes(id)}
                disabled={!packing || pending || send.isPending}
                onChange={(event) => pack(id, event.target.checked)}
              />
            )}
          </div>
        );
      })}
      {packing && order.packed.length < order.lines.length && (
        <Button variant="soft" full disabled={pending} onClick={packAll}>
          Отметить все собранными
        </Button>
      )}
      {edits.length > 0 && (
        <StickyFooter>
          {quote.data && <ChangeTotals totals={quote.data.totals} seller />}
          {quote.isFetching && <p role="status">Пересчитываем итог…</p>}
          {(quote.error || send.error) && <p role="alert">{(send.error ?? quote.error)?.message}</p>}
          {quote.error && (
            <Button full variant="secondary" onClick={() => void quote.refetch()}>
              Повторить сверку
            </Button>
          )}
          <Button
            full
            loading={send.isPending}
            disabled={!quote.data || quote.isFetching || quote.isError}
            onClick={() => {
              if (!quote.data) return;
              send.mutate(
                { ...input, quote: quote.data.quote },
                {
                  onSuccess: () => {
                    setEdits([]);
                    onDraft(false);
                    toast("Покупателю сообщили");
                  },
                  onError: () => {
                    void quote.refetch();
                  },
                },
              );
            }}
          >
            Сообщить покупателю ({edits.length})
          </Button>
          <p className="text-center text-small">Отсутствующее уберём сразу, на замены ждём ответа 30 минут</p>
        </StickyFooter>
      )}
      {line &&
        (mode === "replace" ? (
          <ReplacementPicker
            store={store}
            number={order.number}
            line={line}
            back={() => setMode("menu")}
            choose={(variantId, count) =>
              update(orderLineKey(line), { kind: "replace", lineId: orderLineKey(line), variantId, quantity: count })
            }
          />
        ) : (
          <Sheet
            open
            title={line.name}
            onOpenChange={(open) => {
              if (!open) close();
            }}
          >
            {mode === "menu" ? (
              <>
                <Button full variant="secondary" onClick={() => setMode("unavailable")}>
                  Нет в наличии
                </Button>
                <Button full variant="secondary" onClick={() => setMode("replace")}>
                  Заменить
                </Button>
              </>
            ) : (
              <>
                <Input
                  label="Сколько есть"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={line.quantity - 1}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
                {order.lines.length === 1 && Number(quantity) === 0 ? (
                  <Button
                    full
                    variant="secondary"
                    onClick={() => {
                      close();
                      cancel();
                    }}
                  >
                    Отменить заказ
                  </Button>
                ) : (
                  <Button
                    full
                    disabled={!/^\d+$/u.test(quantity) || Number(quantity) >= line.quantity}
                    onClick={() =>
                      update(orderLineKey(line), {
                        kind: "unavailable",
                        lineId: orderLineKey(line),
                        quantity: Number(quantity),
                      })
                    }
                  >
                    Отметить
                  </Button>
                )}
              </>
            )}
          </Sheet>
        ))}
    </Card>
  );
}
