import { lazy, Suspense, useState } from "react";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import { formatMinor } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { Input } from "../../../../ui/Input";
import { Switch } from "../../../../ui/Switch";
import { type ReceivingSettingsData, useSellerSetting } from "../../settings-api";
import { BuyerPreview } from "./BuyerPreview";
import { DeliveryFields } from "./DeliveryFields";
import { MoneyField } from "./MoneyField";
import { PauseCard } from "./PauseCard";
import { SettingsEditor, type SettingsFrame } from "./SettingsEditor";

const path = "receiving/settings";
const free = { kind: "free" } as const;
const pointDefault = { lat: 10.7769, lon: 106.7009 };
const MapEditor = lazy(() => import("./ZoneEditor").then(({ ZoneEditor }) => ({ default: ZoneEditor })));
const fields = [
  ["apartment", "Квартира"],
  ["entrance", "Подъезд"],
  ["floor", "Этаж"],
  ["intercom", "Домофон"],
] as const;

export function DeliverySettings({ store, frame }: { store: string; frame: SettingsFrame }) {
  const query = useSellerSetting<ReceivingSettingsData>(store, path);
  return (
    <QueryBoundary query={query} template="form">
      {(data) => (
        <SettingsEditor
          store={store}
          frame={frame}
          path={path}
          data={data}
          select={({ delivery, pickup, requiredDetails, minimumMinor }) => ({
            delivery,
            pickup,
            requiredDetails,
            minimumMinor,
          })}
          valid={({ pickup, delivery, minimumMinor }) =>
            Number.isSafeInteger(minimumMinor) &&
            minimumMinor >= 0 &&
            minimumMinor <= 1_000_000_000_000 &&
            (!pickup || !!(pickup.address.trim() && pickup.hours.trim())) &&
            (delivery?.mode !== "text" ||
              delivery.tariff.kind !== "fixed" ||
              (Number.isSafeInteger(delivery.tariff.feeMinor) &&
                delivery.tariff.feeMinor > 0 &&
                delivery.tariff.feeMinor <= 1_000_000_000_000)) &&
            (delivery?.mode !== "map" ||
              delivery.zones.every(({ geometry }) => geometry.type === "radius" || geometry.points.length >= 3))
          }
        >
          {(value, change, disabled) => (
            <>
              <PauseCard store={store} />
              {data.mapsFallback && <Card role="status">Карта отключена. Проверьте условия доставки.</Card>}
              <Card>
                <Switch
                  label="Доставка"
                  checked={!!value.delivery}
                  onChange={(event) =>
                    change({
                      ...value,
                      delivery: event.target.checked ? { mode: "text", payee: "shop", tariff: free } : undefined,
                    })
                  }
                />
                {value.delivery && (
                  <DeliveryFields
                    store={store}
                    value={value.delivery}
                    maps={data.maps}
                    currency={data.currency}
                    disabled={disabled}
                    change={(delivery) => change({ ...value, delivery })}
                  />
                )}
              </Card>
              <Card>
                <Switch
                  label="Самовывоз"
                  checked={!!value.pickup}
                  onChange={(event) =>
                    change({
                      ...value,
                      pickup: event.target.checked ? { address: "", hours: "" } : undefined,
                    })
                  }
                />
                {value.pickup && (
                  <PickupFields
                    value={value.pickup}
                    change={(pickup) => change({ ...value, pickup })}
                    maps={data.maps}
                    disabled={disabled}
                  />
                )}
              </Card>
              {value.delivery && (
                <Card>
                  <h2 className="text-title-3">Обязательные поля адреса</h2>
                  {fields.map(([field, label]) => (
                    <Switch
                      key={field}
                      label={label}
                      checked={value.requiredDetails.includes(field)}
                      onChange={(event) =>
                        change({
                          ...value,
                          requiredDetails: event.target.checked
                            ? [...value.requiredDetails, field]
                            : value.requiredDetails.filter((item) => item !== field),
                        })
                      }
                    />
                  ))}
                </Card>
              )}
              <Card>
                <MoneyField
                  label="Минимальная сумма заказа"
                  currency={data.currency}
                  amount={value.minimumMinor}
                  change={(minimumMinor) => change({ ...value, minimumMinor })}
                />
                <BuyerPreview>
                  {Number.isSafeInteger(value.minimumMinor) && value.minimumMinor > 0
                    ? `Заказ от ${formatMinor(value.minimumMinor, data.currency)}`
                    : "Без минимальной суммы"}
                </BuyerPreview>
              </Card>
              {!value.delivery && !value.pickup && <p role="status">Покупатели не смогут оформить заказ</p>}
            </>
          )}
        </SettingsEditor>
      )}
    </QueryBoundary>
  );
}

function PickupFields({
  value,
  change,
  maps,
  disabled,
}: {
  value: NonNullable<ReceivingSettingsData["pickup"]>;
  change: (value: NonNullable<ReceivingSettingsData["pickup"]>) => void;
  maps: boolean;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Input
        label="Адрес самовывоза"
        value={value.address}
        onChange={(event) => change({ ...value, address: event.target.value })}
      />
      <Input
        label="Часы самовывоза"
        value={value.hours}
        onChange={(event) => change({ ...value, hours: event.target.value })}
      />
      {maps && (
        <Button variant="secondary" disabled={disabled} onClick={() => setOpen(true)}>
          Точка самовывоза
        </Button>
      )}
      {open && (
        <Suspense fallback={<p>Загружаем карту…</p>}>
          <MapEditor
            close={() => setOpen(false)}
            zone={{
              id: "pickup",
              tariff: free,
              geometry: { type: "radius", radiusMeters: 1, center: value.point ?? pointDefault },
            }}
            pointOnly
            save={({ geometry }) => {
              if (geometry.type === "radius") change({ ...value, point: geometry.center });
              setOpen(false);
            }}
          />
        </Suspense>
      )}
      <BuyerPreview>{[value.address || "Адрес самовывоза", value.hours].filter(Boolean).join(" · ")}</BuyerPreview>
    </>
  );
}
