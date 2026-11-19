import { MapPin } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { addressKey, type SavedAddress } from "../../../shared/contracts/profile";
import type { DeliveryAddress, Point } from "../../../shared/contracts/receiving";
import { Button } from "../../../ui/Button";
import { ListItem } from "../../../ui/ListItem";
import { Sheet } from "../../../ui/Sheet";
import { usePointDelivery } from "../address-api";
import type { ReceivingState } from "../api";
import { AddressChooser } from "./AddressChooser";
import { AddressReviewStatus } from "./AddressDelivery";
import { AddressMapStep } from "./AddressMapStep";
import { AddressSearch } from "./AddressSearch";
import { ManualAddressStep } from "./ManualAddressStep";

type View = "choose" | "search" | "manual" | "map" | "review";
const titles: Record<View, string> = {
  choose: "Адрес доставки",
  search: "Новый адрес",
  manual: "Ввести адрес вручную",
  map: "Адрес на карте",
  review: "Проверьте адрес",
};
const empty: DeliveryAddress = { mode: "delivery", address: "" };
const normalize = (address: string) => address.trim().replace(/\s+/g, " ").toLowerCase();

function savedChoices(current: DeliveryAddress | undefined, data: ReceivingState) {
  const found = new Map<string, DeliveryAddress | SavedAddress>();
  for (const value of [current, data.lastUsedAddress, ...data.savedAddresses]) {
    if (!value) continue;
    const key = addressKey(value);
    if (!found.has(key) || "id" in value) found.set(key, value);
  }
  return [...found.values()];
}

export function AddressSheet({
  current,
  data,
  currency,
  save,
  pending,
  close,
  pickup,
  edit,
}: {
  current?: DeliveryAddress;
  data: ReceivingState;
  currency: string;
  save: (address: DeliveryAddress) => Promise<void>;
  pending: boolean;
  close: () => void;
  pickup?: () => void;
  edit?: boolean;
}) {
  const choices = edit ? [] : savedChoices(current, data);
  const onMap = data.delivery?.mode === "map";
  const districts = data.delivery?.mode === "districts" ? (data.delivery.districts ?? []) : [];
  const firstEntry = onMap ? "search" : "manual";
  const [trail, setTrail] = useState<View[]>([
    edit && current ? (onMap && current.point ? "review" : "manual") : choices.length ? "choose" : firstEntry,
  ]);
  const view = trail[trail.length - 1];
  const [draft, setDraft] = useState<DeliveryAddress>(edit ? (current ?? empty) : empty);
  const [candidate, setCandidate] = useState<DeliveryAddress | undefined>(edit ? current : undefined);
  const [point, setPoint] = useState<Point>();
  const [outside, setOutside] = useState<string[]>([]);
  const [error, setError] = useState("");
  const check = usePointDelivery(view === "review" ? candidate?.point : undefined);
  const result = check.data;
  const available = !check.isError && result?.mode === "delivery" && result.available;
  const rejected = !check.isError && result?.mode === "delivery" && !result.available;
  const blocked = onMap && outside.includes(normalize(draft.address));

  const rememberOutside = useCallback((address: string) => {
    const key = normalize(address);
    setOutside((previous) => (previous.includes(key) ? previous : [...previous, key]));
  }, []);

  useEffect(() => {
    if (candidate && rejected && result.reason === "outside") rememberOutside(candidate.address);
  }, [candidate, rejected, rememberOutside, result]);

  function open(next: View) {
    setError("");
    setTrail([...trail, next]);
  }

  function back() {
    setError("");
    setTrail(trail.slice(0, -1));
  }

  function another() {
    setError("");
    setPoint(undefined);
    setTrail(choices.length ? ["choose", firstEntry] : [firstEntry]);
  }

  function select(address: DeliveryAddress) {
    if (onMap && address.point) {
      setCandidate(address);
      open("review");
      return;
    }
    setDraft(address);
    open("manual");
  }

  function change(address: DeliveryAddress) {
    setError("");
    setDraft(address);
  }

  async function saveAddress(address: DeliveryAddress) {
    setError("");
    try {
      await save(address);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить адрес");
      if (view === "review") void check.refetch();
    }
  }

  function saveManual() {
    const address = draft.address.trim();
    if (!address) return setError("Укажите адрес доставки");
    if (blocked) return setError("Этот адрес уже проверен и находится вне зоны. Укажите другой адрес.");
    if (districts.length && !draft.districtId) return setError("Выберите район");
    if (!onMap && data.requiredDetails.some((field) => !draft[field]?.trim()))
      return setError("Заполните обязательные поля");
    void saveAddress({ ...draft, address, point: undefined, acceptedWithoutPoint: onMap ? true : undefined });
  }

  return (
    <Sheet
      open
      form
      title={titles[view]}
      onBack={trail.length > 1 && !pending ? back : undefined}
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
    >
      <div className="space-y-3">
        {view === "choose" && (
          <AddressChooser
            addresses={choices}
            current={current}
            pending={pending}
            select={select}
            pickup={pickup}
            create={() => {
              change(empty);
              setPoint(undefined);
              open(firstEntry);
            }}
          />
        )}
        {view === "search" && (
          <AddressSearch
            address={draft.address}
            change={(address) => change({ ...draft, address })}
            select={(place) =>
              select({
                mode: "delivery",
                address: place.address.slice(0, 300),
                point: { lat: place.lat, lon: place.lon },
              })
            }
            blocked={blocked}
            pending={pending}
            manual={() => open("manual")}
            map={() => open("map")}
            save={saveManual}
          />
        )}
        {view === "manual" && (
          <ManualAddressStep
            address={draft}
            districts={districts}
            required={onMap ? [] : data.requiredDetails}
            pending={pending}
            change={change}
            save={saveManual}
            map={onMap ? () => open("map") : undefined}
            pickup={onMap ? undefined : pickup}
          />
        )}
        {view === "map" && (
          <AddressMapStep
            address={draft.address}
            useTypedAddress={trail.at(-2) === "manual"}
            change={(address) => change({ ...draft, address })}
            point={point}
            setPoint={(next) => {
              setPoint(next);
              setError("");
            }}
            rememberOutside={rememberOutside}
            currency={currency}
            pending={pending}
            enterAddress={another}
            pickup={pickup}
            save={(address, selected) =>
              void saveAddress({
                ...(normalize(draft.address) === normalize(address) ? draft : empty),
                address,
                point: selected,
                acceptedWithoutPoint: undefined,
              })
            }
          />
        )}
        {view === "review" && candidate && (
          <>
            <ListItem title={candidate.address} icon={<MapPin size={20} />} />
            <AddressReviewStatus check={check} currency={currency} />
            {available && (
              <Button full disabled={check.isFetching} loading={pending} onClick={() => void saveAddress(candidate)}>
                Подтвердить адрес
              </Button>
            )}
            {rejected && (
              <>
                <Button full disabled={pending} onClick={another}>
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
        )}
        {error && (
          <p role="alert" className="text-meta text-status-danger-foreground">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
