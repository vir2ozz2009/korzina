import type { Page } from "@playwright/test";

export const day = "2099-11-22";

export async function cabinetFixture(page: Page, canReadOrders = true) {
  const shops = [
    { id: "first", slug: "test2", name: "Первый магазин", status: "active" },
    { id: "second", slug: "workday-draft", name: "Черновик магазина", status: "draft" },
  ].map((shop) => ({
    ...shop,
    role: "employee",
    teamRole: "manager",
    timeZone: "UTC",
    permissions: canReadOrders ? ["orders", "assembly"] : [],
  }));
  await page.route(/\/api\/seller\/cabinet(?:\?|$)/, (route) => {
    const url = new URL(route.request().url());
    const available = shops.map((shop) => ({
      ...shop,
      storefrontUrl: new URL(`/?shop=${shop.slug}`, url).href,
    }));
    return route.fulfill({
      json: {
        telegramId: "100",
        current: available.find(({ slug }) => slug === url.searchParams.get("store")) ?? available[0],
        shops: available,
      },
    });
  });
  await page.route(/\/api\/seller\/team\/bot\?/, (route) => route.fulfill({ json: { shopBot: null } }));
  await page.route(/\/api\/seller\/orders\/workday\?/, (route) =>
    route.fulfill({
      json: { rev: 7, day, timeZone: "UTC", count: 0, stages: {}, actions: {} },
    }),
  );
  await page.route(/\/api\/seller\/orders\/badge\?/, (route) => route.fulfill({ json: { rev: 7, count: 0 } }));
  const live = { tickets: 0, sockets: 0 };
  await page.route(/\/api\/seller\/orders\/live-ticket\?/, (route) => {
    live.tickets++;
    return route.fulfill({ json: { ticket: "workday-fixture" } });
  });
  await page.routeWebSocket(/\/api\/seller\/orders\/live\?/, (socket) => {
    live.sockets++;
    socket.send(JSON.stringify({ topic: "orders", cursor: 7 }));
  });
  return live;
}
