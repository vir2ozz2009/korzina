import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Point, Receiving } from "../../../shared/contracts/receiving";
import { HttpError } from "../../../shared/http-error";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { ListItem } from "../../../ui/ListItem";
import { SearchField } from "../../../ui/SearchField";
import { type ReceivingState, useGeocode } from "../api";

import { ManualAddressFields, MapAddressTools } from "./AddressFields";

type Address = Extract<Receiving, { mode: "delivery" }>;
type Place = Point & { address: string };

export function AddressSheet({
  current,
  data,
  save,
  pending,
  pickup,
}: {
  current?: Address;
  data: ReceivingState;
  save: (address: Address) => Promise<void>;
  pending: boolean;
  pickup?: () => void;
}) {
  const { delivery, savedAddresses, requiredDetails } = data;
  const onMap = delivery?.mode === "map";
  const districts = delivery?.mode === "districts" ? (delivery.districts ?? []) : [];
  const [entry, setEntry] = useState<Address>(current ?? { mode: "delivery", address: "" });
  const [manual, setManual] = useState(!onMap);
  const [candidate, setCandidate] = useState<Place>();
  const [search, setSearch] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [error, setError] = useState("");
  const reverseRequest = useRef<AbortController>(undefined);
  useEffect(() => () => reverseRequest.current?.abort(), []);
  const [locating, setLocating] = useState(false);
  const { mutateAsync: geocode, isPending } = useGeocode();

  useEffect(() => {
    const address = entry.address.trim();
    if (!onMap || manual || !search || address.length < 3) return;
    const controller = new AbortController();
    const delay = setTimeout(() => {
      void geocode({ input: { type: "search", address }, signal: controller.signal }).then(
        (data) => {
          if (!controller.signal.aborted) setResults(data.results);
        },
        (reason: unknown) => {
          if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Не удалось найти адрес");
        },
      );
    }, 380);
    return () => {
      clearTimeout(delay);
      controller.abort();
    };
  }, [onMap, manual, search, entry.address, geocode]);

  function choose(place: Place) {
    setSearch(false);
    setManual(false);
    setResults([]);
    setError("");
    setCandidate(place);
    setEntry({
      ...entry,
      address: place.address,
      point: { lat: place.lat, lon: place.lon },
      acceptedWithoutPoint: undefined,
    });
  }

  function edit() {
    reverseRequest.current?.abort();
    setCandidate(undefined);
    setResults([]);
    setError("");
    setSearch(true);
    setManual(false);
  }

  async function picked(point: Point) {
    reverseRequest.current?.abort();
    const controller = new AbortController();
    reverseRequest.current = controller;
    setSearch(false);
    setError("");
    setCandidate(undefined);
    setEntry({ ...entry, point, acceptedWithoutPoint: undefined });
    try {
      const data = await geocode({ input: { type: "reverse", point }, signal: controller.signal });
      if (controller.signal.aborted) return;
      const match = data.results[0];
      if (match) choose({ ...match, ...point });
      else setManual(true);
    } catch (reason) {
      if (controller.signal.aborted) return;
      setManual(true);
      setError(
        reason instanceof HttpError && reason.code === "ADDRESS_NOT_FOUND"
          ? "Не нашли такой адрес"
          : "Не удалось найти адрес",
      );
    }
  }

  function locate() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        void picked({ lat: position.coords.latitude, lon: position.coords.longitude });
      },
      () => {
        setLocating(false);
        setError("Нет доступа к геопозиции");
      },
      { timeout: 6000 },
    );
  }

  async function saveCurrent(value: Address) {
    setError("");
    try {
      await save(value);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить адрес");
    }
  }

  function confirm() {
    const address = entry.address.trim();
    if (!address) return setError("Укажите адрес доставки");
    if (districts.length && !entry.districtId) return setError("Выберите район");
    if (!onMap && requiredDetails.some((field) => !entry[field]?.trim()))
      return setError("Заполните обязательные поля");
    void saveCurrent({ ...entry, address, acceptedWithoutPoint: onMap && manual && !entry.point ? true : undefined });
  }

  const busy = pending || locating;
  return (
    <div className="space-y-3">
      {savedAddresses.map((address) => (
        <ListItem
          key={JSON.stringify([address.address, address.districtId])}
          title={address.address}
          icon={<MapPin size={20} />}
          onClick={
            busy
              ? undefined
              : () => {
                  setEntry(address);
                  if (onMap && !address.point && !address.acceptedWithoutPoint) setManual(true);
                  else if (districts.length && !address.districtId) setError("Выберите район");
                  else void saveCurrent(address);
                }
          }
        />
      ))}
      {manual ? (
        <ManualAddressFields
          value={entry}
          districts={districts}
          required={onMap ? [] : requiredDetails}
          disabled={busy}
          onChange={setEntry}
        />
      ) : (
        <SearchField
          value={entry.address}
          label="Улица, дом, город"
          disabled={busy}
          onChange={(address) => {
            edit();
            setEntry({ ...entry, address, point: undefined, acceptedWithoutPoint: undefined });
          }}
        />
      )}
      {isPending && <p role="status">Ищем адрес…</p>}
      {!manual &&
        !candidate &&
        results.map((place) => (
          <ListItem
            key={JSON.stringify(place)}
            title={place.address}
            icon={<MapPin size={20} />}
            onClick={() => choose(place)}
          />
        ))}
      {onMap && (
        <MapAddressTools
          point={entry.point}
          disabled={busy}
          frozen={manual || !!candidate}
          manual={manual}
          locating={locating}
          locate={locate}
          pick={(point) => {
            if (!busy) void picked(point);
          }}
          enterManual={() => {
            reverseRequest.current?.abort();
            setCandidate(undefined);
            setSearch(false);
            setError("");
            setManual(true);
            setEntry({ ...entry, point: undefined });
          }}
        />
      )}
      {error && (
        <p role="alert" className="text-meta text-status-danger-foreground">
          {error}
        </p>
      )}
      {(manual || candidate) && (
        <Card className="bg-secondary">
          {candidate && (
            <>
              <p className="text-label">Проверьте адрес</p>
              <p>{candidate.address}</p>
            </>
          )}
          <Button full disabled={!entry.address.trim() || locating} loading={pending} onClick={confirm}>
            {!onMap
              ? "Сохранить адрес"
              : manual && !entry.point
                ? "Использовать мой адрес как есть"
                : "Подтвердить адрес"}
          </Button>
          {onMap && (
            <Button full variant="ghost" disabled={busy} onClick={edit}>
              {manual ? "Найти на карте" : "Исправить адрес"}
            </Button>
          )}
        </Card>
      )}
      {pickup && (
        <Button full variant="secondary" disabled={busy} onClick={pickup}>
          Выбрать самовывоз
        </Button>
      )}
    </div>
  );
}
