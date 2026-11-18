import { z } from "zod";
import { type GeocodeInput, type Point, pointInput } from "../../../src/shared/contracts/receiving";
import { ApiError } from "../../../src/shared/errors";

const candidate = pointInput.extend({ address: z.string().min(1).max(500) });
const resultsInput = z.array(candidate).max(5);
const text = z.string().max(200).optional();
const photonInput = z.object({
  features: z
    .array(
      z.object({
        geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
        properties: z.object({
          name: text,
          street: text,
          housenumber: text,
          city: text,
          district: text,
          state: text,
          country: text,
        }),
      }),
    )
    .max(5),
});
type Provider = "photon" | "nominatim";
type Permit = (provider: Provider) => Promise<boolean>;

function requestHeaders() {
  return { "User-Agent": "Korzina/1.0 (+https://demo.korzina.app)", "Accept-Language": "ru" };
}

async function resolvePhoton(input: GeocodeInput, request: typeof fetch) {
  const url = new URL(input.type === "search" ? "/api/" : "/reverse", "https://photon.komoot.io");
  url.search = new URLSearchParams(
    input.type === "search"
      ? { q: input.address, limit: "5", lang: "ru" }
      : { lat: String(input.point.lat), lon: String(input.point.lon), limit: "1", lang: "ru" },
  ).toString();
  const response = await request(url, { headers: requestHeaders(), signal: AbortSignal.timeout(3500) });
  if (!response.ok) throw new Error("Photon unavailable");
  return photonInput.parse(await response.json()).features.flatMap(({ geometry, properties }) => {
    const [lon, lat] = geometry.coordinates;
    const street = [properties.street ?? properties.name, properties.housenumber].filter(Boolean).join(" ");
    const address = [
      ...new Set([street, properties.district, properties.city, properties.state, properties.country].filter(Boolean)),
    ]
      .join(", ")
      .slice(0, 500);
    return address && pointInput.safeParse({ lat, lon }).success ? [{ address, lat, lon }] : [];
  });
}

async function resolveNominatim(point: Point, request: typeof fetch) {
  const url = new URL("/reverse", "https://nominatim.openstreetmap.org");
  url.search = new URLSearchParams({ lat: String(point.lat), lon: String(point.lon), format: "jsonv2" }).toString();
  const response = await request(url, { headers: requestHeaders(), signal: AbortSignal.timeout(3500) });
  if (!response.ok) throw new Error("Nominatim unavailable");
  const item = z
    .object({ display_name: z.string().min(1), lat: z.coerce.number(), lon: z.coerce.number() })
    .parse(await response.json());
  return [candidate.parse({ address: item.display_name.slice(0, 500), lat: item.lat, lon: item.lon })];
}

export async function geocodeAddress(
  shopId: string,
  input: GeocodeInput,
  cache: Cache,
  permit: Permit,
  request: typeof fetch = fetch,
) {
  const normalized: GeocodeInput =
    input.type === "search"
      ? { type: "search", address: input.address.normalize("NFC").trim().replace(/\s+/gu, " ") }
      : {
          type: "reverse",
          point: {
            lat: Math.round(input.point.lat * 100000) / 100000,
            lon: Math.round(input.point.lon * 100000) / 100000,
          },
        };
  const value = normalized.type === "search" ? normalized.address.toLowerCase() : JSON.stringify(normalized.point);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${shopId}\n${normalized.type}\n${value}`),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const key = new Request(`https://geocoding.invalid/v2/${hash}`);
  const cached = await cache.match(key);
  if (cached) return resultsInput.parse(await cached.json());
  if (!(await permit("photon"))) throw new ApiError("RATE_LIMITED", "Повторите поиск чуть позже");
  let results;
  try {
    results = await resolvePhoton(normalized, request);
  } catch {
    if (normalized.type !== "reverse" || !(await permit("nominatim")))
      throw new ApiError("GEOCODER_UNAVAILABLE", "Поиск адреса недоступен. Укажите адрес вручную.");
    try {
      results = await resolveNominatim(normalized.point, request);
    } catch {
      throw new ApiError("GEOCODER_UNAVAILABLE", "Поиск адреса недоступен. Укажите адрес вручную.");
    }
  }
  await cache.put(key, Response.json(results, { headers: { "Cache-Control": "max-age=86400" } }));
  return results;
}
