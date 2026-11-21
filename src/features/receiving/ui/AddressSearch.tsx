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
  pickup,
}: {
  address: string;
  change: (address: string) => void;
  select: (place: Place) => void;
  blocked: boolean;
  pending: boolean;
  manual: () => void;
  map: () => void;
  save: () => void;
  pickup?: () => void;
}) {
  const { query, searching } = useAddressSuggestions(address);
  const suggestions = query.data ?? [];
  const offerSave = !searching && (query.isError || query.data?.length === 0);
  const offerManual = !offerSave && !blocked && !!address.trim();
  return (
    <>
      <SearchField value={address} label="Улица, дом, город" disabled={pending} onChange={change} />
      {searching && (
        <p role="status" className="text-meta">
          Ищем адрес…
        </p>
      )}
      {!!suggestions.length && (
        <ul aria-label="Подсказки адреса" className="rounded-xl bg-secondary p-1">
          {suggestions.map((place) => (
            <li key={JSON.stringify(place)}>
              <ListItem
                title={place.address}
                icon={<MapPin size={20} />}
                variant="compact"
                onClick={pending ? undefined : () => select(place)}
              />
            </li>
          ))}
        </ul>
      )}
      {offerSave && !blocked && (
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
      <div className="space-y-2">
        <Button full variant="secondary" disabled={pending} onClick={map}>
          Указать на карте
        </Button>
        {blocked && pickup && (
          <Button full variant="secondary" disabled={pending} onClick={pickup}>
            Выбрать самовывоз
          </Button>
        )}
        {offerManual && (
          <Button full variant="ghost" disabled={pending} onClick={manual}>
            Ввести адрес вручную
          </Button>
        )}
      </div>
    </>
  );
}
