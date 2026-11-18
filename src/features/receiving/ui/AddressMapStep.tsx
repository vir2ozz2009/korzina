import { LocateFixed } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Point } from "../../../shared/contracts/receiving";
import { Button } from "../../../ui/Button";
import { SkeletonBlock } from "../../../ui/SkeletonBlock";
import { TextArea } from "../../../ui/TextArea";
import { usePointDelivery, usePointName } from "../address-api";
import { AddressReviewStatus } from "./AddressDelivery";

const MapPreview = lazy(() => import("./AddressMap").then(({ AddressMap }) => ({ default: AddressMap })));

export function AddressMapStep({
  address,
  change,
  point,
  setPoint,
  rememberOutside,
  currency,
  pending,
  save,
  other,
  pickup,
}: {
  address: string;
  change: (address: string) => void;
  point?: Point;
  setPoint: (point: Point) => void;
  rememberOutside: (address: string) => void;
  currency: string;
  pending: boolean;
  save: (address: string, point: Point) => void;
  other: () => void;
  pickup?: () => void;
}) {
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [tileError, setTileError] = useState(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const name = usePointName(point);
  const check = usePointDelivery(point);
  const mapAddress = name.data?.[0]?.address.slice(0, 300);
  const result = check.data;
  const rejected = !check.isError && result?.mode === "delivery" && !result.available;
  const accepted = !check.isError && result?.mode === "delivery" && result.available;
  useEffect(() => {
    if (mapAddress && rejected && result.reason === "outside") rememberOutside(mapAddress);
  }, [mapAddress, rejected, rememberOutside, result]);

  function locate() {
    if (!navigator.geolocation) {
      setLocationError("Геопозиция недоступна. Отметьте точку на карте.");
      return;
    }
    setLocating(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!active.current) return;
        setLocating(false);
        setPoint({ lat: coords.latitude, lon: coords.longitude });
      },
      () => {
        if (!active.current) return;
        setLocating(false);
        setLocationError("Не удалось определить геопозицию. Отметьте точку на карте.");
      },
      { timeout: 6000 },
    );
  }

  const finalAddress = mapAddress ?? address.trim();
  return (
    <>
      <p className="text-meta text-muted-foreground">Коснитесь нужного места или переместите метку.</p>
      <Suspense fallback={<SkeletonBlock className="h-44 rounded-xl" />}>
        <MapPreview
          point={point}
          select={(next) => {
            if (!pending && !locating) setPoint(next);
          }}
          onUnavailable={() => setTileError(true)}
        />
      </Suspense>
      {tileError && <p className="text-meta">Карта загрузилась не полностью. Можно вернуться к вводу адреса.</p>}
      <Button
        full
        variant="secondary"
        disabled={pending}
        loading={locating}
        icon={<LocateFixed size={18} />}
        onClick={locate}
      >
        Определить мою позицию
      </Button>
      {locationError && (
        <p role="status" className="text-meta">
          {locationError}
        </p>
      )}
      {!!point && <AddressReviewStatus check={check} currency={currency} />}
      {point && mapAddress && <p className="text-label break-words">{mapAddress}</p>}
      {accepted && point && (
        <>
          {name.isPending && (
            <p role="status" className="text-meta">
              Ищем адрес по точке…
            </p>
          )}
          {!name.isPending && !mapAddress && (
            <>
              <p className="text-meta">Добавьте улицу, дом или ориентир для курьера.</p>
              <TextArea
                label="Адрес для курьера"
                value={address}
                maxLength={300}
                disabled={pending}
                onChange={(event) => change(event.target.value)}
              />
            </>
          )}
          {!name.isPending && (
            <Button
              full
              disabled={!finalAddress || locating || check.isFetching}
              loading={pending}
              onClick={() => save(finalAddress, point)}
            >
              Подтвердить адрес
            </Button>
          )}
        </>
      )}
      {rejected && (
        <>
          <Button full disabled={pending} onClick={other}>
            Указать другой адрес
          </Button>
          {pickup && (
            <Button full variant="secondary" disabled={pending} onClick={pickup}>
              Выбрать самовывоз
            </Button>
          )}
        </>
      )}
    </>
  );
}
