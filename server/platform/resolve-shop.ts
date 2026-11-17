import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { isDevelopmentHost } from "../development";
import { domains, type PlatformShop, shops } from "./schema";

const ttl = 30_000;
type CachedShop = { shop: PlatformShop; expires: number };
const memory = new Map<string, CachedShop>();
function remember(key: string, entry: CachedShop) {
  if (memory.size >= 500) memory.delete(memory.keys().next().value as string);
  memory.set(key, entry);
}

export async function resolveShop(
  request: Request,
  database: D1Database,
  namespace = "demo",
): Promise<PlatformShop | undefined> {
  const url = new URL(request.url);
  const slug = isDevelopmentHost(url.hostname) ? (url.searchParams.get("shop") ?? "lavka") : undefined;
  const key = `https://shop-resolution.invalid/v3/${namespace}/${slug ? `slug/${encodeURIComponent(slug)}` : `host/${url.hostname}`}`;
  const hit = memory.get(key);
  if (hit && hit.expires > Date.now()) return hit.shop;
  memory.delete(key);

  const cache = await caches.open("shop-resolution");
  const cached = await cache.match(key);
  if (cached) {
    const entry = await cached.json<CachedShop>();
    if (entry.expires > Date.now()) {
      remember(key, entry);
      return entry.shop;
    }
  }

  const db = drizzle(database);
  const shop = slug
    ? await db
        .select()
        .from(shops)
        .where(and(eq(shops.slug, slug), eq(shops.status, "active")))
        .get()
    : await db
        .select({ shop: shops })
        .from(domains)
        .innerJoin(shops, eq(domains.shopId, shops.id))
        .where(and(eq(domains.host, url.hostname), eq(shops.status, "active")))
        .get()
        .then((row) => row?.shop);
  if (shop) {
    const entry = { shop, expires: Date.now() + ttl };
    remember(key, entry);
    await cache.put(key, Response.json(entry, { headers: { "Cache-Control": "max-age=30" } }));
  }
  return shop;
}
