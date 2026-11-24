import { LocateFixed } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import type { Point } from "../../../shared/contracts/receiving";
import { Button } from "../../../ui/Button";
import { SkeletonBlock } from "../../../ui/SkeletonBlock";
import { TextArea } from "../../../ui/TextArea";
import { usePointDelivery, usePointName } from "../address-api";
import { AddressReviewStatus } from "./AddressDelivery";
import { useMapLocation } from "./useMapLocation";

export const AddressMapPreview = lazy(() =>
  import("../../../ui/AddressMap").then(({ AddressMap }) => ({ default: AddressMap })),
);

export function AddressMapStep({
  address,
  useTypedAddress,
  point,
  locateOnOpen,
  setPoint,
  rememberOutside,
  currency,
  pending,
  save,
  enterAddress,
  pickup,
}: {
  address: string;
  useTypedAddress: boolean;
  point?: Point;
  locateOnOpen: boolean;
  setPoint: (point: Point) => void;
  rememberOutside: (address: string) => void;
  currency: string;
  pending: boolean;
  save: (address: string, point: Point) => void;
  enterAddress: () => void;
  pickup?: () => void;
}) {
  const [typedAddress, setTypedAddress] = useState(address);
  const [tileError, setTileError] = useState(false);
  const { center, locating, locationError, locate, pick } = useMapLocation(point, setPoint, locateOnOpen);

  const name = usePointName(point);
  const check = usePointDelivery(point);
  const mapAddress = name.data?.[0]?.address.slice(0, 300);
  const result = check.data;
  const rejected = !check.isError && result?.mode === "delivery" && !result.available;
  const accepted = !check.isError && result?.mode === "delivery" && result.available;
  useEffect(() => {
    if (mapAddress && rejected && result.reason === "outside") rememberOutside(mapAddress);
  }, [mapAddress, rejected, rememberOutside, result]);

  const waitingForName = !useTypedAddress && name.isPending;
  const needsText = useTypedAddress || !mapAddress;
  const finalAddress = needsText ? typedAddress.trim() : mapAddress;
  useEffect(() => {
    if (locateOnOpen && accepted && point && mapAddress && !locating && !check.isFetching && !pending)
      save(mapAddress, point);
  }, [locateOnOpen, accepted, point, mapAddress, locating, check.isFetching, pending, save]);
  return (
    <>
      <p className="text-meta text-muted-foreground">Коснитесь нужного места или переместите метку.</p>
      <Suspense fallback={<SkeletonBlock className="h-44 rounded-xl" />}>
        <AddressMapPreview
          center={center}
          point={point}
          select={(next) => {
            if (!pending && !locating) pick(next);
          }}
          onUnavailable={() => setTileError(true)}
        />
      </Suspense>
      {tileError && <p className="text-meta">Карта загрузилась не полностью.</p>}
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
          {waitingForName && (
            <p role="status" className="text-meta">
              Ищем адрес по точке…
            </p>
          )}
          {!waitingForName && needsText && (
            <>
              {!useTypedAddress && <p className="text-meta">Добавьте улицу, дом или ориентир для курьера.</p>}
              <TextArea
                label="Адрес для курьера"
                value={typedAddress}
                maxLength={300}
                disabled={pending}
                onChange={(event) => setTypedAddress(event.target.value)}
              />
            </>
          )}
          {!waitingForName && (
            <Button
              full
              disabled={!finalAddress || locating || check.isFetching}
              loading={pending}
              onClick={() => {
                if (finalAddress) save(finalAddress, point);
              }}
            >
              Продолжить
            </Button>
          )}
        </>
      )}
      {!rejected && (!point || locationError || check.isError) && (
        <Button full variant="secondary" disabled={pending} onClick={enterAddress}>
          Ввести адрес вручную
        </Button>
      )}
      {rejected && (
        <>
          <Button full disabled={pending} onClick={enterAddress}>
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
