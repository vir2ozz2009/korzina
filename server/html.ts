import type { ShopContext } from "../src/shared/contracts/shop-context";
import { ApiError } from "../src/shared/errors";
import { DEFAULT_THEME, themeStyle } from "../src/shared/theme-presets";
import { shopContexts } from "./platform/shop-context";

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
      },
    })
    .transform(response);
  result.headers.set("Cache-Control", "no-store");
  result.headers.delete("ETag");
  return result;
}

export async function serveHtml(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const response = await env.ASSETS.fetch(request);
  if (!response.headers.get("Content-Type")?.includes("text/html") || !response.ok) return response;
  try {
    const context = await shopContexts.read(request, env);
    const isShop = !/^\/(seller|admin)(\/|$)/.test(url.pathname);
    return themedHtml(response, context, isShop);
  } catch (error) {
    const status = error instanceof ApiError && error.code === "SHOP_NOT_FOUND" ? 404 : 503;
    return new Response(status === 404 ? "Магазин не найден" : "Магазин временно недоступен. Обновите страницу.", {
      status,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
