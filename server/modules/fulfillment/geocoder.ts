import { z } from "zod";
import { pointInput } from "../../../src/shared/contracts/fulfillment";
import { ApiError } from "../../../src/shared/errors";

export type GeocoderSecrets = { GEOAPIFY_API_KEY?: string };
const resultInput = z.object({ results: z.array(pointInput.extend({ formatted: z.string().min(1).max(500) })).max(1) });
const cacheSeconds = 86_400;

export async function geocodeAddress(
  shopId: string,
  address: string,
  apiKey: string | undefined,
  cache: Cache,
  request = fetch,
) {
  if (!apiKey) throw new ApiError("GEOCODER_UNAVAILABLE", "Поиск адреса недоступен. Укажите точку на карте.");
  const normalized = address.normalize("NFC").trim().replace(/\s+/gu, " ");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${shopId}\n${normalized.toLowerCase()}`),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const key = new Request(`https://geocoding.invalid/v1/${hash}`);
  const cached = await cache.match(key);
  if (cached) return resultInput.parse(await cached.json()).results[0] ?? null;

  const url = new URL("https://api.geoapify.com/v1/geocode/search");
  url.search = new URLSearchParams({ text: normalized, limit: "1", format: "json", lang: "ru", apiKey }).toString();
  let result: z.infer<typeof resultInput>;
  try {
    const response = await request(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error("Geoapify request failed");
    result = resultInput.parse(await response.json());
  } catch {
    throw new ApiError("GEOCODER_UNAVAILABLE", "Поиск адреса недоступен. Укажите точку на карте.");
  }
  await cache.put(key, Response.json(result, { headers: { "Cache-Control": `max-age=${cacheSeconds}` } }));
  return result.results[0] ?? null;
}
