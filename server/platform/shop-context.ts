import { type ShopContext, shopContextContract } from "../../src/shared/contracts/shop-context";
import { ApiError } from "../../src/shared/errors";
import { publicMediaOrigin } from "../modules/media/public-origin";
import { forwardToShop } from "../shop/forward";
import { applyDemoSeed } from "./demo-seed";
import { readFeatures } from "./features";
import { resolveShop } from "./resolve-shop";

const CONTEXT_TTL = 30_000;

// Only completed public snapshots survive across requests. Never cache sessions or permissions.
export class ShopContextCache {
  private readonly entries = new Map<string, { value: ShopContext; expires: number }>();

  constructor(private readonly now = () => Date.now()) {}

  invalidate(shopId: string) {
    this.entries.delete(shopId);
  }

  async read(
    request: Request,
    env: Pick<Env, "PLATFORM"> & Partial<Pick<Env, "APP_ENV" | "MEDIA_PUBLIC_URL">>,
    fresh = false,
  ): Promise<ShopContext> {
    const started = this.now();
    const shop = await resolveShop(request, env.PLATFORM, env.APP_ENV, fresh);
    if (!shop) throw new ApiError("SHOP_NOT_FOUND", "Магазин не найден");
    const adminSettings =
      shop.country && shop.timeZone
        ? shopContextContract.shape.adminSettings.parse({
            name: shop.name,
            country: shop.country,
            currency: shop.currency,
            timeZone: shop.timeZone,
            theme: shop.theme ? JSON.parse(shop.theme) : undefined,
          })
        : undefined;
    const mediaOrigin =
      env.MEDIA_PUBLIC_URL === undefined ? undefined : publicMediaOrigin(request, env.MEDIA_PUBLIC_URL);
    const hit = this.entries.get(shop.id);
    if (hit && hit.expires > this.now() && JSON.stringify(hit.value.adminSettings) === JSON.stringify(adminSettings))
      return { ...hit.value, status: shop.status, mediaOrigin };
    this.entries.delete(shop.id);
    await applyDemoSeed(env.PLATFORM, env.APP_ENV, shop.id);
    const features = await readFeatures(env.PLATFORM, shop.id);
    const response = await forwardToShop(
      { req: { raw: new Request("https://internal/api/shop") } },
      { ...shop, features, adminSettings },
    );
    if (!response.ok) throw new ApiError("INTERNAL", "Не удалось загрузить оформление магазина");
    const settings = shopContextContract.parse(await response.json());
    const value = shopContextContract.parse({
      ...shop,
      name: settings.name,
      timeZone: settings.timeZone,
      theme: settings.theme,
      features,
      adminSettings,
      mediaOrigin,
    });
    if (this.entries.size >= 500) this.entries.delete(this.entries.keys().next().value as string);
    this.entries.set(shop.id, { value, expires: started + CONTEXT_TTL });
    return value;
  }
}

export const shopContexts = new ShopContextCache();
