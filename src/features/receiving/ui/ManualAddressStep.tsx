import type { DeliveryAddress, DetailField } from "../../../shared/contracts/receiving";
import { Button } from "../../../ui/Button";
import { ManualDeliveryStatus } from "./AddressDelivery";
import { ManualAddressFields } from "./AddressFields";

export function ManualAddressStep({
  address,
  districts,
  required,
  pending,
  change,
  save,
  map,
  pickup,
}: {
  address: DeliveryAddress;
  districts: { id: string; name: string }[];
  required: readonly DetailField[];
  pending: boolean;
  change: (address: DeliveryAddress) => void;
  save: () => void;
  map?: () => void;
  pickup?: () => void;
}) {
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
        districts={districts}
        required={required}
        disabled={pending}
        onChange={change}
      />
      {map && <ManualDeliveryStatus />}
      <Button full type="submit" loading={pending} disabled={!address.address.trim()}>
        {map ? "Сохранить адрес вручную" : "Сохранить адрес"}
      </Button>
      {map && (
        <Button full variant="secondary" disabled={pending} onClick={map}>
          Указать на карте
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
