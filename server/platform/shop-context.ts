import { type ShopContext, shopContextContract } from "../../src/shared/contracts/shop-context";
import { ApiError } from "../../src/shared/errors";
import { readFeatures } from "./features";
import { resolveShop } from "./resolve-shop";

const CONTEXT_TTL = 30_000;

// Only completed public snapshots survive across requests. Never cache sessions or permissions.
export class ShopContextCache {
  private readonly entries = new Map<string, { value: ShopContext; expires: number }>();

  constructor(private readonly now = () => Date.now()) {}

  async read(
    request: Request,
    env: Pick<Env, "PLATFORM" | "SHOP"> & Partial<Pick<Env, "APP_ENV">>,
  ): Promise<ShopContext> {
    const started = this.now();
    const shop = await resolveShop(request, env.PLATFORM, env.APP_ENV);
    if (!shop) throw new ApiError("SHOP_NOT_FOUND", "Магазин не найден");
    const hit = this.entries.get(shop.id);
    if (hit && hit.expires > this.now()) return hit.value;
    this.entries.delete(shop.id);
    const [features, response] = await Promise.all([
      readFeatures(env.PLATFORM, shop.id),
      env.SHOP.get(env.SHOP.idFromName(shop.id)).fetch(
        new Request("https://internal/api/shop", {
          headers: { "x-korzina-shop": encodeURIComponent(JSON.stringify(shop)) },
        }),
      ),
    ]);
    if (!response.ok) throw new ApiError("INTERNAL", "Не удалось загрузить оформление магазина");
    const settings = shopContextContract.parse(await response.json());
    const value = shopContextContract.parse({ ...shop, name: settings.name, theme: settings.theme, features });
    if (this.entries.size >= 500) this.entries.delete(this.entries.keys().next().value as string);
    this.entries.set(shop.id, { value, expires: started + CONTEXT_TTL });
    return value;
  }
}

export const shopContexts = new ShopContextCache();
