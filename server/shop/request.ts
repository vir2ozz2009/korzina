import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import type { Hono } from "hono";
import { shopContract } from "../../src/shared/contracts/shop";
import { shopContextContract } from "../../src/shared/contracts/shop-context";
import { ApiError, errorBody, errorStatus } from "../../src/shared/errors";
import { resolveFeatures } from "../../src/shared/flags";
import type { AuthSecrets } from "../auth/config";
import { RequestMetrics } from "../metrics";
import { publicMediaOrigin } from "../modules/media/public-origin";
import { scheduleCompositionDeadline } from "../modules/order-changes/deadline";
import { signalBuyerOrders } from "../modules/order-chat/live";
import { signalSellerOrders } from "../modules/seller-orders/live";
import { applyAdminSettings } from "./admin-settings";
import { ShopChanges } from "./changes";
import { scheduleCleanup } from "./cleanup";
import type { ShopEnv } from "./env";
import { schedulePlatformOrders } from "./order-projection";
import { settings } from "./schema";

export type ShopRequestState = { identity?: string; settingsSignature?: string };
type RequestEffects = {
  expireSales: () => void;
  orderPlaced: () => void;
  refreshSaleDeadline: (storage: DurableObjectStorage) => Promise<void>;
};

export async function handleShopRequest(
  request: Request,
  ctx: DurableObjectState,
  env: Env,
  router: Pick<Hono<ShopEnv>, "fetch">,
  state: ShopRequestState,
  { expireSales, orderPlaced, refreshSaleDeadline }: RequestEffects,
): Promise<Response> {
  const metrics = new RequestMetrics();
  const storage = metrics.storage(ctx.storage);
  const db = drizzle(storage);
  const changes = new ShopChanges();
  let response: Response;
  let shopId: string | undefined;
  let route = "unmatched";
  try {
    const metadata = request.headers.get("x-korzina-shop");
    if (!metadata) throw new ApiError("FORBIDDEN", "Нет магазина");
    const data = JSON.parse(decodeURIComponent(metadata));
    const parsed = shopContract.safeParse(data);
    if (!parsed.success) throw new ApiError("FORBIDDEN", "Нет магазина");
    const shop = parsed.data;
    const context = shopContextContract.shape.features.safeParse(data.features);
    shopId = shop.id;
    if (!ctx.exports.Shop.idFromName(shop.id).equals(ctx.id)) throw new ApiError("FORBIDDEN", "Другой магазин");
    // The namespace/id check above runs on EVERY request. The persisted identity is immutable.
    if (!state.identity) {
      const identity = db.select({ value: settings.value }).from(settings).where(eq(settings.key, "shop_id")).get();
      if (identity && identity.value !== shop.id) throw new ApiError("FORBIDDEN", "Другой магазин");
      if (!identity)
        storage.transactionSync(() => db.insert(settings).values({ key: "shop_id", value: shop.id }).run());
      state.identity = shop.id;
    }
    let timeZone = typeof data.timeZone === "string" ? data.timeZone : undefined;
    if (data.adminSettings) {
      const configured = shopContextContract.shape.adminSettings.parse(data.adminSettings);
      timeZone ??= configured?.timeZone;
      const signature = JSON.stringify(configured);
      if (configured && signature !== state.settingsSignature) {
        applyAdminSettings(storage, configured);
        state.settingsSignature = signature;
        ctx.waitUntil(refreshSaleDeadline(storage));
      }
    }
    expireSales();
    response = await router.fetch(request, {
      shop,
      changes,
      teamPreview: data.teamPreview === true && shop.status === "draft",
      timeZone,
      // Malformed internal feature metadata cannot enable promotions.
      features: context.success ? context.data : resolveFeatures([{ key: "promotions", enabled: false }]),
      db,
      storage,
      object: ctx,
      secrets: env as Env & AuthSecrets,
      platform: env.PLATFORM,
      media: {
        MEDIA: env.MEDIA,
        MEDIA_PUBLIC: env.MEDIA_PUBLIC,
        IMAGES: env.IMAGES,
        MEDIA_PUBLIC_URL: publicMediaOrigin(request, env.MEDIA_PUBLIC_URL),
      },
      matchedRoute: (path) => {
        route = path;
      },
    });
  } catch (error) {
    const known = error instanceof ApiError ? error : new ApiError("INTERNAL", "Внутренняя ошибка сервера");
    response = Response.json(errorBody(known), { status: errorStatus[known.code] });
  }
  if (response.status === 101) return response;
  const metric = metrics.record(
    route,
    shopId,
    request.headers.get("x-request-id") ?? "internal",
    response.status,
    false,
  );
  if (response.ok) {
    if (changes.placed) orderPlaced();
    if (changes.compositionDueAt !== undefined)
      await scheduleCompositionDeadline(ctx.storage, changes.compositionDueAt);
    for (const number of changes.orders) {
      signalBuyerOrders(ctx, number);
      ctx.waitUntil(signalSellerOrders(ctx, env.PLATFORM, number));
    }
    if (changes.orders.size) await schedulePlatformOrders(ctx.storage);
    const wrote = (request.method === "POST" || request.method === "PUT") && metric.rowsWritten > 0;
    if (!changes.placed && (changes.orders.size || changes.catalogChanged || changes.settingsChanged || wrote))
      await scheduleCleanup(ctx.storage);
    if (
      changes.catalogChanged &&
      storage.sql.exec("SELECT 1 FROM workday_notice WHERE expanded=0 AND kind='stock' LIMIT 1").toArray().length
    )
      await schedulePlatformOrders(storage);
    if (changes.catalogChanged || changes.settingsChanged) await refreshSaleDeadline(ctx.storage);
  }
  // Only the public Worker can see these; it strips them before returning to the client.
  response.headers.set("x-korzina-sql", JSON.stringify(metric));
  return response;
}
