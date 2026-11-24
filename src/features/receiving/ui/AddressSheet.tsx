import { useCallback, useEffect, useState } from "react";
import { addressKey } from "../../../shared/address-key";
import type { DeliveryAddress, Point } from "../../../shared/contracts/receiving";
import { HttpError } from "../../../shared/http-error";
import { Sheet } from "../../../ui/Sheet";
import { usePointDelivery, useVerifySubmittedAddress } from "../address-api";
import type { ReceivingState } from "../api";
import { canReuseAddress, manualAddressError } from "../reuse-address";
import { AddressChooser, savedChoices } from "./AddressChooser";
import { AddressSheetError } from "./AddressDelivery";
import { AddressMapStep } from "./AddressMapStep";
import { AddressSearch } from "./AddressSearch";
import { ManualAddressStep } from "./ManualAddressStep";

type View = "choose" | "search" | "manual" | "map" | "edit";
const titles: Record<View, string> = {
  choose: "Адрес доставки",
  search: "Новый адрес",
  manual: "Ввести адрес вручную",
  map: "Адрес на карте",
  edit: "Редактировать адрес",
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
  editCurrent,
}: {
  current?: DeliveryAddress;
  data: ReceivingState;
  currency: string;
  save: (address: DeliveryAddress) => Promise<void>;
  pending: boolean;
  close: () => void;
  pickup?: () => void;
  edit?: boolean;
  editCurrent?: boolean;
}) {
  const choices = edit ? [] : savedChoices(current, data);
  const onMap = data.delivery?.mode === "map";
  const districts = data.delivery?.districts ?? [];
  const geocoded = onMap || data.delivery?.mode === "text";
  const firstEntry = geocoded ? "search" : "manual";
  const editing = !!current && (edit || editCurrent);
  const [trail, setTrail] = useState<View[]>(
    editing
      ? editCurrent && choices.length
        ? ["choose", "edit"]
        : ["edit"]
      : [choices.length ? "choose" : firstEntry],
  );
  const view = trail[trail.length - 1];
  const [draft, setDraft] = useState<DeliveryAddress>(editing ? (current ?? empty) : empty);
  const [point, setPoint] = useState<Point | undefined>(editing ? current?.point : undefined);
  const [locateOnOpen, setLocateOnOpen] = useState(false);
  const [outside, setOutside] = useState<string[]>([]);
  const [error, setError] = useState("");
  const verification = useVerifySubmittedAddress();
  const pending = saving || verification.isPending;
  const checkingZone = onMap && (view === "edit" || view === "manual") && !!draft.point;
  const check = usePointDelivery(checkingZone ? draft.point : undefined);
  const result = check.data;
  const rejected = !check.isError && result?.mode === "delivery" && !result.available;
  const blocked = onMap && outside.includes(normalize(draft.address));

  const rememberOutside = useCallback((address: string) => {
    const key = normalize(address);
    setOutside((previous) => (previous.includes(key) ? previous : [...previous, key]));
  }, []);

  useEffect(() => {
    if (checkingZone && rejected && result.reason === "outside") rememberOutside(draft.address);
  }, [checkingZone, draft.address, rejected, rememberOutside, result]);

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

  function editAddress(address: DeliveryAddress) {
    setDraft(address);
    setPoint(address.point);
    setError("");
    setTrail((previous) => {
      if (previous.at(-1) !== "map") return [...previous, "edit"];
      const parent = previous.at(-2);
      return parent === "edit" || parent === "manual" ? previous.slice(0, -1) : [...previous, "edit"];
    });
  }

  function selectSaved(address: DeliveryAddress) {
    if ((!current || addressKey(current) !== addressKey(address)) && canReuseAddress(address, data))
      void saveAddress(address);
    else editAddress(address);
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
      if (checkingZone) void check.refetch();
    }
  }

  function saveManual() {
    if (checkingZone && (check.isFetching || check.isError || result?.mode !== "delivery" || !result.available)) return;
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
              editAddress({
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
        {(view === "manual" || view === "edit") && (
          <ManualAddressStep
            address={draft}
            districts={districts}
            required={onMap ? [] : data.requiredDetails}
            pending={pending}
            change={change}
            save={saveManual}
            map={geocoded ? () => open("map") : undefined}
            zone={onMap}
            zoneCheck={checkingZone ? check : undefined}
            currency={currency}
            choose={view === "edit" && choices.length ? () => setTrail(["choose"]) : undefined}
            another={checkingZone && rejected ? another : undefined}
            pickup={!onMap || blocked ? pickup : undefined}
          />
        )}
        {view === "map" && (
          <AddressMapStep
            address={draft.address}
            useTypedAddress={trail.at(-2) === "manual" || trail.at(-2) === "edit"}
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
              editAddress({
                ...draft,
                address,
                point: selected,
                acceptedWithoutPoint: undefined,
              })
            }
          />
        )}
        {error && <AddressSheetError message={error} />}
      </div>
    </Sheet>
  );
}
