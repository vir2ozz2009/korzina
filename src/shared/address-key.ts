import type { DeliveryAddress } from "./contracts/receiving";

export const savedAddressLimit = 10;

export function addressKey(value: DeliveryAddress) {
  return JSON.stringify([
    value.address.toLowerCase().trim().replace(/\s+/gu, " "),
    value.districtId,
    value.apartment,
    value.entrance,
    value.floor,
    value.intercom,
  ]);
}
