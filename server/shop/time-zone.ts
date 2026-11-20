import { defaultShopTimeZone } from "../../src/shared/datetime";

export const shopTimeZoneSql = `COALESCE(
  (SELECT json_extract(value,'$.timeZone') FROM settings WHERE key='receiving_schedule' AND json_valid(value)),
  (SELECT json_extract(value,'$.timeZone') FROM settings WHERE key='admin_settings' AND json_valid(value)),
  '${defaultShopTimeZone}'
)`;
