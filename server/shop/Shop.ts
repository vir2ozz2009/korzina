import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { Hono } from "hono";
import { routePath } from "hono/route";
import type { BotChange } from "../../src/shared/contracts/admin";
import { launchReadiness } from "../../src/shared/contracts/launch";
import { ApiError } from "../../src/shared/errors";
import type { AuthSecrets } from "../auth/config";
import { handleError, notFound } from "../middleware/errors";
import { extendCustomerVisit } from "../modules/auth/service";
import { confirmBrowserBuyer, shopBuyerExchange } from "../modules/auth/telegram-exchange";
import { expireSalePauses, nextSaleDeadline } from "../modules/catalog/sale-pause";
import { type OpenDraftRequest, type OpenResponse, openDraft } from "../modules/launch/open";
import { launchSnapshot } from "../modules/launch/readiness";
import { expireCompositionChanges, scheduleCompositionDeadline } from "../modules/order-changes/deadline";
import { signalBuyerOrders } from "../modules/order-chat/live";
import { signalSellerOrders } from "../modules/seller-orders/live";
import { sendOrderNotifications } from "../modules/seller-orders/notifications";
import { botCoordinator, changeShopBot } from "../platform/admin/shop-bot";
import { notifyShopStatus, type ShopMutation } from "../platform/admin/shop-change";
import { managedShop } from "../platform/admin/shop-detail";
import { cleanupSellers, platformCleanupId } from "../platform/cleanup";
import { rescheduleCleanup, scheduleCleanup } from "./cleanup";
import type { ShopEnv } from "./env";
import { cleanupShop } from "./maintenance";
import { migrations } from "./migrations";
import { hasPendingPlatformOrders, schedulePlatformOrders } from "./order-projection";
import { handleShopRequest, type ShopRequestState } from "./request";
import { shopRoutes } from "./routes";

export class Shop extends DurableObject<Env> {
  private readonly requestState: ShopRequestState = {};
  private saleDeadline: number | null = null;
  private pendingOrders = false;
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
      await scheduleCompositionDeadline(ctx.storage);
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
              await notifyShopStatus(this.env.PLATFORM, current, "active", version, this.env as Env & AuthSecrets);
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

  fetch(request: Request): Promise<Response> {
    return handleShopRequest(request, this.ctx, this.env, this.router, this.requestState, {
      expireSales: () => this.expireSales(),
      orderPlaced: () => {
        this.pendingOrders = true;
      },
      refreshSaleDeadline: (storage) => {
        this.saleDeadline = nextSaleDeadline(storage);
        return this.scheduleSaleDeadline();
      },
    });
  }

  closeSellerOrderSubscription(accountId: string) {
    for (const socket of this.ctx.getWebSockets(`seller:${accountId}`)) {
      if (socket.readyState === WebSocket.OPEN) socket.close(1008, "Access expired");
    }
  }

  async adminBotChange(mutation: ShopMutation, input: BotChange, origin: string) {
    if (!this.ctx.exports.Shop.idFromName(botCoordinator).equals(this.ctx.id))
      throw new ApiError("FORBIDDEN", "Нет доступа");
    try {
      const result = await changeShopBot(
        this.env.PLATFORM,
        this.env as Env & AuthSecrets,
        mutation,
        input,
        origin,
        (operation) => this.ctx.blockConcurrencyWhile(operation),
      );
      return { ok: true as const, result };
    } catch (error) {
      const known = error instanceof ApiError ? error : new ApiError("INTERNAL", "Не удалось настроить бота");
      return { ok: false as const, code: known.code, message: known.message };
    }
  }

  async confirmBuyerTelegram(shopId: string, exchange: string, telegramId: string, name: string) {
    if (
      !this.ctx.exports.Shop.idFromName(shopId).equals(this.ctx.id) ||
      !shopBuyerExchange.test(exchange) ||
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
    if (this.env.APP_ENV === "preview" && shopId === "korzina-demo-test2") {
      const { seedPreviewPromos } = await import("../modules/promo/preview");
      seedPreviewPromos(this.ctx.storage);
    }
  }

  async schedulePlatformCleanup() {
    if (!this.ctx.id.equals(this.ctx.exports.Shop.idFromName(platformCleanupId))) throw new Error("Wrong coordinator");
    await scheduleCleanup(this.ctx.storage);
  }

  protected dispatchOrderNotifications() {
    return sendOrderNotifications(this.ctx.storage, this.env);
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
      expireCompositionChanges(this.ctx.storage, Date.now(), (number) => {
        signalBuyerOrders(this.ctx, number);
        this.ctx.waitUntil(signalSellerOrders(this.ctx, this.env.PLATFORM, number));
      });
      await this.dispatchOrderNotifications();
      await scheduleCompositionDeadline(this.ctx.storage);
      await this.scheduleSaleDeadline();
    } catch (error) {
      this.pendingOrders ||= projectOrders;
      throw error;
    }
  }
}
