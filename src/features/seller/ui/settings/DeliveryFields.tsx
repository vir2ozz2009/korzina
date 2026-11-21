import { lazy, Suspense, useState } from "react";
import type { DeliveryZone, ReceivingAvailability } from "../../../../shared/contracts/receiving";
import { HttpError } from "../../../../shared/http-error";
import { formatMinor } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { Chip } from "../../../../ui/Chip";
import { Input } from "../../../../ui/Input";
import { ListItem } from "../../../../ui/ListItem";
import { Select } from "../../../../ui/Select";
import { type ReceivingSettingsData, sellerSettingRequest } from "../../settings-api";
import { BuyerPreview } from "./BuyerPreview";
import { CitySheet } from "./CitySheet";
import { TariffFields } from "./TariffFields";

const pointDefault = { lat: 10.7769, lon: 106.7009 };
const MapEditor = lazy(() => import("./ZoneEditor").then(({ ZoneEditor }) => ({ default: ZoneEditor })));
type Delivery = NonNullable<ReceivingSettingsData["delivery"]>;

export function DeliveryFields({
  store,
  value,
  maps,
  currency,
  disabled,
  change,
}: {
  store: string;
  value: Delivery;
  maps: boolean;
  currency: string;
  disabled: boolean;
  change: (value: Delivery) => void;
}) {
  const [edit, setEdit] = useState<DeliveryZone>();
  const [cityOpen, setCityOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [result, setResult] = useState("");
  const [checking, setChecking] = useState(false);
  const tariff =
    value.mode === "text"
      ? value.tariff
      : value.mode === "map"
        ? (value.defaultTariff ?? value.zones[0].tariff)
        : value.districts[0].tariff;
  const selectMode = (mode: "text" | "map") =>
    change(
      mode === "text"
        ? { mode, payee: value.payee, tariff }
        : {
            mode,
            payee: value.payee,
            defaultTariff: tariff,
            zones: [
              {
                id: crypto.randomUUID(),
                geometry: { type: "radius", center: pointDefault, radiusMeters: 1000 },
                tariff,
              },
            ],
          },
    );
  async function check() {
    setChecking(true);
    try {
      const { availability } = await sellerSettingRequest<{ availability: ReceivingAvailability }>(
        store,
        "receiving/check",
        {
          method: "POST",
          body: JSON.stringify({
            delivery: value,
            receiving: { mode: "delivery", address },
            geocode: { type: "search", address },
          }),
        },
      );
      setResult(
        availability.available && availability.mode === "delivery"
          ? `Адрес внутри зоны · ${availability.feeMinor === null ? "Расчёт после заказа" : formatMinor(availability.feeMinor, currency)}`
          : "Адрес за пределами зоны",
      );
    } catch (error) {
      setResult(
        error instanceof HttpError && error.code === "ADDRESS_NOT_FOUND"
          ? error.message
          : "Не удалось проверить адрес. Попробуйте ещё раз.",
      );
    } finally {
      setChecking(false);
    }
  }
  return (
    <>
      <h3 className="text-label">Где доставляем</h3>
      <div className="flex flex-wrap gap-2">
        <Chip selected={value.mode === "text"} onClick={() => selectMode("text")}>
          Куда угодно
        </Chip>
        {maps && (
          <Chip selected={value.mode === "map" && !!value.city} onClick={() => setCityOpen(true)}>
            Только в моём городе
          </Chip>
        )}
        {maps && (
          <Chip selected={value.mode === "map" && !value.city} onClick={() => selectMode("map")}>
            Зона на карте
          </Chip>
        )}
      </div>
      {value.mode === "districts" && (
        <p className="text-small text-muted-foreground">Сохранённые условия доставки по районам</p>
      )}
      {value.mode !== "districts" && (
        <TariffFields
          tariff={tariff}
          currency={currency}
          setTariff={(next) => {
            if (value.mode === "text") change({ ...value, tariff: next });
            if (value.mode === "map")
              change({
                ...value,
                defaultTariff: next,
                zones: value.zones.map((zone) => {
                  const customTariff = zone.customTariff ?? JSON.stringify(zone.tariff) !== JSON.stringify(tariff);
                  return customTariff ? { ...zone, customTariff } : { ...zone, tariff: next, customTariff };
                }),
              });
          }}
        />
      )}
      <Select
        label="Кому платят за доставку"
        value={value.payee}
        disabled={disabled}
        options={[
          { value: "shop", label: "Магазину" },
          { value: "courier", label: "Курьеру" },
        ]}
        onChange={(payee) => change({ ...value, payee: payee === "courier" ? "courier" : "shop" })}
      />
      <BuyerPreview>{`Доставка · ${tariff.kind === "free" ? "Бесплатно" : tariff.kind === "after_order" ? "Посчитаем после заказа" : Number.isSafeInteger(tariff.feeMinor) && tariff.feeMinor > 0 ? formatMinor(tariff.feeMinor, currency) : "Укажите цену"}`}</BuyerPreview>
      {value.mode === "map" && (
        <>
          {value.city && <p className="text-small">{value.city}</p>}
          {value.zones.map((zone, index) => (
            <ListItem
              key={zone.id}
              title={`Зона ${index + 1}`}
              onClick={
                disabled
                  ? undefined
                  : () =>
                      setEdit({
                        ...zone,
                        customTariff: zone.customTariff ?? JSON.stringify(zone.tariff) !== JSON.stringify(tariff),
                      })
              }
            />
          ))}
          {!value.city && (
            <Button
              full
              variant="secondary"
              disabled={value.zones.length >= 30}
              onClick={() =>
                setEdit({
                  id: crypto.randomUUID(),
                  geometry: { type: "radius", center: pointDefault, radiusMeters: 1000 },
                  tariff,
                })
              }
            >
              Добавить зону
            </Button>
          )}
          <Input
            label="Проверить адрес на карте"
            value={address}
            maxLength={300}
            disabled={checking}
            onChange={(event) => {
              setAddress(event.target.value);
              setResult("");
            }}
          />
          <Button
            variant="secondary"
            loading={checking}
            disabled={address.trim().length < 3}
            onClick={() => void check()}
          >
            Проверить адрес
          </Button>
          {result && <p role="status">{result}</p>}
        </>
      )}
      {edit && value.mode === "map" && (
        <Suspense fallback={<p>Загружаем карту…</p>}>
          <MapEditor
            zone={edit}
            currency={currency}
            inheritedTariff={tariff}
            close={() => setEdit(undefined)}
            remove={
              value.zones.length > 1 && value.zones.some((zone) => zone.id === edit.id)
                ? () => {
                    change({ ...value, zones: value.zones.filter((zone) => zone.id !== edit.id) });
                    setEdit(undefined);
                  }
                : undefined
            }
            save={(zone) => {
              change({
                ...value,
                zones: value.zones.some(({ id }) => id === zone.id)
                  ? value.zones.map((item) => (item.id === zone.id ? zone : item))
                  : [...value.zones, zone],
              });
              setEdit(undefined);
            }}
          />
        </Suspense>
      )}
      {cityOpen && (
        <CitySheet
          store={store}
          close={() => setCityOpen(false)}
          choose={({ name, center, boundary }) => {
            const zone: DeliveryZone = {
              id: crypto.randomUUID(),
              tariff,
              geometry: boundary
                ? { type: "polygon", points: boundary }
                : { type: "radius", center, radiusMeters: 1000 },
            };
            change({ mode: "map", city: name, payee: value.payee, defaultTariff: tariff, zones: [zone] });
            setCityOpen(false);
            setEdit(zone);
          }}
        />
      )}
    </>
  );
}
