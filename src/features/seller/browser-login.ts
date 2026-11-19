import { api } from "../../shared/api";
import { checkResponse } from "../../shared/http-error";
import { commandHeaders } from "../../shared/shop-api";

export async function startCabinetLogin(signal: AbortSignal) {
  const response = await api.api.seller.cabinet.start.$post(
    { json: {} },
    { headers: commandHeaders(), init: { signal } },
  );
  await checkResponse(response);
  return response.json();
}

export async function finishCabinetLogin(exchange: string, signal: AbortSignal) {
  const response = await api.api.seller.cabinet.finish.$post(
    { json: { exchange } },
    { headers: commandHeaders(), init: { signal } },
  );
  await checkResponse(response);
  return response.status !== 202;
}
