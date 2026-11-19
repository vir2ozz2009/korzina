import { isDevelopmentHost } from "../development";
import type { PlatformShop } from "./schema";

const ttl = 30_000;
type ResolvedShop = PlatformShop & {
  country: string | null;
  currency: string | null;
  timeZone: string | null;
  theme: string | null;
};
type CachedShop = { shop: ResolvedShop; expires: number };
const memory = new Map<string, CachedShop>();
function remember(key: string, entry: CachedShop) {
  if (memory.size >= 500) memory.delete(memory.keys().next().value as string);
  memory.set(key, entry);
}

export async function resolveShop(
  request: Request,
  database: D1Database,
  namespace = "demo",
  fresh = false,
): Promise<ResolvedShop | undefined> {
  const url = new URL(request.url);
  const slug = isDevelopmentHost(url.hostname) ? (url.searchParams.get("shop") ?? "lavka") : undefined;
  const key = `https://shop-resolution.invalid/v4/${namespace}/${slug ? `slug/${encodeURIComponent(slug)}` : `host/${url.hostname}`}`;
  const hit = fresh ? undefined : memory.get(key);
  if (hit && hit.expires > Date.now()) return hit.shop;
  memory.delete(key);

  const cache = await caches.open("shop-resolution");
  const cached = fresh ? undefined : await cache.match(key);
  if (cached) {
    const entry = await cached.json<CachedShop>();
    if (entry.expires > Date.now()) {
      remember(key, entry);
      return entry.shop;
    }
  }

  const source = fresh ? database.withSession("first-primary") : database;
  const columns =
    "s.id,s.slug,s.name,s.status,s.plan,s.created_at AS createdAt,s.country,s.currency,s.time_zone AS timeZone,s.theme";
  const open = "s.status IN ('draft','active','paused')";
  const shop = slug
    ? await source.prepare(`SELECT ${columns} FROM shops s WHERE s.slug=? AND ${open}`).bind(slug).first<ResolvedShop>()
    : await source
        .prepare(`SELECT ${columns} FROM domains d JOIN shops s ON s.id=d.shop_id WHERE d.host=? AND ${open}`)
        .bind(url.hostname)
        .first<ResolvedShop>();
  if (shop) {
    const entry = { shop, expires: Date.now() + ttl };
    remember(key, entry);
    await cache.put(key, Response.json(entry, { headers: { "Cache-Control": "max-age=30" } }));
  }
  return shop ?? undefined;
}
