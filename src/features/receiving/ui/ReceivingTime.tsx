import { Clock } from "lucide-react";
import { useState } from "react";
import type { AvailabilityDay, ReceivingMethod } from "../../../shared/contracts/receiving-time";
import { formatInterval, formatReceivingTime, formatShopDay } from "../../../shared/datetime";
import { HttpError } from "../../../shared/http-error";
import { shopTimeZone } from "../../../shared/shop-api";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { ListItem } from "../../../ui/ListItem";
import { Radio } from "../../../ui/Radio";
import { Sheet } from "../../../ui/Sheet";
import { SkeletonBlock } from "../../../ui/SkeletonBlock";
import { type ReceivingState, useAvailability, useSaveTime } from "../api";

function TimeOptions({
  method,
  days,
  mode,
  data,
  timeZone,
  close,
  retry,
}: {
  method: ReceivingMethod;
  days: AvailabilityDay[];
  mode: "slots" | "day";
  data: ReceivingState;
  timeZone: string;
  close: () => void;
  retry: () => void;
}) {
  const [date, setDate] = useState(data.time?.date);
  const [slotId, setSlotId] = useState(data.time?.slotId);
  const [other, setOther] = useState(false);
  const save = useSaveTime();
  const day = days.find((item) => item.date === date && item.available) ?? days.find((item) => item.available);
  const slot = day?.intervals.find((item) => item.id === slotId && item.available);
  const now = Date.now();
  const selectDay = (next: string) => {
    setDate(next);
    setSlotId(undefined);
    setOther(false);
    save.reset();
  };
  const reset = () => {
    setSlotId(undefined);
    save.reset();
    retry();
  };
  return (
    <div className="space-y-3">
      {!day ? (
        <>
          <p role="status">Нет свободных дат</p>
          <Button full variant="secondary" onClick={reset}>
            Обновить доступность
          </Button>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {days.slice(0, 2).map((item) => (
              <Chip
                key={item.date}
                selected={!other && day.date === item.date}
                disabled={!item.available || save.isPending}
                onClick={() => selectDay(item.date)}
              >
                {formatShopDay(item.date, timeZone, now, true)}
              </Chip>
            ))}
            <Chip
              selected={other || days.slice(2).some((item) => item.date === day.date)}
              disabled={save.isPending || days.length <= 2}
              onClick={() => setOther(!other)}
            >
              Другой день
            </Chip>
          </div>
          {other ? (
            days
              .slice(2)
              .map((item) => (
                <ListItem
                  key={item.date}
                  title={formatShopDay(item.date, timeZone, now)}
                  value={item.available ? undefined : "Занято"}
                  onClick={item.available ? () => selectDay(item.date) : undefined}
                />
              ))
          ) : (
            <>
              <h3 className="text-title-3">{formatShopDay(day.date, timeZone, now)}</h3>
              <p className="text-meta text-muted-foreground">Доступное время по расписанию магазина</p>
              {mode === "day" ? (
                <p>{method === "delivery" ? "Привезём" : "Заберёте"} в течение дня, без выбора часов</p>
              ) : (
                <fieldset aria-label="Доступное время">
                  {day.intervals.map((item) => (
                    <Radio
                      key={item.id}
                      name="receiving-time"
                      label={`${formatInterval(item.id)}${item.reason === "full" ? " · Занято" : ""}`}
                      checked={item.id === slot?.id}
                      disabled={!item.available || save.isPending}
                      onChange={() => {
                        setSlotId(item.id);
                        save.reset();
                      }}
                    />
                  ))}
                </fieldset>
              )}
              {save.error && (
                <div role="alert" className="space-y-2 text-status-danger-foreground">
                  <p>{save.error.message}</p>
                  <Button full variant="secondary" onClick={reset}>
                    {save.error instanceof HttpError && save.error.code === "SLOT_TAKEN"
                      ? "Выбрать другое время"
                      : "Обновить доступность"}
                  </Button>
                </div>
              )}
              <Button
                full
                loading={save.isPending}
                disabled={mode === "slots" && !slot}
                onClick={() =>
                  save.mutate(
                    {
                      expectedRevision: data.revision,
                      time: { date: day.date, slotId: mode === "slots" ? slot?.id : undefined },
                    },
                    { onSuccess: close },
                  )
                }
              >
                {mode === "day" ? "Выбрать день" : slot ? `Выбрать ${formatInterval(slot.id)}` : "Выбрать время"}
              </Button>
            </>
          )}
        </>
      )}
      <Button full variant="ghost" onClick={close}>
        Назад
      </Button>
    </div>
  );
}

export function ReceivingTime({
  data,
  open,
  setOpen,
  disabled = false,
}: {
  data: ReceivingState;
  open: boolean;
  setOpen: (open: boolean) => void;
  disabled?: boolean;
}) {
  const method = data.receiving?.mode;
  const query = useAvailability(method);
  const availability = query.data;
  const close = () => setOpen(false);
  if (!method) return null;
  const title = method === "delivery" ? "Когда привезти" : "Когда заберёте";
  const sheetTitle = method === "delivery" ? "Когда привезти заказ" : "Когда заберёте заказ";
  return (
    <>
      <ListItem
        title={availability?.mode === "after_order" ? "Договоримся после заказа" : title}
        subtitle={
          availability?.mode === "after_order"
            ? "Магазин свяжется с вами"
            : data.time
              ? formatReceivingTime(data.time, availability?.timeZone ?? shopTimeZone)
              : "Выберите удобное время"
        }
        icon={<Clock size={22} />}
        onClick={disabled || availability?.mode === "after_order" ? undefined : () => setOpen(true)}
      />
      <Sheet title={sheetTitle} open={open} onOpenChange={setOpen}>
        {open &&
          (query.isPending ? (
            <div role="status" aria-label="Проверяем доступность">
              <SkeletonBlock className="h-28" />
            </div>
          ) : query.isError ? (
            <div className="space-y-3">
              <p role="alert">{navigator.onLine ? "Не удалось проверить время" : "Нет подключения к интернету"}</p>
              <Button full variant="secondary" onClick={() => void query.refetch()}>
                Повторить проверку
              </Button>
            </div>
          ) : availability && availability.mode !== "after_order" ? (
            <TimeOptions
              method={method}
              mode={availability.mode}
              days={availability.days}
              data={data}
              timeZone={availability.timeZone}
              close={close}
              retry={() => void query.refetch()}
            />
          ) : (
            <p>Согласуем после заказа</p>
          ))}
      </Sheet>
    </>
  );
}
