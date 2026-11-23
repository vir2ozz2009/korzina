import { useCallback, useEffect, useState } from "react";
import { addressKey } from "../../../shared/address-key";
import type { DeliveryAddress, Point } from "../../../shared/contracts/receiving";
import { HttpError } from "../../../shared/http-error";
import { Sheet } from "../../../ui/Sheet";
import { usePointDelivery, useVerifySubmittedAddress } from "../address-api";
import type { ReceivingState } from "../api";
import { canReuseAddress, manualAddressError } from "../reuse-address";
import { AddressChooser, savedChoices } from "./AddressChooser";
import { AddressReview, AddressSheetError } from "./AddressDelivery";
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

export function AddressSheet({
  current,
  data,
  currency,
  save,
  pending: saving,
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
  const districts = data.delivery?.districts ?? [];
  const geocoded = onMap || data.delivery?.mode === "text";
  const firstEntry = geocoded ? "search" : "manual";
  const [trail, setTrail] = useState<View[]>([
    edit && current ? (geocoded && current.point ? "review" : "manual") : choices.length ? "choose" : firstEntry,
  ]);
  const view = trail[trail.length - 1];
  const [draft, setDraft] = useState<DeliveryAddress>(edit ? (current ?? empty) : empty);
  const [candidate, setCandidate] = useState<DeliveryAddress | undefined>(edit ? current : undefined);
  const [point, setPoint] = useState<Point | undefined>(edit ? current?.point : undefined);
  const [locateOnOpen, setLocateOnOpen] = useState(false);
  const [outside, setOutside] = useState<string[]>([]);
  const [error, setError] = useState("");
  const verification = useVerifySubmittedAddress();
  const pending = saving || verification.isPending;
  const check = usePointDelivery(view === "review" ? candidate?.point : undefined);
  const result = check.data;
  const rejected = !check.isError && result?.mode === "delivery" && !result.available;
  const blocked = onMap && outside.includes(normalize(draft.address));

  const rememberOutside = useCallback((address: string) => {
    const key = normalize(address);
    setOutside((previous) => (previous.includes(key) ? previous : [...previous, key]));
  }, []);

  useEffect(() => {
    if (candidate && rejected && result.reason === "outside") rememberOutside(candidate.address);
  }, [candidate, rejected, rememberOutside, result]);

  function open(next: View, locate = false) {
    if (next === "map") setLocateOnOpen(locate);
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

  function review(address: DeliveryAddress) {
    if (geocoded && address.point) {
      setCandidate(address);
      open("review");
      return;
    }
    setDraft(address);
    setPoint(address.point);
    open("manual");
  }

  function selectSaved(address: DeliveryAddress, saved: boolean) {
    if ((saved || !current || addressKey(current) !== addressKey(address)) && canReuseAddress(address, data))
      void saveAddress(address);
    else review(address);
  }

  function change(address: DeliveryAddress, keepMapPoint = false) {
    setError("");
    const unchanged = normalize(address.address) === normalize(draft.address);
    setDraft({
      ...address,
      point: unchanged ? address.point : undefined,
      acceptedWithoutPoint: unchanged ? address.acceptedWithoutPoint : undefined,
    });
    if (!unchanged && !keepMapPoint) setPoint(undefined);
  }

  async function saveAddress(address: DeliveryAddress, verify = false) {
    if (pending) return;
    setError("");
    try {
      if (verify) {
        const point = await verification.mutateAsync(address.address);
        address = { ...address, point: point ?? undefined, acceptedWithoutPoint: point ? undefined : true };
      }
      await save(address);
    } catch (reason) {
      if (reason instanceof HttpError && reason.code === "OUT_OF_ZONE") {
        rememberOutside(address.address);
        if (view === "search") return;
      }
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить адрес");
      if (view === "review") void check.refetch();
    }
  }

  function saveManual() {
    const address = draft.address.trim();
    const error = manualAddressError(draft, data, blocked);
    if (error) return setError(error);
    const acceptedWithoutPoint = onMap ? draft.acceptedWithoutPoint : undefined;
    void saveAddress({ ...draft, address, acceptedWithoutPoint }, onMap && !draft.point && !acceptedWithoutPoint);
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
            select={selectSaved}
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
              review({
                mode: "delivery",
                address: place.address.slice(0, 300),
                point: { lat: place.lat, lon: place.lon },
              })
            }
            blocked={blocked}
            pending={pending}
            manual={() => open("manual")}
            map={() => open("map")}
            locate={() => open("map", true)}
            zone={onMap}
            save={saveManual}
            pickup={pickup}
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
            map={geocoded ? () => open("map") : undefined}
            zone={onMap}
            pickup={!onMap || blocked ? pickup : undefined}
          />
        )}
        {view === "map" && (
          <AddressMapStep
            address={draft.address}
            useTypedAddress={trail.at(-2) === "manual"}
            change={(address) => change({ ...draft, address }, true)}
            point={point}
            locateOnOpen={locateOnOpen}
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
          <AddressReview
            address={candidate.address}
            check={check}
            currency={currency}
            pending={pending}
            save={() => void saveAddress(candidate)}
            another={another}
            pickup={pickup}
          />
        )}
        {error && <AddressSheetError message={error} />}
      </div>
    </Sheet>
  );
}
