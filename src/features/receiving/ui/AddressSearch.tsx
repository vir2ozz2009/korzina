import { MapPin } from "lucide-react";
import type { Point } from "../../../shared/contracts/receiving";
import { Button } from "../../../ui/Button";
import { ListItem } from "../../../ui/ListItem";
import { SearchField } from "../../../ui/SearchField";
import { useAddressSuggestions } from "../address-api";
import { ManualDeliveryStatus } from "./AddressDelivery";

type Place = Point & { address: string };

export function AddressSearch({
  address,
  change,
  select,
  blocked,
  pending,
  manual,
  map,
  save,
}: {
  address: string;
  change: (address: string) => void;
  select: (place: Place) => void;
  blocked: boolean;
  pending: boolean;
  manual: () => void;
  map: () => void;
  save: () => void;
}) {
  const { query, searching } = useAddressSuggestions(address);
  const offerManual = query.isError || query.data?.length === 0;
  return (
    <>
      <SearchField value={address} label="Улица, дом, город" disabled={pending} onChange={change} />
      {searching && (
        <p role="status" className="text-meta">
          Ищем адрес…
        </p>
      )}
      {query.data?.map((place) => (
        <ListItem
          key={JSON.stringify(place)}
          title={place.address}
          icon={<MapPin size={20} />}
          onClick={pending ? undefined : () => select(place)}
        />
      ))}
      {offerManual && !blocked && (
        <>
          <p role="status" className="text-meta">
            {query.isError ? "Подсказки пока недоступны." : "Совпадений нет."} Можно сохранить набранный текст.
          </p>
          <ManualDeliveryStatus />
          <Button full loading={pending} onClick={save}>
            Сохранить адрес вручную
          </Button>
        </>
      )}
      {blocked && (
        <p role="status" className="text-meta text-status-danger-foreground">
          Этот адрес уже проверен и находится вне зоны.
        </p>
      )}
      <div className={offerManual || blocked ? "" : "grid grid-cols-2 gap-2"}>
        <Button full variant="secondary" disabled={pending} onClick={map}>
          Указать на карте
        </Button>
        {!offerManual && !blocked && (
          <Button full variant="secondary" disabled={pending} onClick={manual}>
            Ввести вручную
          </Button>
        )}
      </div>
    </>
  );
}
