import { z } from "zod";
import { pointInput } from "../../../src/shared/contracts/receiving";
import { ApiError } from "../../../src/shared/errors";

const cityInput = z.object({
  name: z.string(),
  center: pointInput,
  boundary: z.array(pointInput).min(3).max(100).nullable(),
});

export async function deliveryCities(city: string, cache: Cache, permit: () => Promise<boolean>, request = fetch) {
  const normalized = city.normalize("NFC").replace(/\s+/gu, " ");
  const key = new Request(`https://geocoding.invalid/v2/city/${encodeURIComponent(normalized.toLowerCase())}`);
  const cached = await cache.match(key);
  if (cached) return cityInput.array().parse(await cached.json());
  if (!(await permit())) throw new ApiError("RATE_LIMITED", "Повторите поиск чуть позже");
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({
    city: normalized,
    format: "jsonv2",
    featureType: "city",
    polygon_geojson: "1",
    polygon_threshold: "0.001",
    limit: "5",
  }).toString();
  let rows: unknown[];
  try {
    const response = await request(url, {
      headers: { "User-Agent": "Korzina/1.0 (+https://demo.korzina.app)", "Accept-Language": "ru" },
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) throw new Error("City lookup unavailable");
    rows = z
      .array(z.unknown())
      .max(5)
      .parse(await response.json());
  } catch {
    throw new ApiError("GEOCODER_UNAVAILABLE", "Не удалось загрузить границу города");
  }
  const results = rows.flatMap((row) => {
    const result = osmCity.safeParse(row);
    if (!result.success) return [];
    const { display_name, lat, lon, geojson } = result.data;
    const parsedPolygon = polygon.safeParse(geojson);
    const boundary = parsedPolygon.success
      ? parsedPolygon.data.coordinates[0].slice(0, -1).map(([lon, lat]) => ({ lat, lon }))
      : null;
    const parsedCity = cityInput.safeParse({ name: display_name, center: { lat, lon }, boundary });
    if (parsedCity.success) return [parsedCity.data];
    const parsedCenter = cityInput.safeParse({ name: display_name, center: { lat, lon }, boundary: null });
    return parsedCenter.success ? [parsedCenter.data] : [];
  });
  await cache.put(key, Response.json(results, { headers: { "Cache-Control": "max-age=86400" } }));
  return results;
}

const osmCity = z.object({
  display_name: z.string().min(1).max(500),
  lat: z.coerce.number(),
  lon: z.coerce.number(),
  geojson: z.unknown().optional(),
});
const polygon = z.object({
  type: z.literal("Polygon"),
  coordinates: z.tuple([
    z
      .array(z.tuple([z.number(), z.number()]))
      .min(4)
      .max(101),
  ]),
});
