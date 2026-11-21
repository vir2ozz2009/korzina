import { useState } from "react";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Dialog } from "../../../ui/Dialog";
import { Switch } from "../../../ui/Switch";
import type { AdminShop } from "../api";
import { useShopCommand } from "./useShopCommand";

export function AdminShopActions({ shop }: { shop: AdminShop }) {
  const command = useShopCommand(shop.id);
  const [pause, setPause] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const incomplete = shop.status === "draft" && shop.readiness?.items.some(({ ready }) => !ready);
  const label = shop.status === "draft" ? "Открыть магазин" : shop.status === "paused" ? "Возобновить" : "Пауза";
  const choose = (status: "active" | "paused") =>
    command.submit({ action: "status", version: shop.version, status }, () => setPause(false));
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-title-3">Статус</h2>
        <Button
          variant={shop.status === "active" ? "secondary" : "primary"}
          loading={command.pending && !pause && !forceOpen}
          disabled={shop.status === "draft" && !shop.currency}
          onClick={() => {
            if (shop.status === "active") setPause(true);
            else if (incomplete) setForceOpen(true);
            else choose("active");
          }}
        >
          {label}
        </Button>
      </div>
      {shop.status === "draft" && !shop.currency && <p className="text-caption">Выберите валюту в данных магазина</p>}
      {shop.statusNotice && <p role="status">{shop.statusNotice}</p>}
      {command.error && <p role="alert">{command.error}</p>}
      <Dialog
        open={forceOpen}
        onOpenChange={setForceOpen}
        title="Не всё готово. Открыть всё равно?"
        description={command.error ?? "Покупатели смогут зайти на витрину магазина."}
        confirm="Открыть магазин"
        loading={command.pending}
        onConfirm={() =>
          command.submit({ action: "status", version: shop.version, status: "active", force: true }, () =>
            setForceOpen(false),
          )
        }
      />
      <Dialog
        open={pause}
        onOpenChange={setPause}
        title="Поставить магазин на паузу?"
        description={command.error ?? "Витрина останется открыта. Новые заказы принимать нельзя."}
        confirm="Пауза"
        loading={command.pending}
        onConfirm={() => choose("paused")}
      />
    </Card>
  );
}

export function AdminShopExtras({ shop }: { shop: AdminShop }) {
  const command = useShopCommand(shop.id);
  return (
    <>
      <Card>
        <h2 className="text-title-3">Дополнения</h2>
        {shop.flags.map((flag) => (
          <Switch
            key={flag.key}
            label={flag.description}
            checked={flag.enabled}
            disabled={command.pending}
            onChange={(event) =>
              command.submit({
                action: "feature",
                version: shop.version,
                key: flag.key,
                enabled: event.target.checked,
              })
            }
          />
        ))}
        {command.error && <p role="alert">{command.error}</p>}
      </Card>
      <Card>
        <h2 className="text-title-3">Цифры</h2>
        <dl className="grid grid-cols-3 gap-2">
          {(
            [
              ["Товары", shop.productCount],
              ["Заказы за 7 дней", shop.orders7d],
              ["Заказы за 30 дней", shop.orders30d],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg bg-input p-2">
              <dt className="text-small text-muted-foreground">{label}</dt>
              <dd className="text-title-3">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}
