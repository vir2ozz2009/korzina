import type { ShopContext } from "../../src/shared/contracts/shop-context";
import { moveDayPauses } from "../modules/fulfillment/pause";
import { shopTimeZoneSql } from "./time-zone";

export function applyAdminSettings(storage: DurableObjectStorage, settings: NonNullable<ShopContext["adminSettings"]>) {
  const { name, country, currency, timeZone, theme } = settings;
  const signature = JSON.stringify(settings);
  const active = storage.sql
    .exec<{ value: string }>("SELECT value FROM settings WHERE key='admin_settings'")
    .toArray()[0];
  if (active?.value === signature) return;
  storage.transactionSync(() => {
    const previousTimeZone = storage.sql
      .exec<{ timeZone: string }>(`SELECT ${shopTimeZoneSql} AS timeZone`)
      .one().timeZone;
    storage.sql.exec(
      `INSERT INTO settings(key,value) VALUES
      ('display_name',?),('phone_region',?),('theme',?),('admin_settings',?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      name,
      country,
      JSON.stringify(theme),
      signature,
    );
    if (currency)
      storage.sql.exec(
        "UPDATE catalog_state SET currency=?,version=version+1 WHERE id=1 AND currency<>?",
        currency,
        currency,
      );
    storage.sql.exec(
      `UPDATE settings SET value=json_set(value,'$.timeZone',?)
      WHERE key='receiving_schedule' AND json_valid(value) AND json_extract(value,'$.timeZone') IS NOT ?`,
      timeZone,
      timeZone,
    );
    if (previousTimeZone !== timeZone) moveDayPauses(storage, timeZone);
  });
}
