import { exports } from "cloudflare:workers";
import { type ShopContext, shopContextContract } from "../src/shared/contracts/shop-context";
import { ApiError } from "../src/shared/errors";
import { DEFAULT_THEME, themeStyle } from "../src/shared/theme-presets";
import { cookieValue, customerCookie, sessionCookie } from "./auth/cookies";
import { tokenHash } from "./auth/tokens";
import { isDemoPath } from "./development";
import { customerTtl } from "./modules/auth/service";
import { shopContexts } from "./platform/shop-context";
import { hasTeamAccess } from "./platform/shop-preview";

export function themedHtml(response: Response, context: ShopContext, shopTheme: boolean): Response {
  const encoded = JSON.stringify(context).replace(/</g, "\\u003c");
  const result = new HTMLRewriter()
    .on("html", {
      element: (element) => {
        element.setAttribute("style", themeStyle(shopTheme ? context.theme : DEFAULT_THEME));
      },
    })
    .on("head", {
      element(element) {
        element.append(`<script id="shop-context" type="application/json">${encoded}</script>`, { html: true });
        const src = shopTheme && context.profile?.logo?.src;
        if (src) {
          const escaped = src.replace(/&/gu, "&amp;").replace(/"/gu, "&quot;").replace(/</gu, "&lt;");
          element.append(`<meta property="og:image" content="${escaped}">`, { html: true });
        }
      },
    })
    .on("title", {
      element: (element) => {
        if (shopTheme) element.setInnerContent(context.name);
      },
    })
    .transform(response);
  result.headers.set("Cache-Control", "no-store");
  result.headers.delete("ETag");
  return result;
}

export async function serveHtml(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (env.APP_ENV === "production" && isDemoPath(url.pathname)) {
    return new Response("Не найдено", { status: 404 });
  }
  const response = await env.ASSETS.fetch(request);
  if (!response.headers.get("Content-Type")?.includes("text/html") || !response.ok) return response;
  try {
    const isShop = !/^\/(seller|admin)(\/|$)/.test(url.pathname);
    const shop = await shopContexts.read(request, env, false, isShop, url.pathname === "/");
    const teamPreview = shop.status === "draft" && (await hasTeamAccess(request, env.PLATFORM, shop));
    const context =
      shop.status !== "draft"
        ? shop
        : teamPreview
          ? { ...shop, teamPreview }
          : shopContextContract.parse({
              id: shop.id,
              slug: shop.slug,
              status: shop.status,
              plan: shop.plan,
              createdAt: shop.createdAt,
              name: "Магазин",
              features: {},
              theme: DEFAULT_THEME,
            });
    const page = themedHtml(response, context, isShop);
    const name = customerCookie(context.id);
    const token = request.method === "GET" ? cookieValue(request, name) : undefined;
    if (token && /^[a-f0-9]{64}$/u.test(token)) {
      const shop = exports.Shop.get(exports.Shop.idFromName(context.id));
      const renewed = await shop.extendBuyerVisit(context.id, await tokenHash(token)).catch(() => false);
      if (renewed) page.headers.append("Set-Cookie", sessionCookie(request, name, token, customerTtl));
    }
    return page;
  } catch (error) {
    const status = error instanceof ApiError && error.code === "SHOP_NOT_FOUND" ? 404 : 503;
    return new Response(status === 404 ? "Магазин не найден" : "Магазин временно недоступен. Обновите страницу.", {
      status,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
