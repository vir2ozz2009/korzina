import { DurableObject } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { Hono } from "hono";
import { routePath } from "hono/route";
import type { BotChange } from "../../src/shared/contracts/admin";
import { launchReadiness } from "../../src/shared/contracts/launch";
import { shopContract } from "../../src/shared/contracts/shop";
import { shopContextContract } from "../../src/shared/contracts/shop-context";
import { ApiError, errorBody, errorStatus } from "../../src/shared/errors";
import { resolveFeatures } from "../../src/shared/flags";
import { decryptBotToken } from "../auth/bot-token";
import type { AuthSecrets } from "../auth/config";
import { verifyInitData } from "../auth/telegram";
import { RequestMetrics } from "../metrics";
import { handleError, notFound } from "../middleware/errors";
import { extendCustomerVisit } from "../modules/auth/service";
import { confirmBrowserBuyer, demoBuyerExchange, shopBuyerExchange } from "../modules/auth/telegram-exchange";
import { expireSalePauses, nextSaleDeadline } from "../modules/catalog/sale-pause";
import { type OpenDraftRequest, type OpenResponse, openDraft } from "../modules/launch/open";
import { launchSnapshot } from "../modules/launch/readiness";
import { publicMediaOrigin } from "../modules/media/public-origin";
import { signalSellerOrders } from "../modules/seller-orders/live";
import { sendOrderNotifications } from "../modules/seller-orders/notifications";
import { botCoordinator, changeShopBot, managedBot } from "../platform/admin/shop-bot";
import { notifyShopStatus, type ShopMutation } from "../platform/admin/shop-change";
import { managedShop } from "../platform/admin/shop-detail";
import { demoPlatformShop } from "../platform/auth/demo-telegram";
import { cleanupSellers, platformCleanupId } from "../platform/cleanup";
import { applyAdminSettings } from "./admin-settings";
import { rescheduleCleanup, scheduleCleanup } from "./cleanup";
import type { ShopEnv } from "./env";
import { cleanupShop } from "./maintenance";
import { migrations } from "./migrations";
import { hasPendingPlatformOrders, schedulePlatformOrders } from "./order-projection";
import { shopRoutes } from "./routes";
import { settings } from "./schema";

export class Shop extends DurableObject<Env> {
  private identity: string | undefined;
  private saleDeadline: number | null = null;
  private pendingOrders = false;
  private settingsSignature: string | undefined;
  private readonly router = new Hono<ShopEnv>()
    .onError(handleError)
    .use("*", async (c, next) => {
      const path = routePath(c, -1);
      if (path && !path.endsWith("*")) c.env.matchedRoute?.(path);
      await next();
    })
    .route("/api", shopRoutes())
    .notFound(notFound);

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      await migrate(drizzle(ctx.storage), migrations);
      this.saleDeadline = nextSaleDeadline(ctx.storage);
      this.pendingOrders = hasPendingPlatformOrders(ctx.storage);
      if (this.pendingOrders) await schedulePlatformOrders(ctx.storage);
      if (
        !ctx.storage.sql.exec("SELECT value FROM settings WHERE key='cleanup_revision' AND value='AD2'").toArray()
          .length
      ) {
        await rescheduleCleanup(ctx.storage, this.pendingOrders);
        ctx.storage.sql.exec(
          "INSERT INTO settings(key,value) VALUES('cleanup_revision','AD2') ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        );
      }
      await this.scheduleSaleDeadline();
    });
  }

  private async scheduleSaleDeadline() {
    if (this.saleDeadline === null) return;
    const current = await this.ctx.storage.getAlarm();
    if (this.saleDeadline !== null && (current === null || current > this.saleDeadline))
      await this.ctx.storage.setAlarm(this.saleDeadline);
  }

  private expireSales() {
    const now = Date.now();
    if (this.saleDeadline !== null && this.saleDeadline <= now)
      this.saleDeadline = expireSalePauses(this.ctx.storage, now);
  }

  async launchReadiness(shop: string) {
    if (!this.ctx.exports.Shop.idFromName(shop).equals(this.ctx.id)) throw new ApiError("FORBIDDEN", "Другой магазин");
    this.expireSales();
    return (await launchSnapshot(this.ctx.storage, this.env.PLATFORM, shop)).readiness;
  }

  async launchDraft(shop: string, input: OpenDraftRequest): Promise<OpenResponse> {
    if (!this.ctx.exports.Shop.idFromName(shop).equals(this.ctx.id))
      return { ok: false, code: "FORBIDDEN", message: "Другой магазин" };
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        this.expireSales();
        const result = await openDraft(this.ctx.storage, this.env.PLATFORM, shop, input, (version) => {
          if (input.via !== "admin") return;
          const send = async () => {
            const current = await managedShop(this.env.PLATFORM, shop);
            if (current.version === version)
              await notifyShopStatus(this.env.PLATFORM, current, "active", version, this.env.PLATFORM_BOT_TOKEN);
          };
          this.ctx.waitUntil(send().catch(() => {}));
        });
        return { ok: true as const, result };
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        return {
          ok: false,
          code: error.code,
          message: error.message,
          details: launchReadiness.safeParse(error.details).data,
        };
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const metrics = new RequestMetrics();
    const storage = metrics.storage(this.ctx.storage);
    const db = drizzle(storage);
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
      if (!this.ctx.exports.Shop.idFromName(shop.id).equals(this.ctx.id))
        throw new ApiError("FORBIDDEN", "Другой магазин");
      // The namespace/id check above runs on EVERY request. The persisted identity is immutable.
      if (!this.identity) {
        const identity = db.select({ value: settings.value }).from(settings).where(eq(settings.key, "shop_id")).get();
        if (identity && identity.value !== shop.id) throw new ApiError("FORBIDDEN", "Другой магазин");
        if (!identity)
          storage.transactionSync(() => db.insert(settings).values({ key: "shop_id", value: shop.id }).run());
        this.identity = shop.id;
      }
      let timeZone = typeof data.timeZone === "string" ? data.timeZone : undefined;
      if (data.adminSettings) {
        const configured = shopContextContract.shape.adminSettings.parse(data.adminSettings);
        timeZone ??= configured?.timeZone;
        const signature = JSON.stringify(configured);
        if (configured && signature !== this.settingsSignature) {
          applyAdminSettings(storage, configured);
          this.settingsSignature = signature;
          this.saleDeadline = nextSaleDeadline(storage);
          this.ctx.waitUntil(this.scheduleSaleDeadline());
        }
      }
      this.expireSales();
      response = await this.router.fetch(request, {
        shop,
        teamPreview: data.teamPreview === true && shop.status === "draft",
        timeZone,
        features: context.success ? context.data : resolveFeatures([]),
        db,
        storage,
        object: this.ctx,
        secrets: this.env as Env & AuthSecrets,
        platform: this.env.PLATFORM,
        media: {
          MEDIA: this.env.MEDIA,
          MEDIA_PUBLIC: this.env.MEDIA_PUBLIC,
          IMAGES: this.env.IMAGES,
          MEDIA_PUBLIC_URL: publicMediaOrigin(request, this.env.MEDIA_PUBLIC_URL),
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
    if ((request.method === "POST" || request.method === "PUT") && response.ok && metric.rowsWritten > 0) {
      const path = new URL(request.url).pathname;
      const orderChange = /^\/api\/(?:seller\/)?orders\/(\d+)\/(?:transition|cancel|proof)$/u.exec(path);
      if (path === "/api/checkout") {
        this.pendingOrders = true;
        await schedulePlatformOrders(this.ctx.storage);
        if (this.ctx.getWebSockets("seller-orders").length) {
          const { number } = await response.clone().json<{ number: number }>();
          this.ctx.waitUntil(signalSellerOrders(this.ctx, this.env.PLATFORM, number));
        }
      } else if (orderChange) {
        this.ctx.waitUntil(signalSellerOrders(this.ctx, this.env.PLATFORM, Number(orderChange[1])));
        await schedulePlatformOrders(this.ctx.storage);
        await scheduleCleanup(this.ctx.storage);
      } else {
        await scheduleCleanup(this.ctx.storage);
        if (path.startsWith("/api/seller/catalog/") || path === "/api/seller/profile/data") {
          if (path.startsWith("/api/seller/catalog/")) await schedulePlatformOrders(this.ctx.storage);
          this.saleDeadline = nextSaleDeadline(this.ctx.storage);
          await this.scheduleSaleDeadline();
        }
      }
    }
    // Only the public Worker can see these; it strips them before returning to the client.
    response.headers.set("x-korzina-sql", JSON.stringify(metric));
    return response;
  }

  closeSellerOrderSubscription(accountId: string) {
    for (const socket of this.ctx.getWebSockets(`seller:${accountId}`)) {
      if (socket.readyState === WebSocket.OPEN) socket.close(1008, "Access expired");
    }
  }

  async verifyCabinetTelegram(initData: string, shopId: string) {
    if (!this.ctx.exports.Shop.idFromName(shopId).equals(this.ctx.id))
      throw new ApiError("FORBIDDEN", "Другой магазин");
    const bot = await managedBot(this.env.PLATFORM, shopId);
    const setting = bot
      ? undefined
      : this.ctx.storage.sql
          .exec<{ value: string }>("SELECT value FROM settings WHERE key='telegram_bot_token'")
          .toArray()[0];
    const encrypted = bot?.token ?? setting?.value;
    if (!encrypted) return undefined;
    const token = await decryptBotToken(encrypted, shopId, (this.env as Env & AuthSecrets).ENCRYPTION_KEY);
    try {
      return (await verifyInitData(initData, token)).telegramId;
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== "UNAUTHORIZED") throw error;
    }
  }

  adminBotChange(mutation: ShopMutation, input: BotChange, origin: string) {
    if (!this.ctx.exports.Shop.idFromName(botCoordinator).equals(this.ctx.id))
      throw new ApiError("FORBIDDEN", "Нет доступа");
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        const result = await changeShopBot(this.env.PLATFORM, this.env as Env & AuthSecrets, mutation, input, origin);
        return { ok: true as const, result };
      } catch (error) {
        const known = error instanceof ApiError ? error : new ApiError("INTERNAL", "Не удалось настроить бота");
        return { ok: false as const, code: known.code, message: known.message };
      }
    });
  }

  async confirmBuyerTelegram(shopId: string, exchange: string, telegramId: string, name: string) {
    const isDemo = demoBuyerExchange.test(exchange);
    if (
      !this.ctx.exports.Shop.idFromName(shopId).equals(this.ctx.id) ||
      (isDemo ? this.env.APP_ENV !== "demo" || shopId !== demoPlatformShop : !shopBuyerExchange.test(exchange)) ||
      !/^[1-9][0-9]{0,15}$/.test(telegramId)
    )
      return undefined;
    return confirmBrowserBuyer(this.ctx.storage, exchange, telegramId, name);
  }

  adminShopStats() {
    const products = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM products").one().count;
    const hasOrders = this.ctx.storage.sql.exec("SELECT 1 FROM orders LIMIT 1").toArray().length > 0;
    return { products, hasOrders };
  }

  extendBuyerVisit(shopId: string, sessionId: string) {
    return (
      this.ctx.exports.Shop.idFromName(shopId).equals(this.ctx.id) && extendCustomerVisit(this.ctx.storage, sessionId)
    );
  }

  allowGeocoder(provider: "photon" | "nominatim") {
    if (!this.ctx.exports.Shop.idFromName("geocoder:osm").equals(this.ctx.id)) throw new Error("Wrong coordinator");
    const time = Date.now();
    return this.ctx.storage.transactionSync(() => {
      const key = `geocoder:${provider}`;
      const previous = this.ctx.storage.sql
        .exec<{ value: string }>("SELECT value FROM settings WHERE key=?", key)
        .toArray()[0];
      if (previous && time - Number(previous.value) < 1100) return false;
      this.ctx.storage.sql.exec(
        "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        key,
        String(time),
      );
      return true;
    });
  }

  async seedDemoCatalog(shopId: string) {
    if (this.env.APP_ENV === "production" || !this.ctx.exports.Shop.idFromName(shopId).equals(this.ctx.id))
      throw new ApiError("FORBIDDEN", "Сидирование недоступно");
    const { seedCatalog } = await import("../modules/catalog/seed");
    seedCatalog(this.ctx.storage);
  }

  async schedulePlatformCleanup() {
    if (!this.ctx.id.equals(this.ctx.exports.Shop.idFromName(platformCleanupId))) throw new Error("Wrong coordinator");
    await scheduleCleanup(this.ctx.storage);
  }

  async alarm() {
    if (this.ctx.id.equals(this.ctx.exports.Shop.idFromName(platformCleanupId))) {
      await cleanupSellers(this.env.PLATFORM, this.ctx.storage);
      return;
    }
    const projectOrders = this.pendingOrders;
    this.pendingOrders = false;
    try {
      this.expireSales();
      const more = await cleanupShop(this.ctx.storage, this.env, Date.now(), projectOrders);
      this.pendingOrders ||= more;
      if (this.pendingOrders) await schedulePlatformOrders(this.ctx.storage);
      await sendOrderNotifications(this.ctx.storage, this.env);
      await this.scheduleSaleDeadline();
    } catch (error) {
      this.pendingOrders ||= projectOrders;
      throw error;
    }
  }
}
