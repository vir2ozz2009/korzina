import type { ShopContext } from "../../src/shared/contracts/shop-context";
import { putSetting, recordStoreRevision, updateStoreTimeZone } from "./profile-settings";

export function applyAdminSettings(storage: DurableObjectStorage, settings: NonNullable<ShopContext["adminSettings"]>) {
  const { name, country, currency, timeZone, theme } = settings;
  const signature = JSON.stringify(settings);
  const active = storage.sql
    .exec<{ value: string }>("SELECT value FROM settings WHERE key='admin_settings'")
    .toArray()[0];
  if (active?.value === signature) return;
  const previous = active && (JSON.parse(active.value) as NonNullable<ShopContext["adminSettings"]>);
  storage.transactionSync(() => {
    const themeChanged = JSON.stringify(previous?.theme) !== JSON.stringify(theme);
    if (previous?.name !== name) putSetting(storage, "display_name", name);
    if (previous?.country !== country) putSetting(storage, "phone_region", country);
    if (themeChanged) putSetting(storage, "theme", JSON.stringify(theme));
    if (currency && previous?.currency !== currency)
      storage.sql.exec(
        "UPDATE catalog_state SET currency=?,version=version+1 WHERE id=1 AND currency<>?",
        currency,
        currency,
      );
    if (previous?.timeZone !== timeZone) updateStoreTimeZone(storage, timeZone);
    putSetting(storage, "admin_settings", signature);
    if (previous && themeChanged) recordStoreRevision(storage, "theme");
    if (
      previous &&
      (previous.name !== name ||
        previous.country !== country ||
        previous.currency !== currency ||
        previous.timeZone !== timeZone)
    )
      recordStoreRevision(storage, "profile");
  });
}
