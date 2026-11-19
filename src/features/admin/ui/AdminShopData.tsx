import { useId, useState } from "react";
import { countryDefaults, currencyCodes, timeZones } from "../../../shared/region-data";
import { type ShopTheme, THEME_PRESETS } from "../../../shared/theme-presets";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Input } from "../../../ui/Input";
import { ThemePicker } from "../../../ui/ThemePicker";
import type { AdminShop } from "../api";
import { CountryField, countryName, timeZoneName } from "./RegionFields";
import { useShopCommand } from "./useShopCommand";

const currencyNames = new Intl.DisplayNames("ru", { type: "currency" });
const currencies = currencyCodes.map((value) => ({ value, label: `${value} · ${currencyNames.of(value) ?? value}` }));
const zones = timeZones.map((value) => ({
  value,
  label: timeZoneName(value) === value ? value : `${timeZoneName(value)} · ${value}`,
}));

function InlineSelect({
  label,
  value,
  options,
  change,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  change: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-label">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => change(event.target.value)}
        className="min-h-(--control-lg) w-full rounded-lg bg-input px-3 text-body"
      >
        <option value="">Выбрать</option>
        {options.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

type Form = { name: string; country: string; currency: string; timeZone: string; theme: ShopTheme };
const fromShop = (shop: AdminShop): Form => ({
  name: shop.name,
  country: shop.country ?? "",
  currency: shop.currency ?? "",
  timeZone: shop.timeZone ?? "",
  theme: shop.theme,
});

export function AdminShopData({ shop }: { shop: AdminShop }) {
  const [form, setForm] = useState<Form>();
  const command = useShopCommand(shop.id);
  const themeLabel =
    "custom" in shop.theme
      ? shop.theme.custom
      : THEME_PRESETS.find((item) => "preset" in shop.theme && item.id === shop.theme.preset)?.name;
  const change = (patch: Partial<Form>) => setForm((value) => (value ? { ...value, ...patch } : value));

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-title-3">Данные</h2>
        {!form && (
          <Button variant="secondary" onClick={() => setForm(fromShop(shop))}>
            Изменить
          </Button>
        )}
      </div>
      {form ? (
        <form
          className="space-y-3"
          aria-label="Данные магазина"
          onSubmit={(event) => {
            event.preventDefault();
            command.submit({ action: "data", version: shop.version, ...form }, () => setForm(undefined));
          }}
        >
          <Input
            label="Название"
            maxLength={120}
            value={form.name}
            onChange={(event) => change({ name: event.target.value })}
          />
          <Input label="Адрес витрины" value={shop.slug} readOnly />
          <CountryField
            country={form.country}
            change={(country) => {
              const [currency, timeZone] = countryDefaults[country];
              change({ country, currency, timeZone });
            }}
          />
          <InlineSelect
            label="Валюта"
            value={form.currency}
            options={currencies}
            change={(currency) => change({ currency })}
          />
          <InlineSelect
            label="Часовой пояс"
            value={form.timeZone}
            options={zones}
            change={(timeZone) => change({ timeZone })}
          />
          <h3 className="text-label">Цвет витрины</h3>
          <ThemePicker initial={form.theme} applyToPage={false} onChange={(theme) => change({ theme })} />
          {command.error && <p role="alert">{command.error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              loading={command.pending}
              disabled={!form.name.trim() || !form.country || !form.currency || !form.timeZone}
            >
              Сохранить
            </Button>
            <Button variant="secondary" disabled={command.pending} onClick={() => setForm(undefined)}>
              Отмена
            </Button>
          </div>
        </form>
      ) : (
        <dl className="grid grid-cols-2 gap-2 text-caption">
          <dt>Название</dt>
          <dd>{shop.name}</dd>
          <dt>Адрес витрины</dt>
          <dd className="break-all">{shop.slug}.korzina.app</dd>
          <dt>Страна</dt>
          <dd>{shop.country ? countryName(shop.country) : "—"}</dd>
          <dt>Валюта</dt>
          <dd>{shop.currency ?? "—"}</dd>
          <dt>Часовой пояс</dt>
          <dd>{shop.timeZone ? timeZoneName(shop.timeZone) : "—"}</dd>
          <dt>Цвет витрины</dt>
          <dd>{themeLabel ?? "По умолчанию"}</dd>
        </dl>
      )}
    </Card>
  );
}
