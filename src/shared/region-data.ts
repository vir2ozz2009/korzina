// ISO 3166-1 country codes from Debian iso-codes; ISO 4217 data from SIX (datasets/currency-codes @ 31cfa13).
// Defaults from CLDR 49 and IANA zone.tab, with §9.10 overrides. An empty currency requires manual selection.
import regions from "./regions.json";

export const { priorityCountries } = regions;
export const countryDefaults = Object.fromEntries(
  Object.entries(regions.countryDefaults).map(([code, [currency, timeZone]]) => [code, [currency, timeZone] as const]),
);
