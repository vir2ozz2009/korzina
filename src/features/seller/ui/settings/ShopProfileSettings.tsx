import { lazy, Suspense, useState } from "react";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import type { Point } from "../../../../shared/contracts/receiving";
import { timeZones } from "../../../../shared/region-data";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { Chip } from "../../../../ui/Chip";
import { Input } from "../../../../ui/Input";
import { ListItem } from "../../../../ui/ListItem";
import { Sheet } from "../../../../ui/Sheet";
import { StoreLogo } from "../../../../ui/StoreLogo";
import { type ProfileData, sellerSettingRequest, useSellerSetting } from "../../settings-api";
import { SettingsEditor, type SettingsFrame } from "./SettingsEditor";
import { SettingsImage } from "./SettingsImage";

const path = "profile/data";
const MapEditor = lazy(() => import("./ZoneEditor").then(({ ZoneEditor }) => ({ default: ZoneEditor })));
const shapes = [
  ["circle", "Круг"],
  ["square", "Квадрат"],
  ["wide", "Широкий"],
] as const;

export function ShopProfileSettings({
  store,
  frame,
  storefrontUrl,
}: {
  store: string;
  frame: SettingsFrame;
  storefrontUrl: string;
}) {
  const query = useSellerSetting<ProfileData>(store, path);
  return (
    <QueryBoundary query={query} template="form">
      {(data) => (
        <SettingsEditor
          store={store}
          frame={frame}
          path={path}
          data={data}
          select={({ profile }) => ({
            name: profile.name,
            logo: profile.logo,
            timeZone: profile.timeZone,
            address: profile.address,
            point: profile.point,
            phone: profile.phone,
            email: profile.email,
            telegram: profile.telegram,
          })}
          payload={({ logo, ...profile }) => ({ ...profile, logo: logo && { id: logo.id, shape: logo.shape } })}
          valid={({ name }) => !!name.trim()}
        >
          {(value, change, disabled) => (
            <>
              <Card>
                <Input
                  label="Название магазина"
                  required
                  maxLength={100}
                  value={value.name}
                  onChange={(event) => change({ ...value, name: event.target.value })}
                />
                <SettingsImage
                  store={store}
                  label="Логотип"
                  purpose="logo"
                  src={value.logo?.src}
                  change={(image) =>
                    change({ ...value, logo: image && { ...image, shape: value.logo?.shape ?? "circle" } })
                  }
                />
                {value.logo && (
                  <div className="flex flex-wrap gap-2">
                    {shapes.map(([shape, label]) => (
                      <Chip
                        key={shape}
                        selected={shape === value.logo?.shape}
                        onClick={() => {
                          if (value.logo) change({ ...value, logo: { ...value.logo, shape } });
                        }}
                      >
                        {label}
                      </Chip>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3 rounded-lg bg-secondary p-3">
                  <StoreLogo name={value.name} src={value.logo?.src} shape={value.logo?.shape} />
                  {value.logo?.shape !== "wide" && <span className="text-label">{value.name}</span>}
                </div>
              </Card>
              <Card>
                <h2 className="text-title-3">Адрес и контакты</h2>
                <Input
                  label="Адрес магазина"
                  maxLength={300}
                  value={value.address ?? ""}
                  onChange={(event) => change({ ...value, address: event.target.value || undefined })}
                />
                <Input
                  label="Телефон"
                  type="tel"
                  value={value.phone ?? ""}
                  onChange={(event) => change({ ...value, phone: event.target.value || undefined })}
                />
                <Input
                  label="Email"
                  type="email"
                  value={value.email ?? ""}
                  onChange={(event) => change({ ...value, email: event.target.value || undefined })}
                />
                <Input
                  label="Telegram"
                  value={value.telegram ?? ""}
                  placeholder="@магазин"
                  onChange={(event) => change({ ...value, telegram: event.target.value || undefined })}
                />
              </Card>
              <Card>
                <h2 className="text-title-3">Регион и время</h2>
                <ListItem title="Страна" value={data.country ?? "—"} subtitle="Меняет поддержка" />
                <ListItem title="Валюта" value={data.currency} subtitle="Меняет поддержка" />
                <StoreTimeZone
                  store={store}
                  maps={data.maps}
                  value={value}
                  disabled={disabled}
                  set={(timeZone, point = value.point) => change({ ...value, timeZone, point })}
                />
              </Card>
              <ListItem title="Посмотреть на витрине" href={disabled && data.canWrite ? undefined : storefrontUrl} />
            </>
          )}
        </SettingsEditor>
      )}
    </QueryBoundary>
  );
}

function StoreTimeZone({
  store,
  value,
  set,
  maps,
  disabled,
}: {
  store: string;
  value: { timeZone: string; point?: Point | null };
  maps: boolean;
  disabled: boolean;
  set: (timeZone: string, point?: Point | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [map, setMap] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function auto(point: Point) {
    setLoading(true);
    setError("");
    try {
      const { timeZone } = await sellerSettingRequest<{ timeZone: string }>(store, "profile/time-zone", {
        method: "POST",
        body: JSON.stringify(point),
      });
      set(timeZone, point);
    } catch {
      setError("Не удалось определить часовой пояс");
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <ListItem title="Часовой пояс" value={value.timeZone} onClick={disabled ? undefined : () => setOpen(true)} />
      {maps && (
        <Button variant="secondary" loading={loading} disabled={disabled} onClick={() => setMap(true)}>
          Определить по точке
        </Button>
      )}
      {error && <p role="alert">{error}</p>}
      {open && (
        <Sheet open title="Часовой пояс" onOpenChange={setOpen}>
          <Input label="Найти часовой пояс" value={search} onChange={(event) => setSearch(event.target.value)} />
          {timeZones
            .filter((zone) => zone.toLowerCase().includes(search.trim().toLowerCase()))
            .slice(0, 20)
            .map((zone) => (
              <ListItem
                key={zone}
                title={zone}
                value={zone === value.timeZone ? "Выбран" : undefined}
                onClick={() => {
                  set(zone);
                  setOpen(false);
                }}
              />
            ))}
        </Sheet>
      )}
      {map && (
        <Suspense fallback={<p>Загружаем карту…</p>}>
          <MapEditor
            pointOnly
            pointTitle="Точка магазина"
            close={() => setMap(false)}
            zone={{
              id: "shop",
              tariff: { kind: "free" },
              geometry: { type: "radius", radiusMeters: 1, center: value.point ?? { lat: 10.7769, lon: 106.7009 } },
            }}
            save={({ geometry }) => {
              if (geometry.type === "radius") void auto(geometry.center);
              setMap(false);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
