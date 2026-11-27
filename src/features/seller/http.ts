import { checkResponse } from "../../shared/http-error";
import { sellerSessionHeaders } from "./api";

// Adapters own URL/filter rules, caching, parsing and error recovery.
export async function sellerHttp(url: string | URL, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { ...sellerSessionHeaders(), ...init.headers },
  });
  await checkResponse(response);
  return response;
}
