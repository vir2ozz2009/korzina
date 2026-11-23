import { useState } from "react";
import { QueryBoundary } from "../../../app/shell/QueryBoundary";
import { useToast } from "../../../app/shell/ToastProvider";
import type { TimeChange, TimeChangeInput } from "../../../shared/contracts/order-changes";
import type { TimeChoice } from "../../../shared/contracts/receiving-time";
import { formatReceivingTime, formatShopDay } from "../../../shared/datetime";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Radio } from "../../../ui/Radio";
import { Sheet } from "../../../ui/Sheet";
import { useChangeTime, useOrderAvailability } from "../api";

export function TimeControls({
  number,
  revision,
  store,
  time,
  timeZone,
  change,
  editable,
  compositionPending,
}: {
  number: number;
  revision: number;
  store?: string;
  time: TimeChoice | null;
  timeZone: string;
  change?: TimeChange;
  editable: boolean;
  compositionPending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<TimeChoice>();
  const availability = useOrderAvailability(number, open, store);
  const command = useChangeTime(number, store);
  const toast = useToast();
  const side = store ? "seller" : "buyer";
  const active = change?.status === "pending";
  const offered = active && change.by !== side;
  const own = active && change.by === side;
  const format = (value: TimeChoice | null) => (value ? formatReceivingTime(value, timeZone) : "Время согласуем");
  const show = () => {
    command.reset();
    setChoice(undefined);
    setOpen(true);
  };
  const submit = (input: TimeChangeInput) =>
    command.mutate(input, {
      onSuccess: () => {
        setOpen(false);
        toast(input.action === "accept" || (!time && store) ? "Время изменено" : "Готово");
      },
      onError: () => {
        if (open) void availability.refetch();
      },
    });
  if (!editable && !change) return null;
  return (
    <>
      {active && (
        <Card>
          <h2 className="text-title-3">
            {change.by === "seller" ? "Магазин предлагает другое время" : "Покупатель просит изменить время"}
          </h2>
          <p>Сейчас · {format(time)}</p>
          <p className="text-label">Предложено · {format(change.proposed)}</p>
          {offered && editable && (
            <div className="grid gap-2">
              <Button
                full
                loading={command.isPending}
                onClick={() => submit({ action: "accept", expectedVersion: revision, changeId: change.id })}
              >
                Подходит
              </Button>
              <Button full variant="secondary" disabled={command.isPending} onClick={show}>
                {store ? "Предложить другое" : "Выбрать другое время"}
              </Button>
              {store && (
                <Button
                  full
                  variant="ghost"
                  disabled={command.isPending}
                  onClick={() => submit({ action: "keep", expectedVersion: revision, changeId: change.id })}
                >
                  Оставить прежнее время
                </Button>
              )}
            </div>
          )}
          {own && editable && (
            <Button
              full
              variant="secondary"
              disabled={command.isPending}
              onClick={() => submit({ action: "withdraw", expectedVersion: revision, changeId: change.id })}
            >
              Отозвать предложение
            </Button>
          )}
        </Card>
      )}
      {change && !active && (
        <p className="text-small" role="status">
          {change.status === "accepted"
            ? `Время изменено · ${format(time)}`
            : change.status === "withdrawn"
              ? "Предложение отозвано"
              : "Время осталось прежним"}
        </p>
      )}
      {editable && !active && !compositionPending && (
        <Button full variant="secondary" onClick={show}>
          {store ? "Изменить время" : "Попросить другое время"}
        </Button>
      )}
      {!open && command.error && <p role="alert">{command.error.message}</p>}
      {open && (
        <Sheet
          open
          title={store ? "Новое время" : "Выбрать другое время"}
          onOpenChange={(visible) => {
            if (!visible && !command.isPending) setOpen(false);
          }}
        >
          <QueryBoundary query={availability} template="form">
            {(data) => {
              const options = data.days
                .flatMap<TimeChoice>((day) =>
                  data.mode === "day"
                    ? day.available
                      ? [{ date: day.date }]
                      : []
                    : day.intervals
                        .filter((slot) => slot.available)
                        .map((slot) => ({ date: day.date, slotId: slot.id })),
                )
                .filter((option) => option.date !== time?.date || option.slotId !== time?.slotId);
              const selected = options.find((value) => value.date === choice?.date && value.slotId === choice?.slotId);
              return (
                <>
                  <p className="text-small">Часовой пояс магазина · {data.timeZone}</p>
                  {!options.length && <p>Свободного времени пока нет</p>}
                  <fieldset className="space-y-1" disabled={command.isPending}>
                    {options.map((option) => (
                      <Radio
                        key={`${option.date}:${option.slotId ?? ""}`}
                        name="order-time"
                        label={
                          data.mode === "day"
                            ? `${formatShopDay(option.date, data.timeZone)} · В течение дня`
                            : formatReceivingTime(option, data.timeZone)
                        }
                        checked={option.date === choice?.date && option.slotId === choice?.slotId}
                        onChange={() => setChoice(option)}
                      />
                    ))}
                  </fieldset>
                  {command.error && <p role="alert">{command.error.message}</p>}
                  <Button
                    full
                    disabled={!selected}
                    loading={command.isPending}
                    onClick={() => {
                      if (!selected) return;
                      submit(
                        offered && change
                          ? { action: "counter", expectedVersion: revision, changeId: change.id, time: selected }
                          : { action: "propose", expectedVersion: revision, time: selected },
                      );
                    }}
                  >
                    {store ? (time ? "Предложить время" : "Сохранить время") : "Попросить перенос"}
                  </Button>
                </>
              );
            }}
          </QueryBoundary>
        </Sheet>
      )}
    </>
  );
}
