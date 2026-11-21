import { useState } from "react";
import type { DeliveryTariff, DeliveryZone, Point } from "../../../../shared/contracts/receiving";
import { AddressMap } from "../../../../ui/AddressMap";
import { Button } from "../../../../ui/Button";
import { Chip } from "../../../../ui/Chip";
import { Input } from "../../../../ui/Input";
import { Sheet } from "../../../../ui/Sheet";
import { Switch } from "../../../../ui/Switch";
import { TariffFields } from "./TariffFields";

const defaultCenter = { lat: 10.7769, lon: 106.7009 };

export function ZoneEditor({
  zone,
  currency,
  inheritedTariff,
  pointOnly,
  pointTitle,
  close,
  save,
  remove,
}: {
  zone: DeliveryZone;
  currency?: string;
  inheritedTariff?: DeliveryTariff;
  pointOnly?: boolean;
  close: () => void;
  save: (zone: DeliveryZone) => void;
  remove?: () => void;
  pointTitle?: string;
}) {
  const [draft, setDraft] = useState(zone);
  const [mapError, setMapError] = useState(false);
  const [center] = useState(() =>
    zone.geometry.type === "radius" ? zone.geometry.center : (zone.geometry.points[0] ?? defaultCenter),
  );
  const { geometry } = draft;
  function select(point: Point) {
    if (geometry.type === "radius") setDraft({ ...draft, geometry: { ...geometry, center: point } });
    else if (geometry.points.length < 100)
      setDraft({ ...draft, geometry: { ...geometry, points: [...geometry.points, point] } });
  }
  return (
    <Sheet
      open
      title={pointOnly ? (pointTitle ?? "Точка самовывоза") : "Зона доставки"}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      {!pointOnly && (
        <div className="flex flex-wrap gap-2">
          <Chip
            selected={geometry.type === "radius"}
            onClick={() => setDraft({ ...draft, geometry: { type: "radius", center, radiusMeters: 1000 } })}
          >
            Радиус
          </Chip>
          <Chip
            selected={geometry.type === "polygon"}
            onClick={() => setDraft({ ...draft, geometry: { type: "polygon", points: [] } })}
          >
            Своя зона
          </Chip>
        </div>
      )}
      <AddressMap
        center={center}
        point={geometry.type === "radius" ? geometry.center : undefined}
        geometry={pointOnly ? undefined : geometry}
        select={select}
        moveVertex={
          geometry.type === "polygon"
            ? (index, point) =>
                setDraft({
                  ...draft,
                  geometry: {
                    ...geometry,
                    points: geometry.points.map((current, i) => (i === index ? point : current)),
                  },
                })
            : undefined
        }
        onUnavailable={() => setMapError(true)}
      />
      {mapError && <p role="status">Карта не загрузилась</p>}
      {!pointOnly &&
        (geometry.type === "radius" ? (
          <Input
            label="Радиус, м"
            type="number"
            min={1}
            max={100000}
            value={geometry.radiusMeters}
            onChange={(event) =>
              setDraft({
                ...draft,
                geometry: { ...geometry, radiusMeters: Math.min(100000, Math.max(1, Number(event.target.value) || 1)) },
              })
            }
          />
        ) : (
          <>
            <p className="text-small">
              Нажмите на карту, чтобы поставить точки границы. Точек: {geometry.points.length}
            </p>
            <Button
              variant="secondary"
              disabled={!geometry.points.length}
              onClick={() => setDraft({ ...draft, geometry: { ...geometry, points: geometry.points.slice(0, -1) } })}
            >
              Убрать последнюю точку
            </Button>
          </>
        ))}
      {!pointOnly && inheritedTariff && (
        <Switch
          label="Своя цена зоны"
          checked={!!draft.customTariff}
          onChange={(event) =>
            setDraft({
              ...draft,
              customTariff: event.target.checked,
              tariff: event.target.checked ? draft.tariff : inheritedTariff,
            })
          }
        />
      )}
      {!pointOnly && currency && draft.customTariff && (
        <TariffFields
          currency={currency}
          tariff={draft.tariff}
          setTariff={(tariff) => setDraft({ ...draft, tariff })}
        />
      )}
      <Button
        full
        disabled={
          (geometry.type === "polygon" && geometry.points.length < 3) ||
          (draft.tariff.kind === "fixed" &&
            (!Number.isSafeInteger(draft.tariff.feeMinor) ||
              draft.tariff.feeMinor <= 0 ||
              draft.tariff.feeMinor > 1_000_000_000_000))
        }
        onClick={() => save(draft)}
      >
        Готово
      </Button>
      {remove && (
        <Button full variant="secondary" onClick={remove}>
          Удалить зону
        </Button>
      )}
    </Sheet>
  );
}
