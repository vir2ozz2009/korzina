import { MapPin, Plus } from "lucide-react";
import type { DeliveryAddress } from "../../../shared/contracts/receiving";
import { Button } from "../../../ui/Button";
import { ListItem } from "../../../ui/ListItem";

export function AddressChooser({
  addresses,
  current,
  pending,
  select,
  pickup,
  create,
}: {
  addresses: DeliveryAddress[];
  current?: DeliveryAddress;
  pending: boolean;
  select: (address: DeliveryAddress) => void;
  pickup?: () => void;
  create: () => void;
}) {
  return (
    <>
      {addresses.map((address) => (
        <ListItem
          key={JSON.stringify([address.address, address.districtId])}
          title={address.address}
          subtitle={address === current ? "Текущий адрес" : undefined}
          icon={<MapPin size={20} />}
          onClick={pending ? undefined : () => select(address)}
        />
      ))}
      <Button full disabled={pending} icon={<Plus size={18} />} onClick={create}>
        Указать другой адрес
      </Button>
      {pickup && (
        <Button full variant="secondary" disabled={pending} onClick={pickup}>
          Выбрать самовывоз
        </Button>
      )}
    </>
  );
}
