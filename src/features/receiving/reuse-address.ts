import type { DeliveryAddress } from "../../shared/contracts/receiving";
import type { ReceivingState } from "./api";

export function canReuseAddress(address: DeliveryAddress, data: ReceivingState) {
  switch (data.delivery?.mode) {
    case "text":
      return true;
    case "map":
      return Boolean(address.point || address.acceptedWithoutPoint);
    case "districts":
      return !!data.delivery.districts?.some(({ id }) => id === address.districtId);
    default:
      return false;
  }
}

export function manualAddressError(draft: DeliveryAddress, data: ReceivingState, blocked: boolean) {
  const address = draft.address.trim();
  const zone = data.delivery?.mode === "map";
  if (!address || (zone && address.length < 3)) return "Укажите адрес доставки";
  if (blocked) return "Этот адрес уже проверен и находится вне зоны. Укажите другой адрес.";
  if (data.delivery?.districts?.length && !draft.districtId) return "Выберите район";
  if (!zone && data.requiredDetails.some((field) => !draft[field]?.trim())) return "Заполните обязательные поля";
}
