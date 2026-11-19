import { useState } from "react";
import { countryDefaults, priorityCountries } from "../../../shared/region-data";
import { ListItem } from "../../../ui/ListItem";
import { Radio } from "../../../ui/Radio";
import { SearchField } from "../../../ui/SearchField";

const countries = new Intl.DisplayNames("ru", { type: "region" });
export const countryName = (code: string) => (code === "KG" ? "Кыргызстан" : (countries.of(code) ?? code));
const priority: readonly string[] = priorityCountries;
const countryOrder = [
  ...priority,
  ...Object.keys(countryDefaults)
    .filter((code) => !priority.includes(code))
    .sort((a, b) => countryName(a).localeCompare(countryName(b), "ru")),
];
const cityNames: Record<string, string> = {
  "Europe/Moscow": "Москва",
  "Europe/Minsk": "Минск",
  "Asia/Almaty": "Алматы",
  "Asia/Tashkent": "Ташкент",
  "Asia/Bishkek": "Бишкек",
  "Asia/Yerevan": "Ереван",
  "Asia/Tbilisi": "Тбилиси",
  "Asia/Baku": "Баку",
  "Europe/Istanbul": "Стамбул",
  "Asia/Dubai": "Дубай",
  "Asia/Ho_Chi_Minh": "Хошимин",
  "Asia/Bangkok": "Бангкок",
  "Asia/Makassar": "Макассар (Бали)",
  "Europe/Belgrade": "Белград",
  "Europe/Podgorica": "Подгорица",
  "Asia/Nicosia": "Никосия",
  "Asia/Jerusalem": "Иерусалим",
};
export const timeZoneName = (zone: string) => cityNames[zone] ?? zone.replaceAll("_", " ");
const normalize = (value: string) =>
  value
    .toLocaleLowerCase("ru")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
const options = countryOrder.map((code) => {
  const [currency, timeZone] = countryDefaults[code];
  const name = countryName(code);
  const label = priority.includes(code) ? `${name} · ${currency} · ${timeZoneName(timeZone)}` : name;
  return { code, label, searchable: normalize(`${code} ${label}`) };
});

export function CountryField({
  country,
  change,
  showDefaults = false,
}: {
  country: string;
  change: (country: string) => void;
  showDefaults?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const term = normalize(search.trim());
  const results = options.filter(({ searchable }) => searchable.includes(term));
  const defaults = countryDefaults[country];
  return (
    <>
      <ListItem
        title="Страна"
        subtitle={country ? countryName(country) : "Выбрать"}
        aria-expanded={expanded}
        onClick={() => {
          setSearch("");
          setExpanded(!expanded);
        }}
      />
      {expanded && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-2">
          <SearchField label="Найти страну" value={search} onChange={setSearch} />
          <fieldset aria-label="Страна" className="max-h-56 space-y-1 overflow-y-auto px-2">
            {results.map(({ code, label }) => (
              <Radio
                key={code}
                name="Страна"
                label={label}
                checked={country === code}
                onChange={() => {
                  change(code);
                  setExpanded(false);
                }}
              />
            ))}
          </fieldset>
          {!results.length && <p className="p-3 text-caption text-muted-foreground">Ничего не найдено</p>}
        </div>
      )}
      {showDefaults && defaults && (
        <p className="px-2 text-caption text-muted-foreground">
          {defaults[0] || "Валюту можно выбрать в карточке"} · {timeZoneName(defaults[1])}
        </p>
      )}
    </>
  );
}
