import { expect, type Page, type Request } from "@playwright/test";
import { defaultParseSearch } from "@tanstack/react-router";
import { periodLabel } from "../../src/features/seller/ui/sales/dates";
import { anywhere, cabinet, configure, hours, placeOrder, resume, test, transition } from "./fixture";

const operations = "/api/seller/money/operations";
const live = /\/api\/seller\/orders\/live\?/;
const label = "Номер заказа или точная сумма";
const orderLabel = /^Заказ №(\d+) ·/;

// Delay only the first real orders frame to cover a live refresh arriving just after reconnect.
async function holdLiveRefresh(page: Page, mark: (event: string) => void) {
  let release: (() => void) | undefined;
  await page.routeWebSocket(live, (browser) => {
    const server = browser.connectToServer();
    server.onMessage((message) => {
      if (!release && typeof message === "string" && JSON.parse(message).topic === "orders") {
        mark("live-orders-held");
        release = () => {
          mark("live-orders-delivered");
          browser.send(message);
        };
      } else browser.send(message);
    });
  });
  return {
    ready: () => !!release,
    send: () => release?.(),
  };
}

test(
  "#280 · §3.6 и §5: поиск в «Операциях» ждёт явного повтора после сбоя сети",
  { tag: "@regression" },
  async ({ page, seller, rememberOrder }, info) => {
    const context = seller.context();
    const timeline: { ms: number; event: string; [key: string]: unknown }[] = [];
    const start = Date.now();
    const mark = (event: string, data: Record<string, unknown> = {}) =>
      timeline.push({ ms: Date.now() - start, event, ...data });
    const selected = (request: Request) => {
      const url = new URL(request.url());
      if (request.method() !== "GET" || url.pathname !== operations) return;
      const { store, from, to, search } = Object.fromEntries(url.searchParams);
      return { store, from, to, search };
    };
    seller.on("request", (request) => {
      const params = selected(request);
      if (params) mark("GET", params);
    });
    seller.on("requestfailed", (request) => {
      const params = selected(request);
      if (params) mark("GET failed", { ...params, error: request.failure()?.errorText });
    });
    seller.on("response", (response) => {
      const params = selected(response.request());
      if (params) mark("HTTP response", { ...params, status: response.status() });
    });
    await seller.exposeFunction("traceMoneySearch", mark);
    await seller.addInitScript(() => {
      const report = (event: string, data?: Record<string, unknown>) =>
        (
          window as unknown as { traceMoneySearch: (event: string, data?: Record<string, unknown>) => void }
        ).traceMoneySearch(event, data);
      const filters = () => {
        const params = new URLSearchParams(location.search);
        return {
          search: document.querySelector<HTMLInputElement>("search input")?.value,
          from: params.get("from"),
          to: params.get("to"),
        };
      };
      window.addEventListener("offline", () => report("browser offline", filters()));
      window.addEventListener("online", () => report("browser online", filters()));
      document.addEventListener(
        "click",
        (event) => {
          if (event.target instanceof Element && event.target.closest("button")?.textContent?.trim() === "Повторить")
            report("retry clicked", filters());
        },
        true,
      );
      let retryPresent = false;
      new MutationObserver(() => {
        const present = Array.from(document.querySelectorAll('[role="alert"] button')).some(
          (button) => button.textContent?.trim() === "Повторить",
        );
        if (present === retryPresent) return;
        retryPresent = present;
        report(present ? "retry appeared" : "retry disappeared", filters());
      }).observe(document, { childList: true, subtree: true });
    });
    const frame = await holdLiveRefresh(seller, mark);

    try {
      if (!process.env.E2E_BASE_URL) {
        await configure(seller.request, { delivery: anywhere, requiredDetails: [], minimumMinor: 120000 });
        await resume(seller.request);
        await hours(seller.request, "after_order");
        const order = await placeOrder(page);
        rememberOrder(order.number);
        await transition(seller.request, order.number, { action: "accept" });
        await transition(seller.request, order.number, {
          action: "recordPayment",
          method: "cash",
          amountMinor: order.totalMinor,
        });
      }
      await seller.goto(`/seller/money/operations?${cabinet}`);
      const revision = await seller
        .locator('meta[name="build-revision"]')
        .getAttribute("content")
        .catch(() => null);
      mark("build", { revision });
      await seller.getByRole("button", { name: "Период", exact: true }).click();
      await seller.getByRole("button", { name: "Последние 30 дней", exact: true }).click();
      const { from, to } = Object.fromEntries(new URL(seller.url()).searchParams);
      expect(from).toBeTruthy();
      expect(to).toBeTruthy();
      expect(from).not.toBe(to);
      const date = seller.getByText(periodLabel({ from, to }), { exact: true });
      const rows = seller.getByText(orderLabel);
      await expect(rows.first()).toBeVisible();
      const order = (await rows.first().textContent())?.match(orderLabel)?.[1];
      if (!order) throw new Error("Нет номера учебного заказа");
      const origin = await seller.evaluate(() => performance.timeOrigin);
      const search = seller.getByRole("textbox", { name: label });
      const error = seller.getByRole("alert").filter({ hasText: "Нет соединения" });
      const retry = error.getByRole("button", { name: "Повторить", exact: true });
      const matches = (request: Request) => {
        const params = selected(request);
        return params?.from === from && params?.to === to && params?.search === order;
      };
      await expect.poll(frame.ready).toBe(true);
      await context.setOffline(true);
      await search.fill(order);
      await expect(retry).toBeVisible();
      expect(timeline).toContainEqual(
        expect.objectContaining({
          event: "GET failed",
          from,
          to,
          search: order,
          error: "net::ERR_INTERNET_DISCONNECTED",
        }),
      );
      await expect(search).toHaveValue(order);
      await expect(date).toBeVisible();
      await expect(rows).toHaveCount(0);
      await expect(seller.getByText("Ничего не найдено")).toHaveCount(0);
      const selectedUrl = seller.url();
      expect(defaultParseSearch(new URL(selectedUrl).search).q).toBe(order);

      await context.setOffline(false);
      await expect.poll(() => timeline.some(({ event }) => event === "browser online")).toBe(true);
      const automatic = seller.waitForRequest(matches, { timeout: 700 }).catch(() => null);
      frame.send();
      const beforeClick = await automatic;
      if (await retry.isVisible()) {
        const response = seller.waitForResponse((item) => matches(item.request()) && item.status() === 200);
        await retry.click();
        await response;
      }
      await expect(error).toBeHidden();
      await expect(rows.first()).toBeVisible();
      expect((await rows.allTextContents()).map((text) => text.match(orderLabel)?.[1])).toEqual(
        Array(await rows.count()).fill(order),
      );
      await expect(search).toHaveValue(order);
      await expect(date).toBeVisible();
      await expect(seller).toHaveURL(selectedUrl);
      expect(await seller.evaluate(() => performance.timeOrigin)).toBe(origin);
      mark("filters and document unchanged", { from, to, search: order });
      expect(beforeClick, "Фоновое обновление запустило GET до нажатия «Повторить»").toBeNull();
      expect(timeline.filter(({ event }) => event === "retry clicked")).toHaveLength(1);
    } finally {
      await context.setOffline(false);
      const attachment = JSON.stringify(timeline, null, 2);
      await info.attach("money-operations-timeline.json", { body: attachment, contentType: "application/json" });
      for (const entry of timeline) console.log(`[#280] ${JSON.stringify(entry)}`);
      if (!process.env.E2E_BASE_URL) await hours(seller.request, "2");
    }
  },
);
