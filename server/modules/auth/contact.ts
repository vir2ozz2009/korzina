import { isSupportedCountry, parsePhoneNumberFromString } from "libphonenumber-js";
import { ApiError } from "../../../src/shared/errors";

export function contactRegion(storage: DurableObjectStorage) {
  const region = storage.sql
    .exec<{ value: string }>("SELECT value FROM settings WHERE key='phone_region'")
    .toArray()[0]?.value;
  return region && isSupportedCountry(region) ? region : "VN";
}

export function readContact(storage: DurableObjectStorage, subject: string, kind: string) {
  const [row] = storage.sql
    .exec<{ phone: string | null }>("SELECT phone FROM carts WHERE customer=?", subject)
    .toArray();
  return { phone: row?.phone ?? null, telegramLinked: kind === "telegram" };
}

export function savePhone(storage: DurableObjectStorage, subject: string, kind: string, input: string) {
  const phone = parsePhoneNumberFromString(input, { defaultCountry: contactRegion(storage), extract: false });
  if (!phone?.isValid() || phone.ext) throw new ApiError("VALIDATION", "Введите номер телефона полностью");
  storage.sql.exec(
    `INSERT INTO carts(customer,phone,updated_at) VALUES(?,?,?)
     ON CONFLICT(customer) DO UPDATE SET phone=excluded.phone,revision=carts.revision+1,updated_at=excluded.updated_at
     WHERE carts.phone IS NOT excluded.phone`,
    subject,
    phone.number,
    Date.now(),
  );
  return { phone: phone.number, telegramLinked: kind === "telegram" };
}
