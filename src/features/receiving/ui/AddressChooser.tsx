import { MapPin, Plus } from "lucide-react";
import { addressKey } from "../../../shared/address-key";
import type { SavedAddress } from "../../../shared/contracts/profile";
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
  addresses: (DeliveryAddress | SavedAddress)[];
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
          key={addressKey(address)}
          title={"title" in address && address.title ? address.title : address.address}
          subtitle={
            "title" in address && address.title
              ? address.address
              : current && addressKey(address) === addressKey(current)
                ? "Текущий адрес"
                : undefined
          }
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
