import { GripVertical } from "lucide-react";
import { useRef, useState } from "react";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import type { PaymentOption } from "../../../../shared/contracts/seller-payments";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { ListItem } from "../../../../ui/ListItem";
import { Sheet } from "../../../../ui/Sheet";
import { Switch } from "../../../../ui/Switch";
import { type PaymentsData, useSellerSetting } from "../../settings-api";
import { BuyerPreview } from "./BuyerPreview";
import { MethodSheet } from "./PaymentMethodSheet";
import { SettingsEditor, type SettingsFrame } from "./SettingsEditor";

const path = "payments/settings";
const templates = [
  ["card", "Перевод на карту"],
  ["sbp", "СБП"],
  ["crypto", "Криптовалюта"],
  ["custom", "Свой"],
] as const;
const cash: PaymentOption = {
  id: "cash",
  name: "Наличные при получении",
  template: "cash",
  requiresReceipt: false,
  enabled: false,
};

export function PaymentSettings({ store, frame }: { store: string; frame: SettingsFrame }) {
  const query = useSellerSetting<PaymentsData>(store, path);
  return (
    <QueryBoundary query={query} template="form">
      {(data) =>
        !data.canWrite ? (
          frame(
            <>
              <p className="text-meta">Только просмотр</p>
              {data.options.map(({ id, name }) => (
                <ListItem key={id} title={name} />
              ))}
            </>,
          )
        ) : (
          <SettingsEditor
            data={data}
            store={store}
            path={path}
            frame={frame}
            select={({ options }) => ({
              options: options.filter((option): option is PaymentOption => "enabled" in option),
            })}
            payload={({ options }) => ({
              options: options.map(({ imageSrc: _image, ...option }) => option),
            })}
          >
            {(value, change, disabled) => (
              <PaymentList
                store={store}
                options={value.options}
                disabled={disabled}
                change={(options) => change({ options })}
              />
            )}
          </SettingsEditor>
        )
      }
    </QueryBoundary>
  );
}

function PaymentList({
  store,
  options,
  disabled,
  change,
}: {
  store: string;
  options: PaymentOption[];
  disabled: boolean;
  change: (next: PaymentOption[]) => void;
}) {
  const [add, setAdd] = useState(false);
  const [edit, setEdit] = useState<PaymentOption>();
  const dragged = useRef<string | undefined>(undefined);
  const save = (option: PaymentOption) =>
    change(
      options.some(({ id }) => id === option.id)
        ? options.map((item) => (item.id === option.id ? option : item))
        : [...options, option],
    );
  function move(id: string, target: string) {
    const from = options.findIndex((row) => row.id === id);
    const to = options.findIndex((row) => row.id === target);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...options];
    next.splice(to, 0, ...next.splice(from, 1));
    change(next);
  }
  return (
    <>
      <p className="text-small text-muted-foreground">Порядок совпадает с тем, что увидит покупатель</p>
      {!options.some(({ id }) => id === cash.id) && (
        <Card>
          <Switch label={cash.name} checked={false} onChange={() => save({ ...cash, enabled: true })} />
        </Card>
      )}
      {options.map((option, index) => (
        <Card key={option.id}>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="cursor-grab touch-none"
              draggable={!disabled}
              disabled={disabled}
              aria-label={`Переместить ${option.name}`}
              data-payment-id={option.id}
              onDragStart={(event) => {
                dragged.current = option.id;
                event.dataTransfer.setData("text/plain", option.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragged.current) move(dragged.current, option.id);
              }}
              onDragEnd={() => {
                dragged.current = undefined;
              }}
              onPointerDown={(event) => {
                if (event.pointerType !== "mouse") event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerUp={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                const receiver = document
                  .elementFromPoint(event.clientX, event.clientY)
                  ?.closest<HTMLElement>("[data-payment-id]");
                if (receiver?.dataset.paymentId) move(option.id, receiver.dataset.paymentId);
              }}
              onKeyDown={(event) => {
                if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                event.preventDefault();
                const target = options[index + (event.key === "ArrowUp" ? -1 : 1)];
                if (target) move(option.id, target.id);
              }}
            >
              <GripVertical size={18} />
            </Button>
            <div className="min-w-0 flex-1">
              <ListItem
                title={option.name}
                variant="compact"
                subtitle={option.description}
                onClick={disabled || option.template === "cash" ? undefined : () => setEdit(option)}
              />
            </div>
          </div>
          <Switch
            label={`Включить · ${option.name}`}
            checked={option.enabled}
            onChange={(event) => save({ ...option, enabled: event.target.checked })}
          />
        </Card>
      ))}
      <Button full variant="secondary" disabled={options.length >= 20} onClick={() => setAdd(true)}>
        Добавить способ
      </Button>
      {!options.some(({ enabled }) => enabled) && <Card role="status">Покупатели не смогут оформить заказ</Card>}
      {options.some(({ enabled }) => enabled) && (
        <BuyerPreview>
          {options
            .filter(({ enabled }) => enabled)
            .map(({ name }) => name)
            .join(" · ")}
        </BuyerPreview>
      )}
      {add && (
        <Sheet open title="Добавить способ" onOpenChange={setAdd}>
          {templates.map(([template, name]) => (
            <ListItem
              key={template}
              title={name}
              onClick={() => {
                setAdd(false);
                setEdit({ id: crypto.randomUUID(), template, name, requiresReceipt: true, enabled: true });
              }}
            />
          ))}
        </Sheet>
      )}
      {edit && (
        <MethodSheet
          store={store}
          initial={edit}
          remove={
            options.some(({ id }) => id === edit.id)
              ? () => {
                  change(options.filter(({ id }) => id !== edit.id));
                  setEdit(undefined);
                }
              : undefined
          }
          close={() => setEdit(undefined)}
          apply={(option) => {
            save(option);
            setEdit(undefined);
          }}
        />
      )}
    </>
  );
}
