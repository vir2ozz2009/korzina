import { Suspense } from "react";
import type { DeliveryAddress, DetailField } from "../../../shared/contracts/receiving";
import { Button } from "../../../ui/Button";
import { SkeletonBlock } from "../../../ui/SkeletonBlock";
import { type AddressCheck, AddressReviewStatus, ManualDeliveryStatus } from "./AddressDelivery";
import { ManualAddressFields } from "./AddressFields";
import { AddressMapPreview } from "./AddressMapStep";

export function ManualAddressStep({
  address,
  districts,
  required,
  pending,
  change,
  save,
  map,
  zone,
  zoneCheck,
  currency,
  choose,
  another,
  pickup,
}: {
  address: DeliveryAddress;
  districts: { id: string; name: string }[];
  required: readonly DetailField[];
  pending: boolean;
  change: (address: DeliveryAddress) => void;
  save: () => void;
  map?: () => void;
  zone: boolean;
  zoneCheck?: AddressCheck;
  currency: string;
  choose?: () => void;
  another?: () => void;
  pickup?: () => void;
}) {
  const result = zoneCheck?.data;
  const unavailable =
    !!zoneCheck && (zoneCheck.isFetching || zoneCheck.isError || result?.mode !== "delivery" || !result.available);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <ManualAddressFields
        value={address}
        manual={{ districts }}
        required={required}
        disabled={pending}
        onChange={change}
      />
      {address.point && map && (
        <Suspense fallback={<SkeletonBlock className="h-44 rounded-xl" />}>
          <AddressMapPreview center={address.point} point={address.point} />
        </Suspense>
      )}
      {zoneCheck && <AddressReviewStatus check={zoneCheck} currency={currency} />}
      {zone && !address.point && !address.acceptedWithoutPoint && <ManualDeliveryStatus />}
      <Button full type="submit" loading={pending} disabled={!address.address.trim() || unavailable}>
        {zone && !address.point && !address.acceptedWithoutPoint ? "Сохранить адрес вручную" : "Сохранить адрес"}
      </Button>
      {map && (
        <Button full variant="secondary" disabled={pending} onClick={map}>
          {address.point ? "Изменить точку на карте" : "Указать на карте"}
        </Button>
      )}
      {choose && (
        <Button full variant="secondary" disabled={pending} onClick={choose}>
          Сохранённые адреса
        </Button>
      )}
      {another && (
        <Button full variant="secondary" disabled={pending} onClick={another}>
          Указать другой адрес
        </Button>
      )}
      {pickup && (
        <Button full variant="secondary" disabled={pending} onClick={pickup}>
          Выбрать самовывоз
        </Button>
      )}
    </form>
  );
}
